// Writes data/hevy.json without ever leaving it half-written. Kept apart from
// sync-hevy.ts, which runs on import, so it can be tested.
import { rename, rm, writeFile } from "node:fs/promises";
import type { HevyDataset } from "../src/core/types.ts";

/** Writes `${file}.tmp` beside `file`, then renames it over `file`. On any failure removes the temp file and rethrows. */
export async function writeDatasetAtomically(file: string, dataset: HevyDataset): Promise<void> {
  const json = JSON.stringify(dataset); // encode first: nothing is touched if this throws
  const temp = `${file}.tmp`;
  try {
    await writeFile(temp, json);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {}); // the original error matters more
    throw error;
  }
}
