// Pulls your Hevy history into a data file: the first sync downloads everything,
// later ones fetch only what changed. Used by `npm run sync` (sync-hevy.ts) and,
// later, by the MCP server. Never writes to stdout or stderr; progress goes to `onProgress`.
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { HevyDataset, HevyExerciseTemplate, HevyWorkout } from "../src/core/types.ts";
import { applyEvents, eventsOf, fromFullSync, toWorkoutEvent } from "./apply-events.ts";
import { FullSyncNeededError, HevyHttpError, RateLimitError, SaveError } from "./exitCodes.ts";
import { planRetry } from "./retry.ts";
import { planSync } from "./sync-mode.ts";
import { writeDatasetAtomically } from "./write-dataset.ts";

const BASE = "https://api.hevyapp.com/v1";
const EVENTS_PAGE_SIZE = 10; // the maximum /workouts/events accepts

export type SyncProgress =
  | { kind: "page"; key: string; page: number; pageCount: number }
  | { kind: "pagesDone"; key: string }
  | { kind: "rateLimited"; path: string; waitMs: number; attempt: number };

export interface SyncOptions {
  apiKey: string;
  file: string; // data file to read and write
  full?: boolean; // like `--full`
  allowFull?: boolean; // default true; false → throw FullSyncNeededError before any request
  onProgress?: (p: SyncProgress) => void;
  fetch?: typeof fetch; // default globalThis.fetch
  signal?: AbortSignal;
  now?: () => Date; // default () => new Date(); start time becomes synced_at
}

export interface SyncResult {
  mode: "incremental" | "full";
  reason?: string; // planSync's reason when mode is "full"
  added: number;
  updated: number;
  deleted: number; // all 0 for a full sync
  workouts: number; // total saved
  previousSyncAt: string | null; // saved synced_at for incremental, else null
  syncedAt: string;
}

/** A Hevy list response: `{ page_count, [key]: items }`. */
type Page<K extends string, T> = { page_count: number } & { [P in K]?: T[] };

/** The saved file's text; null when there isn't one. Any other read error is not a save failure, so it propagates as is. */
async function readSaved(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return null;
    throw error;
  }
}

export async function runSync(options: SyncOptions): Promise<SyncResult> {
  const { apiKey, file, signal, onProgress } = options;
  const doFetch = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());

  async function get<T>(path: string, attempt = 1): Promise<T> {
    const res = await doFetch(`${BASE}${path}`, { headers: { "api-key": apiKey, accept: "application/json" }, signal });
    if (res.status === 429) {
      const plan = planRetry(attempt, res.headers.get("retry-after"));
      if (!plan.retry) throw new RateLimitError(`GET ${path} → 429: ${plan.reason}`);
      onProgress?.({ kind: "rateLimited", path, waitMs: plan.waitMs, attempt });
      try {
        await sleep(plan.waitMs, undefined, { signal });
      } catch (error) {
        // Node rejects with an AbortError wrapping the reason; callers expect the reason itself.
        throw signal?.aborted ? signal.reason : error;
      }
      return get<T>(path, attempt + 1);
    }
    if (!res.ok) throw new HevyHttpError(res.status, `GET ${path} → ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async function paginate<T, K extends string = string>(path: string, key: K, pageSize: number, extra = "", pick?: (body: Page<K, T>) => T[]): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const body = await get<Page<K, T>>(`${path}?page=${page}&pageSize=${pageSize}${extra}`);
      all.push(...(pick ? pick(body) : (body[key] ?? [])));
      onProgress?.({ kind: "page", key, page, pageCount: body.page_count });
      if (page >= body.page_count) break;
    }
    onProgress?.({ kind: "pagesDone", key });
    return all;
  }

  const started = now();
  const startedAt = started.toISOString();
  const plan = planSync(await readSaved(file), options.full ? ["--full"] : [], started.getTime());
  if (plan.mode === "full" && options.allowFull === false) throw new FullSyncNeededError(plan.reason);

  let workouts: HevyWorkout[];
  let counts = { added: 0, updated: 0, deleted: 0 };
  if (plan.mode === "incremental") {
    const rawEvents = await paginate<unknown>("/workouts/events", "events", EVENTS_PAGE_SIZE, `&since=${encodeURIComponent(plan.since)}`, eventsOf);
    const result = applyEvents(plan.saved.workouts, rawEvents.map(toWorkoutEvent));
    workouts = result.workouts;
    counts = { added: result.added, updated: result.updated, deleted: result.deleted };
  } else {
    workouts = fromFullSync(await paginate<HevyWorkout>("/workouts", "workouts", 10));
  }
  // Templates are small and have no change feed, so every sync fetches them all.
  const exercise_templates = await paginate<HevyExerciseTemplate>("/exercise_templates", "exercise_templates", 100);

  const dataset: HevyDataset = { source: "hevy", synced_at: startedAt, workouts, exercise_templates };

  // Written only now, after every request has succeeded.
  signal?.throwIfAborted();
  try {
    await mkdir(dirname(file), { recursive: true });
    await writeDatasetAtomically(file, dataset);
  } catch (error) {
    throw new SaveError(error instanceof Error ? error.message : String(error), { cause: error });
  }

  return {
    mode: plan.mode,
    ...(plan.mode === "full" ? { reason: plan.reason } : {}),
    ...counts,
    workouts: workouts.length,
    previousSyncAt: plan.mode === "incremental" ? plan.saved.synced_at : null,
    syncedAt: startedAt,
  };
}
