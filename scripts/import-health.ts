// Turns an Apple Health export into data/health.json (git-ignored, never built into dist/).
// Usage: npm run health -- <path to export.zip>
// Reads only apple_health_export/export.xml from the zip. Prints dates and counts, never measured values.
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { HEALTH_DATA_FILE } from "../plugins/personal-data.ts";
import type { HealthDay } from "../src/core/types.ts";
import { ExportReadError, exportXmlLines, importLines } from "./health/read-export.ts";
import { writeJsonAtomically } from "./write-dataset.ts";

const DATA_FILE = "data/health.json";
const PROGRESS_EVERY = 1_000_000;
const count = (n: number) => n.toLocaleString("en-US");

const MEASURES: [label: string, key: keyof Omit<HealthDay, "date">][] = [
  ["Steps", "steps"],
  ["Distance", "distance_km"],
  ["Active calories", "active_kcal"],
  ["Exercise", "exercise_min"],
  ["Sleep", "sleep_min"],
];

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("Usage: npm run health -- <path to export.zip>");
  process.exit(1);
}

let progressShown = false;
try {
  const dataset = await importLines(exportXmlLines(zipPath), new Date(), (linesRead) => {
    if (linesRead % PROGRESS_EVERY === 0) {
      progressShown = true;
      process.stdout.write(`\rRead ${count(linesRead)} lines…`);
    }
  });
  if (progressShown) process.stdout.write("\n");
  await mkdir(dirname(HEALTH_DATA_FILE), { recursive: true });
  await writeJsonAtomically(HEALTH_DATA_FILE, dataset);
  console.log(`Imported ${count(dataset.days.length)} days → ${DATA_FILE}`);
  for (const [label, key] of MEASURES) {
    const dates = dataset.days.filter((d) => d[key] !== undefined).map((d) => d.date);
    console.log(`${label}: ${dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : "none"}`);
  }
} catch (error) {
  if (progressShown) process.stdout.write("\n");
  if (error instanceof ExportReadError) {
    console.error("Couldn't read apple_health_export/export.xml from that file. Use the zip from Health → your profile → Export All Health Data.");
  } else if (error instanceof Error) {
    console.error(error.message); // dates and record types only, never values
  } else {
    throw error;
  }
  // Not process.exit: it can cut off stderr when that is a pipe.
  process.exitCode = 1;
}
