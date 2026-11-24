import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { HevyDataset } from "../src/core/types";
import { createServer, loadTraining, resolveTimeZone } from "./server";
import { ToolError } from "./tools";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SAMPLE = join(ROOT, "public/data/sample.json");
const READ_TOOLS = ["balance", "consistency", "exercise_progress", "find_exercises", "main_lifts", "recent_workouts"];

/** The environment as plain strings, with overrides, and never the developer's real Hevy key. */
const envWith = (overrides: Record<string, string>): Record<string, string> => {
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined)),
    ...overrides,
  };
  delete env.HEVY_API_KEY;
  return env;
};

describe("the server over stdio", () => {
  const client = new Client({ name: "hevy-viz-test", version: "0.0.0" });

  beforeAll(async () => {
    await client.connect(
      new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/server.ts"], cwd: ROOT, env: envWith({ HEVY_VIZ_DATA: "public/data/sample.json" }), stderr: "ignore" }),
    );
  }, 30_000);
  afterAll(() => client.close());

  it("lists seven tools; six read-only and sync_now", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).toSorted()).toEqual([...READ_TOOLS, "sync_now"]);
    for (const tool of tools.filter((t) => t.name !== "sync_now")) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
      expect(tool.description).toContain("Figures match the hevy-viz dashboard");
      expect(tool.description).toContain("America/Chicago");
      expect(tool.description).toContain("sync_now");
      expect(tool.description).toContain('not when context.source is "sample"');
    }
    const sync = tools.find((t) => t.name === "sync_now");
    expect(sync?.description).toContain('Not for sample data (context.source "sample")');
    expect(sync?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true });
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

describe("sync_now in process", () => {
  let dir: string;
  const sample = JSON.parse(readFileSync(SAMPLE, "utf8")) as HevyDataset;
  const missingEnv = () => join(dir, "no-such.env");
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  /** A fake Hevy: the events it returns, and no templates. */
  const fakeHevy = (events: unknown[] = []) => {
    const state = { events };
    const fn = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/workouts/events")) return json({ page_count: 1, events: state.events });
      if (path.endsWith("/exercise_templates")) return json({ page_count: 1, exercise_templates: [] });
      throw new Error(`unrouted ${path}`);
    }) as typeof fetch;
    return { fn, state };
  };
  const connect = async (file: string, options: Parameters<typeof createServer>[2]) => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "hevy-viz-test", version: "0.0.0" });
    await Promise.all([createServer(file, "America/Chicago", options).connect(serverSide), client.connect(clientSide)]);
    return client;
  };
  const textOf = (result: unknown): string => ((result as { content: { text: string }[] }).content)[0].text;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "hevy-viz-sync-"));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("refuses the sample without touching it", async () => {
    const file = join(dir, "sample-copy.json");
    copyFileSync(SAMPLE, file);
    const before = readFileSync(file);
    const client = await connect(file, { env: { HEVY_API_KEY: "test-key-7f3a" }, envFile: missingEnv(), fetch: fakeHevy().fn });
    const result = await client.callTool({ name: "sync_now", arguments: {} });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("Can't sync from here");
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it("the next tool call sees the new workout", async () => {
    const file = join(dir, "hevy.json");
    const old = { ...sample.workouts[0], id: "old", title: "Old workout", start_time: "2026-11-01T10:00:00Z", end_time: "2026-11-01T11:00:00Z", updated_at: "2026-11-01T11:00:00Z" };
    writeFileSync(file, JSON.stringify({ ...sample, source: "hevy", synced_at: "2026-11-20T00:00:00.000Z", workouts: [old] }));
    // Pin the file's mtime, and put it back after the sync: the atomic write would otherwise give the
    // file a new mtime and loadTraining would reload on that alone, hiding a missing `loaded = undefined`.
    const pinned = new Date(1_700_000_000_000);
    utimesSync(file, pinned, pinned);
    const hevy = fakeHevy();
    const client = await connect(file, { env: { HEVY_API_KEY: "test-key-7f3a" }, envFile: missingEnv(), fetch: hevy.fn });
    const titles = async () => (JSON.parse(textOf(await client.callTool({ name: "recent_workouts", arguments: { limit: 1 } }))).workouts as { title: string }[]).map((w) => w.title);
    expect(await titles()).toEqual(["Old workout"]);

    const today = new Date().toISOString();
    hevy.state.events = [{ type: "updated", workout: { ...old, id: "new", title: "Brand new workout", start_time: today, end_time: today, created_at: today, updated_at: today } }];
    const result = await client.callTool({ name: "sync_now", arguments: {} });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ added: 1, workouts: 2, timeZone: "America/Chicago" });
    expect(statSync(file).mtimeMs).not.toBe(pinned.getTime());
    utimesSync(file, pinned, pinned);
    expect(statSync(file).mtimeMs).toBe(pinned.getTime());
    expect(await titles()).toEqual(["Brand new workout"]);
  });

  it("the read tools don't read the key", async () => {
    const file = join(dir, "read-only.json");
    copyFileSync(SAMPLE, file);
    const client = await connect(file, { env: {}, envFile: missingEnv() });
    const result = await client.callTool({ name: "recent_workouts", arguments: {} });
    expect(result.isError).toBeFalsy();
  });

  it("writes nothing to stdout", async () => {
    const file = join(dir, "quiet.json");
    writeFileSync(file, JSON.stringify({ ...sample, source: "hevy" }));
    const client = await connect(file, { env: { HEVY_API_KEY: "test-key-7f3a" }, envFile: missingEnv(), fetch: fakeHevy().fn });
    // Under vitest, console.log/info/debug don't pass through process.stdout.write, so spy on them too.
    const spies = [vi.spyOn(process.stdout, "write"), vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "debug")];
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = await client.callTool({ name: "sync_now", arguments: {} });
      expect(result.isError).toBeFalsy();
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

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
