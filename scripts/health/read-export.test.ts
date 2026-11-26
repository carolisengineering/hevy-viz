import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExportReadError, exportXmlLines, importLines, parseLine } from "./read-export.ts";

const device = (model: string) =>
  `device="&lt;&lt;HKDevice: 0x1&gt;, name:Apple Watch, manufacturer:Apple Inc., model:${model}, hardware:Watch6,1&gt;"`;
const step = (extra = "", unit = "count") =>
  `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Test Watch" ${extra} unit="${unit}" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:10:00 -0600" value="412"/>`;
const sleepLine = (value: string) =>
  `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2025-03-03 23:00:00 -0600" endDate="2025-03-04 06:00:00 -0600" value="${value}"/>`;

async function* gen(lines: string[]) {
  for (const l of lines) yield l;
}

describe("parseLine", () => {
  it("parses a Watch StepCount record", () => {
    expect(parseLine(`  ${step(device("Watch"))}`)).toEqual({
      kind: "quantity",
      type: "steps",
      source: "Test Watch",
      watch: true,
      start: "2025-03-04 09:00:00",
      end: "2025-03-04 09:10:00",
      value: 412,
      unit: "count",
    });
  });

  it("marks an iPhone or deviceless record as not Watch", () => {
    expect(parseLine(step(device("iPhone")))).toMatchObject({ watch: false });
    expect(parseLine(step())).toMatchObject({ watch: false });
  });

  it("parses self-closing tags and tags that open children", () => {
    expect(parseLine(step())).not.toBeNull();
    expect(parseLine(step().replace("/>", ">"))).not.toBeNull();
  });

  it("decodes named and numeric entities in sourceName", () => {
    const line = `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="A &amp; B&#8217;s &#x41;" unit="count" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:10:00 -0600" value="1"/>`;
    expect(parseLine(line)).toMatchObject({ source: "A & B’s A" });
  });

  it("parses distance in km and mi", () => {
    const line = (unit: string) =>
      `<Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="P" unit="${unit}" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:10:00 -0600" value="1.5"/>`;
    expect(parseLine(line("km"))).toMatchObject({ type: "distance", value: 1.5, unit: "km" });
    expect(parseLine(line("mi"))).toMatchObject({ type: "distance", unit: "mi" });
  });

  it("reads sleep values", () => {
    expect(parseLine(sleepLine("HKCategoryValueSleepAnalysisAsleepREM"))).toEqual({
      kind: "sleep",
      source: "Watch",
      start: "2025-03-03 23:00:00",
      end: "2025-03-04 06:00:00",
      asleep: true,
    });
    expect(parseLine(sleepLine("HKCategoryValueSleepAnalysisInBed"))).toMatchObject({ asleep: false });
    expect(parseLine(sleepLine("HKCategoryValueSleepAnalysisAwake"))).toMatchObject({ asleep: false });
  });

  it("parses ActivitySummary and ExportDate", () => {
    expect(
      parseLine(
        `<ActivitySummary dateComponents="2025-03-04" activeEnergyBurned="512.5" activeEnergyBurnedGoal="600" activeEnergyBurnedUnit="kcal" appleExerciseTime="31" appleStandHours="10"/>`,
      ),
    ).toEqual({ kind: "summary", date: "2025-03-04", activeEnergy: 512.5, activeEnergyUnit: "kcal", exerciseMin: 31 });
    expect(parseLine(`<ExportDate value="2026-11-25 10:30:00 -0600"/>`)).toEqual({ kind: "exportDate", date: "2026-11-25" });
  });

  it("returns null for anything else", () => {
    expect(parseLine(`<Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" value="60"/>`)).toBeNull();
    expect(parseLine(`<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="30"/>`)).toBeNull();
    expect(parseLine(`<ClinicalRecord type="x"/>`)).toBeNull();
    expect(parseLine(`<MetadataEntry key="k" value="v"/>`)).toBeNull();
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
  });

  it("throws on an unknown distance unit, naming the record type but not the value", () => {
    const line = `<Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="P" unit="m" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:10:00 -0600" value="1500"/>`;
    expect(() => parseLine(line)).toThrow(/DistanceWalkingRunning.*unit/);
    expect(() => parseLine(line)).not.toThrow(/1500/);
  });

  it("throws on an unknown steps unit and an unknown energy unit", () => {
    expect(() => parseLine(step("", "kg"))).toThrow(/StepCount.*unit/);
    expect(() =>
      parseLine(`<ActivitySummary dateComponents="2025-03-04" activeEnergyBurned="5" activeEnergyBurnedUnit="J" appleExerciseTime="3"/>`),
    ).toThrow(/ActivitySummary.*unit/);
  });

  it("throws on a malformed date without echoing it", () => {
    const line = step().replace("2025-03-04 09:00:00 -0600", "04/03/2025 9am");
    expect(() => parseLine(line)).toThrow(/StepCount.*date/);
    expect(() => parseLine(line)).not.toThrow(/9am/);
    expect(() => parseLine(`<ExportDate value="yesterday"/>`)).toThrow(/ExportDate.*date/);
  });
});

