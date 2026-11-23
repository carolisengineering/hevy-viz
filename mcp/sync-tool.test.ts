import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HevyDataset, HevyWorkout } from "../src/core/types.ts";
import { makeSyncNow as makeSyncNowRaw, type SyncNowDeps } from "./sync-tool.ts";
import { ToolError } from "./tools.ts";

const KEY = "test-key-7f3a";
const SAVED_AT = "2026-11-21T12:00:00.000Z";

function workout(id: string, start_time: string, updated_at: string): HevyWorkout {
  return { id, title: id, start_time, end_time: start_time, created_at: start_time, updated_at, exercises: [] };
}
const a = workout("a", "2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z");
const b = workout("b", "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z");
const saved = (source: HevyDataset["source"] = "hevy"): HevyDataset => ({ source, synced_at: SAVED_AT, workouts: [b, a], exercise_templates: [] });

const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  // The key must not appear in anything this case produced (every bad-key form contains KEY). Every case
  // yields a result or an error message, so an empty collection means the collecting broke.
  const produced = [...everything, ...lines];
  const collected = everything.length;
  everything.length = 0;
  lines.length = 0;
  expect(collected).toBeGreaterThan(0);
  for (const text of produced) expect(text).not.toContain(KEY);
  await Promise.all(
    dirs.splice(0).map(async (dir) => {
      await chmod(dir, 0o755);
      await rm(dir, { recursive: true, force: true });
    }),
  );
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sync-tool-"));
  dirs.push(dir);
  return dir;
}
async function seed(dataset: HevyDataset = saved()): Promise<{ dir: string; file: string }> {
  const dir = await tempDir();
  const file = join(dir, "hevy.json");
  await writeFile(file, JSON.stringify(dataset));
  return { dir, file };
}

type Call = { url: URL; init?: RequestInit };
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
const events = (list: unknown[]) => () => json({ page_count: 1, events: list });
const newWorkout = { type: "updated", workout: workout("c", "2026-11-21T10:00:00Z", "2026-11-21T11:00:00Z") };

const lines: string[] = [];
const MISSING_ENV = "/nonexistent/hevy-viz/.env";
function deps(file: string, extra: Partial<SyncNowDeps> = {}): SyncNowDeps & { onSynced: ReturnType<typeof vi.fn> } {
  return { file, timeZone: "America/Chicago", env: { HEVY_API_KEY: KEY }, envFile: MISSING_ENV, log: (line) => lines.push(line), onSynced: vi.fn(), ...extra } as SyncNowDeps & { onSynced: ReturnType<typeof vi.fn> };
}
/** Everything a case produced that the key must not appear in. */
const everything: string[] = [];
/** makeSyncNow that also records every result it returns. */
const makeSyncNow = (d: SyncNowDeps) => {
  const run = makeSyncNowRaw(d);
  return async (signal?: AbortSignal) => {
    const result = await run(signal);
    everything.push(JSON.stringify(result));
    return result;
  };
};
const messageOf = async (p: Promise<unknown>): Promise<string> => {
  const error = await p.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e) => e,
  );
  expect(error).toBeInstanceOf(ToolError);
  everything.push(error.message);
  return error.message;
};

