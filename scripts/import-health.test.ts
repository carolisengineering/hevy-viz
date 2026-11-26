import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ["--import", "tsx", "scripts/import-health.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ...env },
  });

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

  describe("refuses to write an export it can't use", () => {
    const refuse = async (xml: string, message: string) => {
      const dir = await mkdtemp(join(tmpdir(), "import-health-"));
      try {
        await mkdir(join(dir, "src/apple_health_export"), { recursive: true });
        await writeFile(join(dir, "src/apple_health_export/export.xml"), xml);
        const zip = join(dir, "export.zip");
        expect(spawnSync("zip", ["-qr", zip, "apple_health_export"], { cwd: join(dir, "src") }).status).toBe(0);
        const out = join(dir, "health.json");
        await writeFile(out, "previous");
        const r = run([zip], { HEALTH_OUT: out });
        expect(r.status).toBe(1);
        expect(r.stdout).toBe("");
        expect(r.stderr.trim()).toBe(message);
        expect(await readFile(out, "utf8")).toBe("previous");
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    };
    const stepLine = `<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Test Watch" unit="count" startDate="2025-03-04 09:00:00 -0600" endDate="2025-03-04 09:10:00 -0600" value="412"/>`;

    it("with no export date", () => refuse(`<HealthData>\n${stepLine}\n</HealthData>\n`, "The export has no export date, so nothing was written."), 30_000);
    it("with no days", () => refuse(`<HealthData>\n<ExportDate value="2026-11-25 10:30:00 -0600"/>\n</HealthData>\n`, "The export has no days of data, so nothing was written."), 30_000);
  });
});
