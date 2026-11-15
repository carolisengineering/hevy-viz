// Everything derived from the dataset once, before any range or unit applies.
import { useMemo } from "react";
import { trainingDays, type DayLoad } from "../core/consistency";
import { rangeEndDay } from "../core/dataset";
import { localTimeZone } from "../core/dates";
import { progressIndex, type ExerciseProgress } from "../core/progress";
import { filterByRange, type DateRange } from "../core/ranges";
import type { HevyDataset } from "../core/types";

export const TIME_ZONE = localTimeZone();

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
}

export function buildTraining(data: HevyDataset, timeZone: string): Training {
  const index = progressIndex(data, timeZone);
  const exercises = [...index.values()].sort((a, b) => b.sessions - a.sessions || a.title.localeCompare(b.title));
  return {
    data,
    index,
    exercises,
    days: trainingDays(data.workouts, timeZone),
    endDay: rangeEndDay(data, timeZone),
  };
}

/** A main lift and how many sessions it had in the range. */
export interface MainLift {
  lift: ExerciseProgress;
  sessions: number;
}

/**
 * The overview's main lifts: the estimated-1RM lifts trained most in `range`, so the
 * tracklist follows what you're training now. Lifts with no session in the range are left out.
 */
export function mainLiftsIn(training: Training, range: DateRange): MainLift[] {
  return training.exercises
    .filter((e) => e.metric === "e1rm")
    .map((lift) => ({ lift, sessions: filterByRange(lift.points, range, training.endDay).length }))
    .filter((m) => m.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions || a.lift.title.localeCompare(b.lift.title))
    .slice(0, MAIN_LIFT_COUNT);
}

/** Built once per dataset; switching views, ranges or units reuses it. */
export function useTraining(data: HevyDataset): Training {
  return useMemo(() => buildTraining(data, TIME_ZONE), [data]);
}
