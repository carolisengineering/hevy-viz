// Reads Apple Health's export.xml. Apple writes every element's start tag on a
// single line, so a line scan finds the wanted elements without an XML library.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { HealthDataset } from "../../src/core/types.ts";
import { HealthAggregator, type HealthRecord } from "./aggregate.ts";

export class ExportReadError extends Error {}

export type ParsedLine = HealthRecord | { kind: "exportDate"; date: string };

const PREFIXES = {
  steps: '<Record type="HKQuantityTypeIdentifierStepCount"',
  distance: '<Record type="HKQuantityTypeIdentifierDistanceWalkingRunning"',
  sleep: '<Record type="HKCategoryTypeIdentifierSleepAnalysis"',
  summary: "<ActivitySummary ",
  exportDate: "<ExportDate ",
} as const;
const NAMES = { steps: "StepCount", distance: "DistanceWalkingRunning", sleep: "SleepAnalysis", summary: "ActivitySummary", exportDate: "ExportDate" } as const;
const DATE_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (text: string) =>
  text.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(\w+));/g, (whole, hex?: string, dec?: string, name?: string) => {
    if (hex || dec) return String.fromCodePoint(hex ? parseInt(hex, 16) : parseInt(dec!, 10));
    return ENTITIES[name!] ?? whole;
  });

function attributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [, name, value] of line.matchAll(/(\w+)="([^"]*)"/g)) attrs[name!] = decode(value!);
  return attrs;
}

const fail = (record: keyof typeof NAMES, problem: string): never => {
  throw new Error(`Unreadable ${NAMES[record]} record: ${problem}`);
};
const wall = (record: keyof typeof NAMES, value: string | undefined): string =>
  value !== undefined && DATE_TIME.test(value) ? value.slice(0, 19) : fail(record, "a date is not in the form YYYY-MM-DD HH:MM:SS ±HHMM");
const day = (record: keyof typeof NAMES, value: string | undefined): string =>
  value !== undefined && DAY.test(value) ? value : fail(record, "a date is not in the form YYYY-MM-DD");
const num = (record: keyof typeof NAMES, name: string, value: string | undefined): number => {
  const n = value === undefined || value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(n) ? n : fail(record, `${name} is missing or not a number`);
};

/** The record a line of export.xml holds, or null for any other line. Parses only the wanted tags. Throws on a wanted line it can't read. */
export function parseLine(line: string): ParsedLine | null {
  const text = line.trim();
  if (!text.startsWith("<")) return null;

  if (text.startsWith(PREFIXES.exportDate)) {
    const value = attributes(text).value;
    return { kind: "exportDate", date: wall("exportDate", value).slice(0, 10) };
  }
  if (text.startsWith(PREFIXES.summary)) {
    const a = attributes(text);
    const unit = a.activeEnergyBurnedUnit;
    if (unit !== "Cal" && unit !== "kcal" && unit !== "kJ") fail("summary", "unit is not Cal, kcal or kJ");
    return {
      kind: "summary",
      date: day("summary", a.dateComponents),
      activeEnergy: num("summary", "activeEnergyBurned", a.activeEnergyBurned),
      activeEnergyUnit: unit!,
      exerciseMin: num("summary", "appleExerciseTime", a.appleExerciseTime),
    };
  }
  if (text.startsWith(PREFIXES.sleep)) {
    const a = attributes(text);
    return {
      kind: "sleep",
      source: a.sourceName ?? "",
      start: wall("sleep", a.startDate),
      end: wall("sleep", a.endDate),
      asleep: (a.value ?? "").startsWith("HKCategoryValueSleepAnalysisAsleep"),
    };
  }
  for (const type of ["steps", "distance"] as const) {
    if (!text.startsWith(PREFIXES[type])) continue;
    const a = attributes(text);
    const unit = a.unit;
    if (type === "steps" ? unit !== "count" : unit !== "km" && unit !== "mi") fail(type, `unit is not ${type === "steps" ? "count" : "km or mi"}`);
    return {
      kind: "quantity",
      type,
      source: a.sourceName ?? "",
      watch: /model:Watch/.test(a.device ?? ""),
      start: wall(type, a.startDate),
      end: wall(type, a.endDate),
      value: num(type, "value", a.value),
      unit: unit!,
    };
  }
  return null;
}

/** Feeds every wanted line of `lines` to an aggregator; returns the dataset (imported_at from `now`). */
export async function importLines(lines: AsyncIterable<string>, now: Date, onProgress?: (linesRead: number) => void): Promise<HealthDataset> {
  const aggregator = new HealthAggregator();
  let exportDate = "";
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber++;
    let parsed: ParsedLine | null;
    try {
      parsed = parseLine(line);
    } catch (error) {
      throw new Error(`Line ${lineNumber.toLocaleString("en-US")}: ${(error as Error).message}`);
    }
    if (parsed?.kind === "exportDate") exportDate = parsed.date;
    else if (parsed) aggregator.add(parsed);
    onProgress?.(lineNumber);
  }
  const days = aggregator.days();
  // Refuse rather than write a file the views can't use, or one that blanks a good import.
  if (!exportDate) throw new Error("The export has no export date, so nothing was written.");
  if (days.length === 0) throw new Error("The export has no days of data, so nothing was written.");
  return { source: "apple-health", imported_at: now.toISOString(), export_date: exportDate, days };
}

/** The lines of apple_health_export/export.xml inside `zipPath`, streamed through `unzip -p`. Rejects with ExportReadError if unzip fails or the entry is missing. */
export async function* exportXmlLines(zipPath: string): AsyncGenerator<string> {
  const child = spawn("unzip", ["-p", zipPath, "apple_health_export/export.xml"], { stdio: ["ignore", "pipe", "ignore"] });
  const done = new Promise<number | null>((resolve, reject) => {
    child.once("error", () => reject(new ExportReadError("Couldn't run unzip.")));
    child.once("close", resolve);
  });
  done.catch(() => {}); // surfaced below; don't leave it unhandled while lines stream
  let finished = false;
  try {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) yield line;
    const code = await done;
    finished = true;
    if (code !== 0) throw new ExportReadError("unzip could not read apple_health_export/export.xml.");
  } catch (error) {
    finished = true;
    throw error;
  } finally {
    if (!finished) child.kill();
  }
}
