// Pulls your full Hevy history into data/hevy.json (git-ignored, never built into dist/).
// Usage: HEVY_API_KEY=... npm run sync
// The key is a Hevy Pro developer key: https://hevy.com/settings?developer
import { mkdir, writeFile } from "node:fs/promises";
import type { HevyDataset, HevyExerciseTemplate, HevyWorkout } from "../src/core/types.ts";

const BASE = "https://api.hevyapp.com/v1";
const apiKey = process.env.HEVY_API_KEY;
if (!apiKey) {
  console.error("Set HEVY_API_KEY (Hevy Pro → Settings → Developer).");
  process.exit(1);
}

const MAX_RETRIES = 5;

/** How long to wait before retry `attempt`: the server's Retry-After if given, else exponential backoff. */
function retryDelayMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const until = Date.parse(retryAfter); // HTTP-date form
    if (Number.isFinite(until)) return Math.max(0, until - Date.now());
  }
  return 1000 * 2 ** attempt;
}

async function get<T>(path: string, attempt = 1): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { "api-key": apiKey!, accept: "application/json" } });
  if (res.status === 429 && attempt <= MAX_RETRIES) {
    await new Promise((r) => setTimeout(r, retryDelayMs(attempt, res.headers.get("retry-after"))));
    return get<T>(path, attempt + 1);
  }
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${await res.text()}`);
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

const workouts = await paginate<HevyWorkout>("/workouts", "workouts", 10);
const exercise_templates = await paginate<HevyExerciseTemplate>("/exercise_templates", "exercise_templates", 100);

const dataset: HevyDataset = {
  source: "hevy",
  synced_at: new Date().toISOString(),
  workouts,
  exercise_templates,
};

// Outside public/ so `npm run build` never ships personal data; vite.config.ts serves it in dev.
await mkdir("data", { recursive: true });
await writeFile("data/hevy.json", JSON.stringify(dataset));
console.log(`Saved ${workouts.length} workouts → data/hevy.json`);
