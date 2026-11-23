import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HevyDataset, HevyWorkout } from "../src/core/types.ts";
import { FullSyncNeededError, HevyHttpError, SaveError } from "./exitCodes.ts";
import { runSync, type SyncProgress } from "./sync.ts";

const KEY = "test-key-123";
const SAVED_AT = "2026-11-21T12:00:00.000Z";
const NOW = new Date("2026-11-22T09:00:00.000Z");

function workout(id: string, start_time: string, updated_at: string, title = id): HevyWorkout {
  return { id, title, start_time, end_time: start_time, created_at: start_time, updated_at, exercises: [] };
}
const a = workout("a", "2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z");
const b = workout("b", "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z");
const saved = (): HevyDataset => ({ source: "hevy", synced_at: SAVED_AT, workouts: [b, a], exercise_templates: [] });

const made: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    made.splice(0).map(async (dir) => {
      await chmod(dir, 0o755);
      await rm(dir, { recursive: true, force: true });
    }),
  );
});
async function freshFile(content?: string | HevyDataset): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sync-"));
  made.push(dir);
  const file = join(dir, "hevy.json");
  if (content !== undefined) await writeFile(file, typeof content === "string" ? content : JSON.stringify(content));
  return file;
}

type Call = { url: URL; init?: RequestInit };
/** A fake fetch that routes by path and records its calls. */
function fakeFetch(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const route = routes[url.pathname.replace(/^\/v1/, "")];
    if (!route) throw new Error(`unrouted ${url.pathname}`);
    return route();
  }) as typeof fetch;
  return { fn, calls };
}
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const templates = () => json({ page_count: 1, exercise_templates: [] });
const eventsRoute = (events: unknown[]) => () => json({ page_count: 1, events });
const updatedEvent = (w: HevyWorkout) => ({ type: "updated", workout: w });

const incrementalRoutes = () => ({
  "/workouts/events": eventsRoute([
    updatedEvent(workout("c", "2026-11-21T10:00:00Z", "2026-11-21T11:00:00Z")),
    updatedEvent({ ...a, updated_at: "2026-11-21T12:30:00Z", title: "edited" }),
    { type: "deleted", id: "b", deleted_at: "2026-11-21T13:00:00Z" },
  ]),
  "/exercise_templates": templates,
});

