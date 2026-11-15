// Whole-dataset helpers: checks run once where data enters the app, and the
// day date ranges end on. Pure, no DOM.
import { toLocalDay } from "./dates";
import type { HevyDataset, HevyWorkout } from "./types";

/** True for a string that parses to a real instant. */
const isTimestamp = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

const hasValidStart = (w: HevyWorkout) => isTimestamp(w.start_time);

/**
 * Drops workouts whose start_time can't be read as a timestamp, so one bad
 * record from the API can't break every chart (date helpers throw on them).
 * Returns the input unchanged when nothing is dropped.
 */
export function dropUndatedWorkouts(data: HevyDataset): { data: HevyDataset; skipped: number } {
  if (data.workouts.every(hasValidStart)) return { data, skipped: 0 };
  const workouts = data.workouts.filter(hasValidStart);
  return { data: { ...data, workouts }, skipped: data.workouts.length - workouts.length };
}

/**
 * The day date ranges end on: today for synced data. The sample is a fixed
 * snapshot, so its ranges end on its last workout day; ending them at today
 * would leave the public demo empty once the snapshot is old.
 */
export function rangeEndDay(data: HevyDataset, timeZone: string, now = new Date()): string {
  const today = toLocalDay(now.toISOString(), timeZone);
  if (data.source !== "sample" || data.workouts.length === 0) return today;
  return data.workouts.map((w) => toLocalDay(w.start_time, timeZone)).reduce((a, b) => (b > a ? b : a));
}
