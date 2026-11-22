// Date-range filtering for day-keyed series. Pure, no DOM.
import { addDays, MS_PER_DAY, parseDay, weekStart } from "./dates";

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

/** Inclusive "YYYY-MM-DD" days. */
export interface DayWindow {
  from: string;
  to: string;
}

/** Monday-first weeks `w` touches. Days are UTC midnights, so daylight saving can't skew the count. */
export function weeksIn(w: DayWindow): number {
  return Math.round((parseDay(weekStart(w.to)).getTime() - parseDay(weekStart(w.from)).getTime()) / MS_PER_DAY) / 7 + 1;
}

/**
 * The days `range` covers ending on `endDay`. All time starts at `firstDay`, the first
 * workout day ("" when unknown, which keeps every earlier point).
 */
export function windowFor(range: DateRange, endDay: string, firstDay = ""): DayWindow {
  return { from: range.days == null ? firstDay : addDays(endDay, -range.days), to: endDay };
}

/** Points dated within `w`, both ends included. Keeps the input order. */
export function filterBetween<T extends { date: string }>(points: readonly T[], w: DayWindow): T[] {
  return points.filter((p) => p.date >= w.from && p.date <= w.to);
}

/** How a series is grouped: by Monday-first week, or by calendar month. */
export type Period = "week" | "month";

/** Series longer than this many weeks go by month. */
export const MAX_SERIES_WEEKS = 104;

/** How a series over `w` is grouped: by week, or by month past 104 weeks. */
export const seriesBy = (w: DayWindow): Period => (weeksIn(w) > MAX_SERIES_WEEKS ? "month" : "week");

/** The first day of the period containing `day`: its Monday, or the 1st of its month. */
export const periodStart = (day: string, by: Period): string => (by === "week" ? weekStart(day) : `${day.slice(0, 7)}-01`);

/** The first day of the period after the one starting on `start`. */
function nextPeriod(start: string, by: Period): string {
  if (by === "week") return addDays(start, 7);
  const [year, month] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/** The first day of every period `w` touches, oldest first. */
export function periodsIn(w: DayWindow, by: Period): string[] {
  const starts: string[] = [];
  for (let start = periodStart(w.from, by); start <= w.to; start = nextPeriod(start, by)) starts.push(start);
  return starts;
}
