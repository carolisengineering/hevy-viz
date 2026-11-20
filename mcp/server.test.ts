import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HevyDataset } from "../src/core/types";
import { loadTraining, resolveTimeZone } from "./server";
import { ToolError } from "./tools";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SAMPLE = join(ROOT, "public/data/sample.json");
const TOOLS = ["balance", "consistency", "exercise_progress", "find_exercises", "main_lifts", "recent_workouts"];

/** The environment as plain strings, with overrides. */
const envWith = (overrides: Record<string, string>): Record<string, string> => ({
  ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
  ...overrides,
});

describe("the server over stdio", () => {
  const client = new Client({ name: "hevy-viz-test", version: "0.0.0" });

  beforeAll(async () => {
    await client.connect(
      new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/server.ts"], cwd: ROOT, env: envWith({ HEVY_VIZ_DATA: "public/data/sample.json" }), stderr: "ignore" }),
    );
  }, 30_000);
  afterAll(() => client.close());

  it("lists the six tools, all read-only", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual(TOOLS);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(tool.description).toContain("Figures match the hevy-viz dashboard");
      expect(tool.description).toContain("America/Chicago");
    }
  });

  it("answers exercise_progress for squat from the sample", async () => {
    const result = await client.callTool({ name: "exercise_progress", arguments: { exercise: "squat" } });
    expect(result.isError).toBeFalsy();
    const [content] = result.content as { type: string; text: string }[];
    const body = JSON.parse(content.text);
    expect(body).toMatchObject({ id: "squat", context: { source: "sample", timeZone: "America/Chicago" } });
    expect(result.structuredContent).toEqual(body);
  });

  it("returns a tool error for an unknown exercise", async () => {
    const result = await client.callTool({ name: "exercise_progress", arguments: { exercise: "nope" } });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toBe('No exercise matches "nope"; find_exercises lists them.');
  });

  it("passes series through to consistency", async () => {
    const body = async (args: Record<string, unknown>) => JSON.parse(((await client.callTool({ name: "consistency", arguments: args })).content as { text: string }[])[0].text);
    expect((await body({ series: true })).series.by).toBe("week");
    expect(await body({})).not.toHaveProperty("series");
  });

  it("rejects an unknown range", async () => {
    const result = await client.callTool({ name: "consistency", arguments: { range: "2y" } });
    expect(result.isError).toBe(true);
  });
}, 30_000);

describe("loadTraining", () => {
  let dir: string;
  let file: string;
  const sample = JSON.parse(readFileSync(SAMPLE, "utf8")) as HevyDataset;
  /** Writes `content` and moves the file's mtime `seconds` ahead, so a reload can't miss it. */
  const write = (content: string, seconds: number) => {
    writeFileSync(file, content);
    const at = new Date(Date.now() + seconds * 1000);
    utimesSync(file, at, at);
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "hevy-viz-"));
    file = join(dir, "hevy.json");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reloads when the file changes, and keeps the last good data when it can't be read", () => {
    write(JSON.stringify(sample), 0);
    const first = loadTraining(file, "America/Chicago");
    expect(first.ctx.training.data.workouts).toHaveLength(sample.workouts.length);
    expect(first.ctx).toMatchObject({ timeZone: "America/Chicago", syncedAt: sample.synced_at });
    expect(loadTraining(file, "America/Chicago", first)).toBe(first);

    write(JSON.stringify({ ...sample, workouts: sample.workouts.slice(1) }), 10);
    const second = loadTraining(file, "America/Chicago", first);
    expect(second.ctx.training.data.workouts).toHaveLength(sample.workouts.length - 1);

    write("{ truncated", 20);
    expect(() => loadTraining(file, "America/Chicago", second)).toThrow(
      new ToolError("The data file couldn't be read; if a sync is running, try again in a moment, or run `npm run sync` again."),
    );
    expect(second.ctx.training.exercises.length).toBeGreaterThan(0);

    write(JSON.stringify(sample), 30);
    expect(loadTraining(file, "America/Chicago", second).ctx.training.data.workouts).toHaveLength(sample.workouts.length);
  });

  it("moves the end day forward when the local day changes, though the file hasn't", () => {
    write(JSON.stringify({ ...sample, source: "hevy" }), 35);
    const monday = loadTraining(file, "America/Chicago", undefined, new Date("2026-11-16T18:00:00Z"));
    expect(monday.ctx.training.endDay).toBe("2026-11-16");
    expect(loadTraining(file, "America/Chicago", monday, new Date("2026-11-16T23:00:00Z"))).toBe(monday);
    expect(loadTraining(file, "America/Chicago", monday, new Date("2026-11-19T18:00:00Z")).ctx.training.endDay).toBe("2026-11-19");
  });

  it("drops workouts without a readable start time", () => {
    write(JSON.stringify({ ...sample, workouts: [...sample.workouts, { ...sample.workouts[0], id: "bad", start_time: "not a time" }] }), 40);
    expect(loadTraining(file, "UTC").ctx.training.data.workouts).toHaveLength(sample.workouts.length);
  });

  it("says how to sync when there is no data file", () => {
    expect(() => loadTraining(join(dir, "missing.json"), "UTC")).toThrow(/^No synced data at .*missing\.json\. Run `npm run sync` in the hevy-viz folder\.$/);
  });

  it("rejects JSON that isn't a synced dataset", () => {
    write(JSON.stringify({ hello: "world" }), 50);
    expect(() => loadTraining(file, "UTC")).toThrow(ToolError);
  });
});

describe("resolveTimeZone", () => {
  it("defaults to America/Chicago and takes a valid IANA zone", () => {
    expect(resolveTimeZone({})).toBe("America/Chicago");
    expect(resolveTimeZone({ HEVY_VIZ_TZ: "" })).toBe("America/Chicago");
    expect(resolveTimeZone({ HEVY_VIZ_TZ: "Europe/Berlin" })).toBe("Europe/Berlin");
  });

  it("rejects a zone that isn't one", () => {
    expect(() => resolveTimeZone({ HEVY_VIZ_TZ: "Chicago" })).toThrow('HEVY_VIZ_TZ "Chicago" isn\'t a time zone. Use an IANA name like America/Chicago.');
  });

  it("stops the server at startup with a mistyped zone", async () => {
    const child = spawn("npx", ["tsx", "mcp/server.ts"], { cwd: ROOT, env: envWith({ HEVY_VIZ_TZ: "Chicago" }) });
    let stderr = "";
    let stdout = "";
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", (chunk) => (stdout += chunk));
    const code = await new Promise<number | null>((resolve) => child.on("close", resolve));
    expect(code).toBe(1);
    expect(stderr).toContain('HEVY_VIZ_TZ "Chicago" isn\'t a time zone');
    expect(stdout).toBe("");
  }, 30_000);
});
