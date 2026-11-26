import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { HevyDataset } from "../src/core/types.ts";
import { writeDatasetAtomically, writeJsonAtomically } from "./write-dataset.ts";

const dataset = (synced_at: string): HevyDataset => ({ source: "hevy", synced_at, workouts: [], exercise_templates: [] });
const made: string[] = [];
const freshDir = async () => {
  const dir = await mkdtemp(join(tmpdir(), "write-dataset-"));
  made.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("writeDatasetAtomically", () => {
  it("writes the dataset", async () => {
    const file = join(await freshDir(), "hevy.json");
    await writeDatasetAtomically(file, dataset("2026-11-21T00:00:00.000Z"));
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(dataset("2026-11-21T00:00:00.000Z"));
  });

  it("replaces an existing file", async () => {
    const file = join(await freshDir(), "hevy.json");
    await writeDatasetAtomically(file, dataset("A"));
    await writeDatasetAtomically(file, dataset("B"));
    expect(JSON.parse(await readFile(file, "utf8")).synced_at).toBe("B");
  });

  it("leaves no temp file behind", async () => {
    const dir = await freshDir();
    await writeDatasetAtomically(join(dir, "hevy.json"), dataset("A"));
    expect((await readdir(dir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(await readdir(dir)).toEqual(["hevy.json"]);
  });

  it("leaves the old file untouched when writing fails", async () => {
    const dir = await freshDir();
    const file = join(dir, "hevy.json");
    await writeDatasetAtomically(file, dataset("A"));
    const before = await readFile(file, "utf8");
    const bad = { ...dataset("B"), extra: 1n } as unknown as HevyDataset;
    await expect(writeDatasetAtomically(file, bad)).rejects.toThrow();
    expect(await readFile(file, "utf8")).toBe(before);
    expect(await readdir(dir)).toEqual(["hevy.json"]);
  });

  it("writes to a temp name that is unique per run", async () => {
    const dir = await freshDir();
    const file = join(dir, "hevy.json");
    // A directory can't be replaced by a file, so the rename fails; spy on the temp name via the error.
    await mkdir(file);
    const error = (await writeDatasetAtomically(file, dataset("A")).catch((e) => e)) as { dest?: string; path?: string };
    expect(`${error.path}`).toMatch(new RegExp(`hevy\\.json\\.${process.pid}\\.\\d+\\.tmp$`));
  });

  it("removes the temp file when the rename fails", async () => {
    const dir = await freshDir();
    const file = join(dir, "hevy.json");
    // A directory can't be replaced by a file, so the rename fails after the temp file exists.
    await mkdir(file);
    await expect(writeDatasetAtomically(file, dataset("A"))).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["hevy.json"]);
  });
});

describe("writeJsonAtomically", () => {
  it("writes any JSON value", async () => {
    const file = join(await freshDir(), "health.json");
    await writeJsonAtomically(file, { days: [{ date: "2025-03-04", steps: 5 }] });
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ days: [{ date: "2025-03-04", steps: 5 }] });
  });

  it("leaves no temp file when encoding fails", async () => {
    const dir = await freshDir();
    await expect(writeJsonAtomically(join(dir, "x.json"), { n: 1n })).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it("removes the temp file when the rename fails", async () => {
    const dir = await freshDir();
    const file = join(dir, "x.json");
    await mkdir(file);
    await expect(writeJsonAtomically(file, [1, 2])).rejects.toThrow();
    expect(await readdir(dir)).toEqual(["x.json"]);
  });
});
