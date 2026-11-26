// Pure helpers for the Activity tab's daily health figures. No DOM.
// A day without a measure has no data; it is never counted as 0.
import { addDays } from "./dates";
import { windowFor, type DateRange, type DayWindow } from "./ranges";
import type { HealthDataset, HealthDay } from "./types";

export type MeasureId = "steps" | "distance" | "exercise" | "calories" | "sleep";

export const MEASURES: readonly { id: MeasureId; key: keyof Omit<HealthDay, "date">; label: string }[] = [
  { id: "steps", key: "steps", label: "Steps per day" },
  { id: "distance", key: "distance_km", label: "Distance per day" },
  { id: "exercise", key: "exercise_min", label: "Exercise per day" },
  { id: "calories", key: "active_kcal", label: "Active calories per day" },
  { id: "sleep", key: "sleep_min", label: "Sleep per night" },
];

const keyOf = (measure: MeasureId) => MEASURES.find((m) => m.id === measure)!.key;

export interface MonthAverage {
  month: string; // "YYYY-MM"
  value: number;
  days: number;
}

/** Days inside `w` that have a value for `measure`, with that value. */
function valuesIn(days: readonly HealthDay[], measure: MeasureId, w: DayWindow): { date: string; value: number }[] {
  const key = keyOf(measure);
  const out: { date: string; value: number }[] = [];
  for (const d of days) {
    const value = d[key];
    if (value != null && d.date >= w.from && d.date <= w.to) out.push({ date: d.date, value });
  }
  return out;
}

/** Averages over days with a value, grouped by the first `length` characters of the date. */
function groupAverages(values: { date: string; value: number }[], length: number) {
  const groups = new Map<string, { sum: number; days: number }>();
  for (const { date, value } of values) {
    const key = date.slice(0, length);
    const g = groups.get(key) ?? { sum: 0, days: 0 };
    g.sum += value;
    g.days += 1;
    groups.set(key, g);
  }
  return [...groups].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, g]) => ({ key, value: g.sum / g.days, days: g.days }));
}

/** Average per calendar month over days in `w` with a value. A month with no values is left out. */
export function monthlyAverages(days: readonly HealthDay[], measure: MeasureId, w: DayWindow): MonthAverage[] {
  return groupAverages(valuesIn(days, measure, w), 7).map(({ key, value, days }) => ({ month: key, value, days }));
}

export interface YearAverage {
  year: string;
  value: number;
  days: number;
  partialFrom?: string;
  partialTo?: string;
}

/**
 * Average per calendar year. `partialTo` is the window's end when it falls inside that year,
 * and `partialFrom` where the year's coverage starts when that is after its first day: the window's
 * start, or the measure's own first day when that is later (exercise before the Watch).
 */
export function yearlyAverages(
  days: readonly HealthDay[],
  measure: MeasureId,
  w: DayWindow,
): YearAverage[] {
  const first = firstDayOf(days, measure);
  const from = first != null && first > w.from ? first : w.from;
  return groupAverages(valuesIn(days, measure, w), 4).map(({ key, value, days }) => ({
    year: key,
    value,
    days,
    ...(from.slice(0, 4) === key && from > `${key}-01-01` && { partialFrom: from }),
    ...(w.to.slice(0, 4) === key && w.to < `${key}-12-31` && { partialTo: w.to }),
  }));
}

/** Average over days in `w` with a value; null when there are none. */
export function windowAverage(days: readonly HealthDay[], measure: MeasureId, w: DayWindow): number | null {
  const values = valuesIn(days, measure, w);
  return values.length === 0 ? null : values.reduce((sum, v) => sum + v.value, 0) / values.length;
}

/** The most recent month before the one containing `endDay` that has any value. */
export function latestCompleteMonth(days: readonly HealthDay[], measure: MeasureId, endDay: string): MonthAverage | null {
  const months = monthlyAverages(days, measure, { from: "", to: addDays(`${endDay.slice(0, 7)}-01`, -1) });
  return months.at(-1) ?? null;
}

/** The first day with a value for `measure`, or null. Days are ascending. */
export function firstDayOf(days: readonly HealthDay[], measure: MeasureId): string | null {
  const key = keyOf(measure);
  return days.find((d) => d[key] != null)?.date ?? null;
}

/** The days `range` covers ending on `endDay`; all time starts at the first health day. */
export function healthWindow(range: DateRange, endDay: string, days: readonly HealthDay[]): DayWindow {
  return windowFor(range, endDay, days[0]?.date ?? "");
}

/**
 * The end day for health views. Normally the earlier of the Hevy end day and the export's date:
 * the export is a manual file that can be weeks older than today, and days after it have no data
 * yet, so they must not count as complete months or extend a partial year. The exception is a real
 * export beside the Hevy sample, whose end day is frozen at the sample's last workout and says
 * nothing about the export; there the view ends on the export date.
 */
export function healthEndDay(hevyEndDay: string, data: HealthDataset, hevyIsSample: boolean): string {
  if (hevyIsSample && data.source === "apple-health") return data.export_date;
  return hevyEndDay < data.export_date ? hevyEndDay : data.export_date;
}