describe("runSync", () => {
  it("incremental: applies new, edited and deleted workouts and returns the counts", async () => {
    const file = await freshFile(saved());
    const { fn } = fakeFetch(incrementalRoutes());
    const result = await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW });
    expect(result).toEqual({
      mode: "incremental",
      added: 1,
      updated: 1,
      deleted: 1,
      workouts: 2,
      previousSyncAt: SAVED_AT,
      syncedAt: NOW.toISOString(),
    });
    const onDisk = JSON.parse(await readFile(file, "utf8")) as HevyDataset;
    expect(onDisk.synced_at).toBe(NOW.toISOString());
    expect(onDisk.workouts.map((w) => w.id).sort()).toEqual(["a", "c"]);
  });

  it("asks for events since synced_at minus 10 minutes, with the api-key header", async () => {
    const file = await freshFile(saved());
    const { fn, calls } = fakeFetch({ "/workouts/events": eventsRoute([]), "/exercise_templates": templates });
    await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW });
    const events = calls.find((c) => c.url.pathname.endsWith("/workouts/events"))!;
    expect(events.url.search).toContain("since=2026-11-21T11%3A50%3A00.000Z");
    const headers = (events.init?.headers ?? {}) as Record<string, string>;
    expect(headers["api-key"]).toBe(KEY);
  });

  it("full sync when there is no file, and says why", async () => {
    const file = await freshFile();
    const { fn } = fakeFetch({ "/workouts": () => json({ page_count: 1, workouts: [a] }), "/exercise_templates": templates });
    const result = await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW });
    expect(result).toMatchObject({ mode: "full", reason: "no saved data", workouts: 1, previousSyncAt: null, added: 0, updated: 0, deleted: 0 });
    expect(JSON.parse(await readFile(file, "utf8")).source).toBe("hevy");
  });

  describe("allowFull false", () => {
    const cases: [string, string | HevyDataset | undefined, string][] = [
      ["a missing file", undefined, "no saved data"],
      ["a sample file", { ...saved(), source: "sample" }, "saved data is the sample"],
      ["a truncated file", "{ truncated", "saved data can't be read"],
    ];
    it.each(cases)("throws FullSyncNeededError for %s before any request", async (_name, content, reason) => {
      const file = await freshFile(content);
      const before = await readFile(file, "utf8").catch(() => null);
      const { fn, calls } = fakeFetch({});
      const error = await runSync({ apiKey: KEY, file, allowFull: false, fetch: fn, now: () => NOW }).catch((e) => e);
      expect(error).toBeInstanceOf(FullSyncNeededError);
      expect(error.reason).toBe(reason);
      expect(calls).toEqual([]);
      expect(await readFile(file, "utf8").catch(() => null)).toBe(before);
    });
  });

  it("retries a 429, reporting it through onProgress", async () => {
    const file = await freshFile(saved());
    let first = true;
    const { fn } = fakeFetch({
      "/workouts/events": () => {
        if (first) {
          first = false;
          return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
        }
        return json({ page_count: 1, events: [] });
      },
      "/exercise_templates": templates,
    });
    const progress: SyncProgress[] = [];
    await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW, onProgress: (p) => progress.push(p) });
    const limited = progress.filter((p) => p.kind === "rateLimited");
    expect(limited).toEqual([{ kind: "rateLimited", path: expect.stringContaining("/workouts/events"), waitMs: 0, attempt: 1 }]);
  });

  it("401 throws HevyHttpError(401) and leaves the file unchanged", async () => {
    const file = await freshFile(saved());
    const before = await readFile(file, "utf8");
    const { fn } = fakeFetch({ "/workouts/events": () => new Response("no", { status: 401 }) });
    const error = await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW }).catch((e) => e);
    expect(error).toBeInstanceOf(HevyHttpError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain(KEY);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("a failed write throws SaveError and leaves the old file", async () => {
    const file = await freshFile(saved());
    const before = await readFile(file, "utf8");
    const { fn } = fakeFetch(incrementalRoutes());
    // A read-only directory: the file can be read, but the temp file can't be created.
    await chmod(join(file, ".."), 0o555);
    const error = await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW }).catch((e) => e);
    expect(error).toBeInstanceOf(SaveError);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("aborting during a 429 wait stops at once and writes nothing", async () => {
    const file = await freshFile(saved());
    const before = await readFile(file, "utf8");
    const { fn, calls } = fakeFetch({ "/workouts/events": () => new Response("slow", { status: 429, headers: { "retry-after": "30" } }) });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const started = Date.now();
    const error = await runSync({ apiKey: KEY, file, fetch: fn, now: () => NOW, signal: controller.signal }).catch((e) => e);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(error).toBe(controller.signal.reason);
    expect((error as Error).name).toBe("AbortError");
    expect(calls).toHaveLength(1);
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("never writes to process.stdout, process.stderr or the console", async () => {
    const spies = [
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
      vi.spyOn(console, "log"),
      vi.spyOn(console, "info"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "debug"),
    ];
    const full = await freshFile();
    await runSync({
      apiKey: KEY,
      file: full,
      fetch: fakeFetch({ "/workouts": () => json({ page_count: 1, workouts: [a] }), "/exercise_templates": templates }).fn,
      now: () => NOW,
      onProgress: () => {},
    });
    const inc = await freshFile(saved());
    await runSync({ apiKey: KEY, file: inc, fetch: fakeFetch(incrementalRoutes()).fn, now: () => NOW });
    // A run that is rate-limited once: this path used to write to stderr.
    const limited = await freshFile(saved());
    let first = true;
    const { fn } = fakeFetch({
      "/workouts/events": () => {
        if (!first) return json({ page_count: 1, events: [] });
        first = false;
        return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
      },
      "/exercise_templates": templates,
    });
    await runSync({ apiKey: KEY, file: limited, fetch: fn, now: () => NOW });
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
