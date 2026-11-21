// Pulls your full Hevy history into data/hevy.json (git-ignored, never built into dist/).
// Usage: HEVY_API_KEY=... npm run sync
// The key is a Hevy Pro developer key: https://hevy.com/settings?developer
import { mkdir, writeFile } from "node:fs/promises";
import type { HevyDataset, HevyExerciseTemplate, HevyWorkout } from "../src/core/types.ts";
import { HevyHttpError, RateLimitError, SaveError, exitCodeFor } from "./exitCodes.ts";
import { MAX_RETRIES, planRetry } from "./retry.ts";

const BASE = "https://api.hevyapp.com/v1";
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

async function paginate<T, K extends string = string>(path: string, key: K, pageSize: number): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    const body = await get<Page<K, T>>(`${path}?page=${page}&pageSize=${pageSize}`);
    all.push(...(body[key] ?? []));
    process.stdout.write(`\r${key}: page ${page}/${body.page_count}`);
    if (page >= body.page_count) break;
  }
  process.stdout.write("\n");
  return all;
}

// Kingdom Keys reads the exit code to say why a sync failed (see exitCodes.ts).
try {
  const workouts = await paginate<HevyWorkout>("/workouts", "workouts", 10);
  const exercise_templates = await paginate<HevyExerciseTemplate>("/exercise_templates", "exercise_templates", 100);

  const dataset: HevyDataset = {
    source: "hevy",
    synced_at: new Date().toISOString(),
    workouts,
    exercise_templates,
  };

  // Outside public/ so `npm run build` never ships personal data; vite.config.ts serves it in dev.
  try {
    await mkdir("data", { recursive: true });
    await writeFile("data/hevy.json", JSON.stringify(dataset));
  } catch (error) {
    throw new SaveError("Couldn't save data/hevy.json", { cause: error });
  }
  console.log(`Saved ${workouts.length} workouts → data/hevy.json`);
} catch (error) {
  console.error(error);
  process.exit(exitCodeFor(error));
}
