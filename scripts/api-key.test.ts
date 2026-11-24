import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MalformedKeyError, REPO_ENV_FILE, resolveApiKey } from "./api-key.ts";

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

  it("rethrows a read error other than a missing file", () => {
    mkdirSync(envFile);
    expect(() => resolveApiKey({}, envFile)).toThrow(expect.objectContaining({ code: "EISDIR" }));
  });

  it("ignores a byte-order mark at the start of .env", () => {
    writeFileSync(envFile, "\uFEFFHEVY_API_KEY=from-file\n");
    expect(resolveApiKey({}, envFile)).toEqual({ key: "from-file", source: ".env" });
  });

  it("rejects a .env key with a line break inside, without repeating the key", () => {
    writeFileSync(envFile, 'HEVY_API_KEY="secret-1\nsecret-2"\n');
    expect(() => resolveApiKey({}, envFile)).toThrow(MalformedKeyError);
    expect(() => resolveApiKey({}, envFile)).toThrow(
      "The Hevy API key in .env has a line break or other invalid character in it. Copy it again from Hevy → Settings → Developer.",
    );
  });

  it("rejects an environment key with a carriage return or NUL inside", () => {
    for (const key of ["secret-1\rsecret-2", "secret-1\0secret-2"]) {
      expect(() => resolveApiKey({ HEVY_API_KEY: key }, envFile)).toThrow(
        "The Hevy API key in the HEVY_API_KEY environment variable has a line break or other invalid character in it. Copy it again from Hevy → Settings → Developer.",
      );
    }
  });

  it("still accepts a key with whitespace around it, which fetch strips", () => {
    expect(resolveApiKey({ HEVY_API_KEY: " from-env\r\n" }, envFile)).toEqual({ key: " from-env\r\n", source: "environment" });
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
