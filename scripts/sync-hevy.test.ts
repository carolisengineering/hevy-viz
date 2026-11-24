import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

describe("npm run sync", () => {
  // The key is rejected before any request, so this never reaches Hevy or touches data/hevy.json.
  it("a key with a line break exits 1 with a message that doesn't repeat the key", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/sync-hevy.ts"], {
      cwd: ROOT,
      env: { ...process.env, HEVY_API_KEY: "secret-1\nsecret-2" },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr.trim()).toBe(
      "The Hevy API key in the HEVY_API_KEY environment variable has a line break or other invalid character in it. Copy it again from Hevy → Settings → Developer.",
    );
  }, 30_000);
});
