// Generates two years of believable training and daily activity data so the dashboard can be
// demoed publicly without exposing anyone's real workouts.
// Usage: npm run sample
import { mkdir, writeFile } from "node:fs/promises";
import { MS_PER_DAY } from "../src/core/dates.ts";
import type { HealthDataset, HealthDay, HevyDataset, HevyExercise, HevyExerciseTemplate, HevyWorkout } from "../src/core/types.ts";

/** Seeded linear congruential PRNG so the sample is stable between runs. */
function makeRng(seed: number): () => number {
  return () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}

interface LiftSpec {
  title: string;
  primary: string;
  secondary: readonly string[];
  /** Working weight on day one, kg. */
  startKg: number;
  /** Rough gain over the first year, kg; it tapers after that. */
  gainKgPerYear: number;
}

// One entry per lift: its Hevy template and its progression, kept together.
const LIFTS = {
  bench: { title: "Bench Press (Barbell)", primary: "chest", secondary: ["triceps", "shoulders"], startKg: 50, gainKgPerYear: 15 },
  squat: { title: "Squat (Barbell)", primary: "quadriceps", secondary: ["glutes"], startKg: 70, gainKgPerYear: 30 },
  deadlift: { title: "Deadlift (Barbell)", primary: "hamstrings", secondary: ["lower_back", "glutes"], startKg: 90, gainKgPerYear: 35 },
  ohp: { title: "Overhead Press (Barbell)", primary: "shoulders", secondary: ["triceps"], startKg: 32.5, gainKgPerYear: 8 },
  row: { title: "Bent Over Row (Barbell)", primary: "upper_back", secondary: ["biceps"], startKg: 50, gainKgPerYear: 15 },
  pullup: { title: "Lat Pulldown (Cable)", primary: "lats", secondary: ["biceps"], startKg: 45, gainKgPerYear: 15 },
} as const satisfies Record<string, LiftSpec>;

type LiftId = keyof typeof LIFTS;

const templates: HevyExerciseTemplate[] = Object.entries(LIFTS).map(([id, l]) => ({
  id,
  title: l.title,
  type: "weight_reps",
  primary_muscle_group: l.primary,
  secondary_muscle_groups: [...l.secondary],
}));

/** Four-day upper/lower rotation. A typo in a lift id fails type-checking. */
const ROTATION: ReadonlyArray<readonly [title: string, lifts: readonly LiftId[]]> = [
  ["Upper A", ["bench", "row", "ohp"]],
  ["Lower A", ["squat", "deadlift"]],
  ["Upper B", ["ohp", "pullup", "bench"]],
  ["Lower B", ["deadlift", "squat"]],
];

const TRAINING_WEEKDAYS = [1, 2, 4, 5]; // Mon/Tue/Thu/Fri (getUTCDay)
const SKIP_CHANCE = 0.12;
const WORKING_SETS = 3;
const SESSION_MINUTES = 60;
const MS_PER_MINUTE = 60_000;
const BEGIN = new Date("2024-11-18T00:00:00Z");
const END = new Date("2026-11-13T00:00:00Z");

const rand = makeRng(42);
const roundToPlate = (kg: number) => Math.round(kg / 2.5) * 2.5;

function workingWeight(id: LiftId, years: number, dip: number): number {
  const { startKg, gainKgPerYear } = LIFTS[id];
  const trend = startKg + gainKgPerYear * years * (1 - years * 0.15);
  const dayToDayNoise = 0.97 + rand() * 0.06;
  return roundToPlate(trend * dip * dayToDayNoise);
}

function makeExercise(id: LiftId, index: number, years: number, dip: number): HevyExercise {
  const working = workingWeight(id, years, dip);
  const topReps = 5 + Math.floor(rand() * 4);
  const sets = [
    { index: 0, type: "warmup" as const, weight_kg: roundToPlate(working * 0.5), reps: 10 },
    ...Array.from({ length: WORKING_SETS }, (_, i) => ({
      index: i + 1,
      type: "normal" as const,
      weight_kg: working,
      reps: Math.max(3, topReps - i), // fatigue: one fewer rep each set
    })),
  ];
  return { index, title: LIFTS[id].title, exercise_template_id: id, sets };
}

const workouts: HevyWorkout[] = [];
let rotation = 0;

for (let d = new Date(BEGIN); d < END; d.setUTCDate(d.getUTCDate() + 1)) {
  if (!TRAINING_WEEKDAYS.includes(d.getUTCDay())) continue;
  if (rand() < SKIP_CHANCE) continue;
  const years = (d.getTime() - BEGIN.getTime()) / (365 * MS_PER_DAY);
  // A deload-ish dip around month 9 makes the chart honest-looking.
  const dip = years > 0.7 && years < 0.8 ? 0.9 : 1;
  const [title, lifts] = ROTATION[rotation++ % ROTATION.length];
  const exercises = lifts.map((id, index) => makeExercise(id, index, years, dip));

  const startTime = new Date(d);
  startTime.setUTCHours(17, Math.floor(rand() * 60));
  workouts.push({
    id: `sample-${workouts.length}`,
    title,
    start_time: startTime.toISOString(),
    end_time: new Date(startTime.getTime() + SESSION_MINUTES * MS_PER_MINUTE).toISOString(),
    exercises,
  });
}

const dataset: HevyDataset = { source: "sample", synced_at: new Date().toISOString(), workouts, exercise_templates: templates };
await mkdir("public/data", { recursive: true });
await writeFile("public/data/sample.json", JSON.stringify(dataset));
console.log(`Saved ${workouts.length} sample workouts → public/data/sample.json`);

// Daily Apple Health figures, from their own seeded generator so the workouts above never change.
const HEALTH_BEGIN = new Date("2024-11-14T00:00:00Z");
const HEALTH_END = new Date("2026-11-13T00:00:00Z");
const WATCH_START = "2025-06-02";
const NOT_WORN_CHANCE = 1 / 12;
const healthRand = makeRng(7);
const between = (lo: number, hi: number) => lo + healthRand() * (hi - lo);

const days: HealthDay[] = [];
for (let d = new Date(HEALTH_BEGIN); d <= HEALTH_END; d.setUTCDate(d.getUTCDate() + 1)) {
  const date = d.toISOString().slice(0, 10);
  const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
  const trained = TRAINING_WEEKDAYS.includes(d.getUTCDay());
  const steps = Math.round(between(5500, 9500) * (weekend ? 1.15 : 1));
  const day: HealthDay = { date, steps, distance_km: Math.round(steps * between(0.00068, 0.00076) * 100) / 100 };
  if (date >= WATCH_START) {
    if (healthRand() >= NOT_WORN_CHANCE) {
      day.exercise_min = Math.round(between(8, 25) + (trained ? between(30, 45) : 0));
      day.active_kcal = Math.round(day.exercise_min * between(5, 7) + between(150, 250));
    }
    day.sleep_min = Math.round(between(380, 500));
  }
  days.push(day);
}

const health: HealthDataset = { source: "sample", imported_at: "2026-11-13T00:00:00.000Z", export_date: "2026-11-13", days };
await writeFile("public/data/sample-health.json", JSON.stringify(health));
console.log(`Saved ${days.length} sample health days → public/data/sample-health.json`);
