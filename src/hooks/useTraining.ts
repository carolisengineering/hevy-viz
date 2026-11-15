// Everything derived from the dataset once, before any range or unit applies.
import { useMemo } from "react";
import { trainingDays, type DayLoad } from "../core/consistency";
import { rangeEndDay } from "../core/dataset";
import { localTimeZone } from "../core/dates";
import { progressIndex, type ExerciseProgress } from "../core/progress";
import type { HevyDataset } from "../core/types";

export const TIME_ZONE = localTimeZone();

/** How many lifts the overview's tracklist shows. */
const MAIN_LIFT_COUNT = 6;

export interface Training {
  data: HevyDataset;
  index: Map<string, ExerciseProgress>;
  /** Every exercise, most sessions first, then by title. */
  exercises: ExerciseProgress[];
  /** The most-trained lifts charted by estimated 1RM. */
  mainLifts: ExerciseProgress[];
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
    mainLifts: exercises.filter((e) => e.metric === "e1rm" && e.points.length > 0).slice(0, MAIN_LIFT_COUNT),
    days: trainingDays(data.workouts, timeZone),
    endDay: rangeEndDay(data, timeZone),
  };
}

/** Built once per dataset; switching views, ranges or units reuses it. */
export function useTraining(data: HevyDataset): Training {
  return useMemo(() => buildTraining(data, TIME_ZONE), [data]);
}
