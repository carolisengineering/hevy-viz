import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REPO_ENV_FILE, resolveApiKey } from "./api-key.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

describe("resolveApiKey", () => {
  let dir: string;
  let envFile: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "api-key-"));
    envFile = join(dir, ".env");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("environment wins over .env", () => {
    writeFileSync(envFile, "HEVY_API_KEY=from-file\n");
    expect(resolveApiKey({ HEVY_API_KEY: "from-env" }, envFile)).toEqual({ key: "from-env", source: "environment" });
  });

  it("falls back to .env", () => {
    writeFileSync(envFile, "HEVY_API_KEY=from-file\n");
    expect(resolveApiKey({}, envFile)).toEqual({ key: "from-file", source: ".env" });
  });

  it("an empty value counts as missing", () => {
    writeFileSync(envFile, "HEVY_API_KEY=\n");
    expect(resolveApiKey({ HEVY_API_KEY: "" }, envFile)).toBeNull();
  });

  it("a missing .env is fine", () => {
    expect(resolveApiKey({}, envFile)).toBeNull();
  });

  it("reads only HEVY_API_KEY and leaves process.env alone", () => {
    writeFileSync(envFile, "OTHER=x\n");
    expect(resolveApiKey({}, envFile)).toBeNull();
    expect(process.env.OTHER).toBeUndefined();
  });
});

describe("REPO_ENV_FILE", () => {
  it("is the repo root's .env", () => {
    expect(REPO_ENV_FILE).toBe(join(ROOT, ".env"));
  });
});
