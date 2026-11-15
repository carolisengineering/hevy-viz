// Date-range filtering for day-keyed series. Pure, no DOM.
import { addDays } from "./dates";

export type RangeId = "90d" | "1y" | "all";

export interface DateRange {
  id: RangeId;
  label: string;
  /** Length in days, or null for all time. */
  days: number | null;
}

export const RANGES: readonly DateRange[] = [
  { id: "90d", label: "90 days", days: 90 },
  { id: "1y", label: "1 year", days: 365 },
  { id: "all", label: "All time", days: null },
];

export function rangeById(id: RangeId): DateRange {
  const range = RANGES.find((r) => r.id === id);
  if (!range) throw new Error(`Unknown range: ${id}`);
  return range;
}

/**
 * Points dated within `range` ending at `anchor` (a "YYYY-MM-DD" day), inclusive.
 * `points` must be sorted oldest first; the result keeps that order.
 */
export function filterByRange<T extends { date: string }>(points: readonly T[], range: DateRange, anchor: string): T[] {
  const from = range.days == null ? "" : addDays(anchor, -range.days);
  return points.filter((p) => p.date >= from && p.date <= anchor);
}