describe("makeSyncNow", () => {
  it("returns the counts and a one-line summary", async () => {
    const { file } = await seed();
    const { fn } = fakeFetch({ "/workouts/events": events([newWorkout]), "/exercise_templates": templates });
    const d = deps(file, { fetch: fn });
    const result = await makeSyncNow(d)();
    expect(result).toMatchObject({ added: 1, updated: 0, deleted: 0, workouts: 3, previousSyncAt: SAVED_AT, timeZone: "America/Chicago" });
    expect(result.summary).toMatch(/^1 new workout since .+\. 3 workouts\.$/);
    expect(result.summary).toContain("Nov 21, 6:00 AM");
    expect(d.onSynced).toHaveBeenCalledTimes(1);
  });

  it("no changes", async () => {
    const { file } = await seed();
    const { fn } = fakeFetch({ "/workouts/events": events([]), "/exercise_templates": templates });
    const result = await makeSyncNow(deps(file, { fetch: fn }))();
    expect(result.summary).toMatch(/^No workout changes since .+\. 2 workouts\.$/);
  });

  it("no key: the .env message, and no request", async () => {
    const { file } = await seed();
    const { fn, calls } = fakeFetch({});
    const d = deps(file, { env: {}, fetch: fn });
    expect(await messageOf(makeSyncNow(d)())).toBe("No Hevy API key. Add HEVY_API_KEY to .env in the hevy-viz folder (see .env.example).");
    expect(calls).toHaveLength(0);
    expect(d.onSynced).not.toHaveBeenCalled();
  });

  it("uses the environment key over .env", async () => {
    const { dir, file } = await seed();
    const envFile = join(dir, ".env");
    await writeFile(envFile, "HEVY_API_KEY=from-file\n");
    const { fn, calls } = fakeFetch({ "/workouts/events": events([]), "/exercise_templates": templates });
    await makeSyncNow(deps(file, { env: { HEVY_API_KEY: "from-env" }, envFile, fetch: fn }))();
    expect(((calls[0].init as RequestInit).headers as Record<string, string>)["api-key"]).toBe("from-env");
  });

  it("reads the key from .env when the environment has none", async () => {
    const { dir, file } = await seed();
    const envFile = join(dir, ".env");
    await writeFile(envFile, "HEVY_API_KEY=from-file\n");
    const { fn, calls } = fakeFetch({ "/workouts/events": events([]), "/exercise_templates": templates });
    await makeSyncNow(deps(file, { env: {}, envFile, fetch: fn }))();
    expect(((calls[0].init as RequestInit).headers as Record<string, string>)["api-key"]).toBe("from-file");
  });

  it("a 401 names where the key came from", async () => {
    const { dir, file } = await seed();
    const envFile = join(dir, ".env");
    await writeFile(envFile, `HEVY_API_KEY=${KEY}\n`);
    const { fn } = fakeFetch({ "/workouts/events": () => new Response(`bad key ${KEY}`, { status: 401 }) });
    expect(await messageOf(makeSyncNow(deps(file, { fetch: fn }))())).toBe("Hevy rejected the API key in the HEVY_API_KEY environment variable. Check it under Hevy → Settings → Developer.");
    expect(await messageOf(makeSyncNow(deps(file, { env: {}, envFile, fetch: fn }))())).toBe("Hevy rejected the API key in .env. Check it under Hevy → Settings → Developer.");
  });

  it("maps the other failures", async () => {
    const { file, dir } = await seed();
    const fail = (status: number) => fakeFetch({ "/workouts/events": () => new Response(`body ${KEY}`, { status }) }).fn;
    expect(await messageOf(makeSyncNow(deps(file, { fetch: fail(500) }))())).toBe("Hevy returned an error (HTTP 500); nothing was changed.");
    const offline = (async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("x"), { code: "ENOTFOUND" }) });
    }) as typeof fetch;
    expect(await messageOf(makeSyncNow(deps(file, { fetch: offline }))())).toBe("Couldn't reach Hevy. Check the internet connection.");
    const odd = fakeFetch({ "/workouts/events": events([{ type: "mystery" }]), "/exercise_templates": templates }).fn;
    expect(await messageOf(makeSyncNow(deps(file, { fetch: odd }))())).toBe("Hevy returned something unexpected; nothing was changed.");
    const ok = fakeFetch({ "/workouts/events": events([]), "/exercise_templates": templates }).fn;
    await chmod(dir, 0o555);
    expect(await messageOf(makeSyncNow(deps(file, { fetch: ok }))())).toBe("Synced, but couldn't write the data file; nothing was changed.");
  });

  it("rate limiting that gives up says so", async () => {
    const { file } = await seed();
    const { fn } = fakeFetch({ "/workouts/events": () => new Response("slow", { status: 429, headers: { "retry-after": "999" } }) });
    expect(await messageOf(makeSyncNow(deps(file, { fetch: fn }))())).toBe("Hevy is rate-limiting requests; try again in a few minutes.");
  });

  it("an unknown error becomes fixed copy, and the log redacts the key", async () => {
    const { file } = await seed();
    const { fn } = fakeFetch({});
    const own: string[] = [];
    expect(await messageOf(makeSyncNow(deps(file, { fetch: fn, log: (l) => own.push(l) }))())).toBe("The sync failed unexpectedly; nothing was changed.");
    expect(own.some((l) => l.startsWith("hevy-viz: ") && l.includes("unrouted"))).toBe(true);
    lines.push(...own);
  });

  // Like the real fetch, validates the headers (so an invalid key throws here, offline) and never touches the network.
  const validatingFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    new Headers(init?.headers);
    throw new Error("unexpected: the headers were accepted");
  }) as typeof fetch;

  it.each([
    ["an inner newline", `${KEY}\nx`],
    ["outer spaces", ` ${KEY}\nx `],
    ["a leading newline and a trailing NUL", `\n${KEY}\u0000`],
  ])("a key fetch rejects as a header value (%s) never reaches the message or the log", async (_name, badKey) => {
    const { file } = await seed();
    const own: string[] = [];
    const message = await messageOf(makeSyncNow(deps(file, { env: { HEVY_API_KEY: badKey }, fetch: validatingFetch, log: (l) => own.push(l) }))());
    expect(message).toBe("The sync failed unexpectedly; nothing was changed.");
    expect(own.some((l) => l.startsWith("hevy-viz: ") && l.includes("[redacted]"))).toBe(true);
    for (const text of [message, ...own]) {
      expect(text).not.toContain(badKey);
      expect(text).not.toContain(badKey.trim());
    }
    lines.push(...own);
  });

  it("a 200 that isn't JSON doesn't leak the body", async () => {
    const { file } = await seed();
    const { fn } = fakeFetch({ "/workouts/events": () => new Response("<html>proxy</html>", { status: 200 }) });
    const message = await messageOf(makeSyncNow(deps(file, { fetch: fn }))());
    expect(message).toBe("The sync failed unexpectedly; nothing was changed.");
    expect(message).not.toContain("<html>");
  });

  it("refuses a full sync and names the reason", async () => {
    const { file } = await seed(saved("sample"));
    const before = await readFile(file, "utf8");
    const { fn, calls } = fakeFetch({});
    const d = deps(file, { fetch: fn });
    expect(await messageOf(makeSyncNow(d)())).toBe("Can't sync from here: saved data is the sample. Run `npm run sync` in the hevy-viz folder.");
    expect(calls).toHaveLength(0);
    expect(await readFile(file, "utf8")).toBe(before);
    expect(d.onSynced).not.toHaveBeenCalled();
  });

  it("two calls at once run one sync", async () => {
    const { file } = await seed();
    const { fn, calls } = fakeFetch({ "/workouts/events": events([newWorkout]), "/exercise_templates": templates });
    const d = deps(file, { fetch: fn });
    const syncNow = makeSyncNow(d);
    const [first, second] = await Promise.all([syncNow(), syncNow()]);
    expect(calls.filter((c) => c.url.pathname.endsWith("/workouts/events"))).toHaveLength(1);
    expect(second).toEqual(first);
    expect(d.onSynced).toHaveBeenCalledTimes(1);
    // The slot is free again afterward.
    await syncNow();
    expect(calls.filter((c) => c.url.pathname.endsWith("/workouts/events"))).toHaveLength(2);
  });

  it("a canceled call writes nothing", async () => {
    const { file } = await seed();
    const before = await readFile(file, "utf8");
    const { fn } = fakeFetch({ "/workouts/events": () => new Response("slow", { status: 429, headers: { "retry-after": "30" } }) });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    const d = deps(file, { fetch: fn });
    expect(await messageOf(makeSyncNow(d)(controller.signal))).toBe("Sync canceled; nothing was changed.");
    expect(await readFile(file, "utf8")).toBe(before);
    expect(d.onSynced).not.toHaveBeenCalled();
  });

  it("progress goes to log, prefixed hevy-viz:", async () => {
    const own: string[] = [];
    const { file } = await seed();
    const { fn } = fakeFetch({ "/workouts/events": events([newWorkout]), "/exercise_templates": templates });
    await makeSyncNow(deps(file, { fetch: fn, log: (l) => own.push(l) }))();
    expect(own.length).toBeGreaterThan(0);
    lines.push(...own);
    for (const line of own) expect(line.startsWith("hevy-viz: ")).toBe(true);
  });
});
