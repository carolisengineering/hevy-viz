// Checks on a loaded dataset, run once where data enters the app. Pure, no DOM.
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
