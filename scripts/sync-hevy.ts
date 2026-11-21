// Pulls your Hevy history into data/hevy.json (git-ignored, never built into dist/).
// The first sync downloads everything; later ones fetch only what changed.
// Usage: HEVY_API_KEY=... npm run sync          (add `-- --full` to download everything again)
// The key is a Hevy Pro developer key: https://hevy.com/settings?developer
import { mkdir, readFile } from "node:fs/promises";
import type { HevyDataset, HevyExerciseTemplate, HevyWorkout } from "../src/core/types.ts";
import { applyEvents, eventsOf, toWorkoutEvent } from "./apply-events.ts";
import { HevyHttpError, RateLimitError, SaveError, exitCodeFor } from "./exitCodes.ts";
import { MAX_RETRIES, planRetry } from "./retry.ts";
import { planSync } from "./sync-mode.ts";
import { writeDatasetAtomically } from "./write-dataset.ts";

const BASE = "https://api.hevyapp.com/v1";
const DATA_FILE = "data/hevy.json";
const EVENTS_PAGE_SIZE = 10; // the maximum /workouts/events accepts
const count = (n: number) => n.toLocaleString("en-US");
const apiKey = process.env.HEVY_API_KEY;
if (!apiKey) {
  console.error("Set HEVY_API_KEY (Hevy Pro → Settings → Developer).");
  process.exit(1);
}

async function get<T>(path: string, attempt = 1): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { "api-key": apiKey!, accept: "application/json" } });
  if (res.status === 429) {
    const plan = planRetry(attempt, res.headers.get("retry-after"));
    if (!plan.retry) throw new RateLimitError(`GET ${path} → 429: ${plan.reason}`);
    // Leading newline: don't overwrite the pagination progress line.
    console.warn(`\nRate-limited on ${path}; retrying in ${Math.ceil(plan.waitMs / 1000)} s (retry ${attempt}/${MAX_RETRIES}).`);
    await new Promise((r) => setTimeout(r, plan.waitMs));
    return get<T>(path, attempt + 1);
  }
  if (!res.ok) throw new HevyHttpError(res.status, `GET ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** A Hevy list response: `{ page_count, [key]: items }`. */
type Page<K extends string, T> = { page_count: number } & { [P in K]?: T[] };

async function paginate<T, K extends string = string>(path: string, key: K, pageSize: number, extra = "", pick?: (body: Page<K, T>) => T[]): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const body = await get<Page<K, T>>(`${path}?page=${page}&pageSize=${pageSize}${extra}`);
    all.push(...(pick ? pick(body) : (body[key] ?? [])));
    process.stdout.write(`\r${key}: page ${page}/${body.page_count}`);
    if (page >= body.page_count) break;
  }
  process.stdout.write("\n");
  return all;
}

/** The saved file's text; null when there isn't one. Any other read error is not a save failure, so it propagates as is. */
async function readSaved(): Promise<string | null> {
  try {
    return await readFile(DATA_FILE, "utf8");
  } catch (error) {
    if ((error as { code?: unknown }).code === "ENOENT") return null;
    throw error;
  }
}

// Kingdom Keys reads the exit code to say why a sync failed (see exitCodes.ts).
try {
  const startedAt = new Date().toISOString();
  const plan = planSync(await readSaved(), process.argv.slice(2));

  let workouts: HevyWorkout[];
  let summary: string;
  if (plan.mode === "incremental") {
    const rawEvents = await paginate<unknown>("/workouts/events", "events", EVENTS_PAGE_SIZE, `&since=${encodeURIComponent(plan.since)}`, eventsOf);
    const result = applyEvents(plan.saved.workouts, rawEvents.map(toWorkoutEvent));
    workouts = result.workouts;
    const time = new Date(plan.saved.synced_at).toLocaleString();
    const changed = result.added + result.updated + result.deleted > 0;
    summary = changed
      ? `Synced since ${time}: ${count(result.added)} new, ${count(result.updated)} updated, ${count(result.deleted)} deleted. ${count(workouts.length)} workouts`
      : `No workout changes since ${time}. ${count(workouts.length)} workouts`;
  } else {
    workouts = await paginate<HevyWorkout>("/workouts", "workouts", 10);
    summary = `Full sync (${plan.reason}). Saved ${count(workouts.length)} workouts`;
  }
  // Templates are small and have no change feed, so every sync fetches them all.
  const exercise_templates = await paginate<HevyExerciseTemplate>("/exercise_templates", "exercise_templates", 100);

  const dataset: HevyDataset = { source: "hevy", synced_at: startedAt, workouts, exercise_templates };

  // Outside public/ so `npm run build` never ships personal data; vite.config.ts serves it in dev.
  // Written only now, after every request has succeeded.
  try {
    await mkdir("data", { recursive: true });
    await writeDatasetAtomically(DATA_FILE, dataset);
  } catch (error) {
    throw new SaveError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  console.log(`${summary} → ${DATA_FILE}`);
} catch (error) {
  console.error(error);
  // Not process.exit: it can cut off stderr when that is a pipe. Let the process end on its own.
  process.exitCode = exitCodeFor(error);
}
