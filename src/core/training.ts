// Everything derived from the dataset once, before any window or unit applies,
// plus the overview's main lifts and training log. Pure: no DOM, no fetch.
import { trainingDays, type DayLoad } from "./consistency";
import { rangeEndDay } from "./dataset";
import { toLocalDay } from "./dates";
import { bestSet, progressIndex, recordsBy, type ExerciseProgress, type MetricId, type ProgressPoint } from "./progress";
import { filterBetween, type DayWindow } from "./ranges";
import type { HevyDataset, HevyWorkout } from "./types";

/** How many lifts the overview's tracklist shows. */
const MAIN_LIFT_COUNT = 6;

export interface Training {
  data: HevyDataset;
  index: Map<string, ExerciseProgress>;
  /** Every exercise, most sessions first, then by title. */
  exercises: ExerciseProgress[];
  days: Map<string, DayLoad>;
  /** The day every range ends on: today for synced data, the last workout for the sample. */
  endDay: string;
  /** The first workout's local day; `endDay` when there are no workouts. */
  firstDay: string;
}

export function buildTraining(data: HevyDataset, timeZone: string): Training {
  const index = progressIndex(data, timeZone);
  const exercises = [...index.values()].sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title));
  const days = trainingDays(data.workouts, timeZone);
  const endDay = rangeEndDay(data, timeZone);
  let firstDay = endDay;
  for (const day of days.keys()) if (day < firstDay) firstDay = day;
  return { data, index, exercises, days, endDay, firstDay };
}

/** A main lift and how many days it was charted in the window. */
export interface MainLift {
  lift: ExerciseProgress;
  sessions: number;
}

/**
 * The overview's main lifts: the estimated-1RM lifts trained most in `w`, so the
 * tracklist follows what you're training now. Lifts with no session in the window are left out.
 */
export function mainLiftsIn(training: Training, w: DayWindow): MainLift[] {
  return training.exercises
    .filter((e) => e.metric === "e1rm")
    .map((lift) => ({ lift, sessions: filterBetween(lift.points, w).length }))
    .filter((m) => m.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions || a.lift.title.localeCompare(b.lift.title))
    .slice(0, MAIN_LIFT_COUNT);
}

/** One exercise's top set in a logged workout. */
export interface LoggedSet {
  exercise: ExerciseProgress;
  top: ProgressPoint;
  /** An all-time record set in this workout. */
  record: boolean;
}

export interface LatestEntry {
  workout: HevyWorkout;
  day: string;
  sets: LoggedSet[];
}

const FALLBACK_METRICS: readonly MetricId[] = ["weight", "reps", "duration", "distance"];

/** The `limit` most recent workouts, newest first, each with every exercise's top set. */
export function latestEntries(training: Training, limit: number, timeZone: string): LatestEntry[] {
  const latest = training.data.workouts.toSorted((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time)).slice(0, limit);
  return latest.map((w) => {
    const day = toLocalDay(w.start_time, timeZone);
    const sets = w.exercises.flatMap((ex) => {
      const exercise = training.index.get(ex.exercise_template_id);
      if (!exercise) return [];
      const top = bestSet(ex.sets, exercise.metric, day, w.id);
      // Sets that can't give the exercise's measure (say 15 reps on a 1RM lift) still get logged,
      // by their heaviest set, else whatever they record.
      const shown = top ?? FALLBACK_METRICS.map((m) => bestSet(ex.sets, m, day, w.id)).find((p) => p !== undefined);
      if (!shown) return [];
      // An all-time record set in this workout.
      const record = top !== undefined && recordsBy(exercise.points).some((r) => r.date === day && r.workoutId === w.id && r.value === top.value);
      return [{ exercise, top: shown, record }];
    });
    return { workout: w, day, sets };
  });
}
