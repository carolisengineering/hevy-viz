import { useMemo } from "react";
import { rangeEndDay } from "../core/dataset";
import { localTimeZone } from "../core/dates";
import { e1rmIndex, e1rmSummary, liftsByFrequency, type E1rmSummary, type ExerciseSummary } from "../core/metrics";
import { rangeById, type RangeId } from "../core/ranges";
import type { HevyDataset } from "../core/types";

/** How many lifts the exercise picker offers, most frequent first. */
const MAX_PICKER_LIFTS = 12;

const TIME_ZONE = localTimeZone();

export interface E1rmView extends E1rmSummary {
  /** Lifts with 1RM data, most frequent first. */
  lifts: ExerciseSummary[];
  /** The chosen lift, or the most frequent one; undefined when no lift has data. */
  selected: ExerciseSummary | undefined;
}

/**
 * Everything the 1RM view shows. The index over all exercises is built once
 * per dataset; changing the lift or range is then a lookup plus a filter.
 */
export function useE1rmView(data: HevyDataset, templateId: string, rangeId: RangeId): E1rmView {
  const index = useMemo(() => e1rmIndex(data.workouts, TIME_ZONE), [data]);
  const endDay = useMemo(() => rangeEndDay(data, TIME_ZONE), [data]);
  const lifts = useMemo(() => liftsByFrequency(data.workouts, index).slice(0, MAX_PICKER_LIFTS), [data, index]);
  const selected = lifts.find((l) => l.templateId === templateId) ?? lifts[0];

  const summary = useMemo(
    () => e1rmSummary((selected && index.get(selected.templateId)) ?? [], rangeById(rangeId), endDay),
    [index, selected, rangeId, endDay],
  );

  return { ...summary, lifts, selected };
}
