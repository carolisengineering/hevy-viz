import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const run = (args: string[]) =>
  spawnSync(process.execPath, ["--import", "tsx", "scripts/import-health.ts", ...args], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });

describe("npm run health", () => {
  it("with no argument prints the usage line and exits 1", () => {
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr.trim()).toBe("Usage: npm run health -- <path to export.zip>");
  }, 30_000);

  it("with a missing file says what it couldn't read, with no stack trace", () => {
    const r = run(["/nonexistent/export.zip"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr.trim()).toBe(
      "Couldn't read apple_health_export/export.xml from that file. Use the zip from Health → your profile → Export All Health Data.",
    );
  }, 30_000);
});