describe("importLines", () => {
  const doc = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<HealthData locale="en_US">`,
    ` <ExportDate value="2026-11-25 10:30:00 -0600"/>`,
    ` ${step(device("Watch"))}`,
    ` <Record type="HKQuantityTypeIdentifierDistanceWalkingRunning" sourceName="Test Watch" ${device("Watch")} unit="mi" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:10:00 -0600" value="1"/>`,
    ` ${sleepLine("HKCategoryValueSleepAnalysisAsleepCore")}`,
    ` ${sleepLine("HKCategoryValueSleepAnalysisInBed")}`,
    ` <Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:00:00 -0600" value="60"/>`,
    ` <Workout workoutActivityType="x" duration="30">`,
    `  <MetadataEntry key="k" value="v"/>`,
    ` </Workout>`,
    ` <ActivitySummary dateComponents="2025-03-04" activeEnergyBurned="500" activeEnergyBurnedUnit="kcal" appleExerciseTime="30"/>`,
  ];

  it("aggregates the wanted lines into a dataset", async () => {
    const progress: number[] = [];
    const dataset = await importLines(gen(doc), new Date("2026-11-25T17:00:00Z"), (n) => progress.push(n));
    expect(dataset).toEqual({
      source: "apple-health",
      imported_at: "2026-11-25T17:00:00.000Z",
      export_date: "2026-11-25",
      days: [{ date: "2025-03-04", steps: 412, distance_km: 1.61, active_kcal: 500, exercise_min: 30, sleep_min: 420 }],
    });
    expect(progress.at(-1)).toBe(doc.length);
  });

  it("refuses an export with no ExportDate line, naming no values", async () => {
    await expect(importLines(gen(doc.filter((l) => !l.includes("<ExportDate"))), new Date())).rejects.toThrow(
      "The export has no export date, so nothing was written.",
    );
  });

  it("refuses an export with no wanted records", async () => {
    await expect(importLines(gen([doc[0]!, doc[2]!]), new Date())).rejects.toThrow("The export has no days of data, so nothing was written.");
  });

  it("lets a parse error propagate with the line number", async () => {
    await expect(importLines(gen([doc[0]!, step("", "kg")]), new Date())).rejects.toThrow(/line 2.*StepCount.*unit/i);
  });
});

describe("exportXmlLines", () => {
  const dirs: string[] = [];
  const temp = async () => {
    const dir = await mkdtemp(join(tmpdir(), "read-export-"));
    dirs.push(dir);
    return dir;
  };
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });
  const collect = async (it: AsyncIterable<string>) => {
    const out: string[] = [];
    for await (const l of it) out.push(l);
    return out;
  };

  it("streams the lines of apple_health_export/export.xml", async () => {
    const dir = await temp();
    await mkdir(join(dir, "src/apple_health_export"), { recursive: true });
    await writeFile(join(dir, "src/apple_health_export/export.xml"), "one\ntwo\nthree\n");
    const zip = join(dir, "export.zip");
    expect(spawnSync("zip", ["-qr", zip, "apple_health_export"], { cwd: join(dir, "src") }).status).toBe(0);
    expect(await collect(exportXmlLines(zip))).toEqual(["one", "two", "three"]);
  });

  it("rejects when the entry is missing", async () => {
    const dir = await temp();
    await mkdir(join(dir, "src"));
    await writeFile(join(dir, "src/other.xml"), "x\n");
    const zip = join(dir, "export.zip");
    expect(spawnSync("zip", ["-qr", zip, "other.xml"], { cwd: join(dir, "src") }).status).toBe(0);
    await expect(collect(exportXmlLines(zip))).rejects.toBeInstanceOf(ExportReadError);
  });

  it("rejects when the file is not a zip or does not exist", async () => {
    const dir = await temp();
    const file = join(dir, "not.zip");
    await writeFile(file, "plain text");
    await expect(collect(exportXmlLines(file))).rejects.toBeInstanceOf(ExportReadError);
    await expect(collect(exportXmlLines(join(dir, "missing.zip")))).rejects.toBeInstanceOf(ExportReadError);
  });
});
