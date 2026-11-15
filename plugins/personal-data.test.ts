import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blockPublicPersonalData, SYNCED_DATA_FILE } from "./personal-data.ts";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

describe("SYNCED_DATA_FILE", () => {
  it("points at data/hevy.json in the repo, wherever the server is started from", () => {
    expect(SYNCED_DATA_FILE).toBe(resolve(repoRoot, "data/hevy.json"));
  });
});

describe("blockPublicPersonalData", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hevy-viz-guard-"));
    await writeFile(join(root, "index.html"), "<!doctype html><title>t</title>");
    await mkdir(join(root, "public/data"), { recursive: true });
    await writeFile(join(root, "public/data/sample.json"), "{}");
  });
  afterEach(() => rm(root, { recursive: true, force: true }));

  const runBuild = () =>
    build({
      root,
      configFile: false,
      logLevel: "silent",
      plugins: [blockPublicPersonalData()],
      build: { outDir: join(root, "dist"), write: false },
    });

  it("lets a build without public/data/hevy.json through", async () => {
    await expect(runBuild()).resolves.toBeDefined();
  });

  it("fails the build when public/data/hevy.json exists", async () => {
    await writeFile(join(root, "public/data/hevy.json"), "{}");
    await expect(runBuild()).rejects.toThrow(/public\/data\/hevy\.json/);
  });
});
