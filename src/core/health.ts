// Pure helpers for the Activity tab's daily health figures. No DOM.
// A day without a measure has no data; it is never counted as 0.
import { addDays, toLocalDay } from "./dates";
import { windowFor, type DateRange, type DayWindow } from "./ranges";
import type { Training } from "./training";
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

/** The stretch's length: four whole weeks, so each weekday appears four times. */
const STRETCH_DAYS = 28;
/** The usual: the year just before the stretch. */
const USUAL_DAYS = 365;
/** Days with a value needed before a comparison is made, in the stretch and in the usual. */
const MIN_STRETCH_DAYS = 14;
const MIN_USUAL_DAYS = 90;

export type StretchRowId = "training" | MeasureId;
export type StretchStatus = "compared" | "not-enough-data" | "not-synced";

export interface StretchRow {
  id: StretchRowId;
  /** Training: days a week. A health measure: the average per day with a value. */
  recent: number | null;
  usual: number | null;
  status: StretchStatus;
}

export interface RecentStretch {
  from: string; // first day of the 28
  to: string; // the last complete day
  usualFrom: string;
  usualTo: string; // the day before `from`
  /** Training first (left out for a real export beside the Hevy sample), then the measures in MEASURES order. */
  rows: StretchRow[];
}

/** Days from `from` to `to`, inclusive; 0 when `to` is before `from`. Counts calendar days, so time zones can't shift it. */
function daysBetween(from: string, to: string): number {
  let n = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) n++;
  return n;
}

function meanIn(days: readonly HealthDay[], measure: MeasureId, w: DayWindow): { mean: number | null; days: number } {
  const values = valuesIn(days, measure, w);
  return { mean: values.length === 0 ? null : values.reduce((sum, v) => sum + v.value, 0) / values.length, days: values.length };
}

function trainingRow(training: Training, s: Omit<RecentStretch, "rows">, timeZone: string): StretchRow {
  // A sync time that can't be read is treated as no sync, rather than crashing the tab.
  const synced = training.data.synced_at;
  if (training.data.source === "hevy" && (Number.isNaN(Date.parse(synced)) || toLocalDay(synced, timeZone) < s.to)) {
    return { id: "training", recent: null, usual: null, status: "not-synced" };
  }
  const count = (from: string, to: string) => {
    let n = 0;
    for (const day of training.days.keys()) if (day >= from && day <= to) n++;
    return n;
  };
  const recent = count(s.from, s.to) / (STRETCH_DAYS / 7);
  const usualFrom = training.firstDay > s.usualFrom ? training.firstDay : s.usualFrom;
  const spanDays = daysBetween(usualFrom, s.usualTo);
  const usual = spanDays === 0 ? null : count(usualFrom, s.usualTo) / (spanDays / 7);
  const enough = training.days.size > 0 && training.firstDay <= s.from && spanDays >= MIN_USUAL_DAYS;
  return { id: "training", recent, usual, status: enough ? "compared" : "not-enough-data" };
}

/**
 * The last four complete weeks against the year before them, for training days and each health measure.
 * The stretch ends on the earlier of the health views' end day and the day before the export, which the
 * export itself cuts short. Training uses the same dates, so every row describes the same weeks.
 */
export function recentStretch(health: HealthDataset, training: Training, timeZone: string): RecentStretch {
  const hevyIsSample = training.data.source === "sample";
  const endDay = healthEndDay(training.endDay, health, hevyIsSample);
  const lastComplete = addDays(health.export_date, -1);
  const to = endDay < lastComplete ? endDay : lastComplete;
  const from = addDays(to, -(STRETCH_DAYS - 1));
  const usualTo = addDays(from, -1);
  const dates = { from, to, usualFrom: addDays(usualTo, -(USUAL_DAYS - 1)), usualTo };

  const rows: StretchRow[] = [];
  // Sample workouts never sit beside a real export.
  if (!(hevyIsSample && health.source === "apple-health")) rows.push(trainingRow(training, dates, timeZone));
  for (const { id } of MEASURES) {
    const recent = meanIn(health.days, id, { from, to });
    const usual = meanIn(health.days, id, { from: dates.usualFrom, to: usualTo });
    const enough = recent.days >= MIN_STRETCH_DAYS && usual.days >= MIN_USUAL_DAYS && usual.mean! > 0;
    rows.push({ id, recent: recent.mean, usual: usual.mean, status: enough ? "compared" : "not-enough-data" });
  }
  return { ...dates, rows };
}

/** A day's steps band for the calendar: 1–6 by fixed step counts, 0 when there are no steps. */
export type StepBand = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** The lowest step count of bands 1–6. */
export const STEP_BAND_FLOORS: readonly number[] = [0, 5000, 7500, 10000, 15000, 20000];

export function stepBand(steps: number | undefined): StepBand {
  if (steps === undefined) return 0;
  let band = 1;
  while (band < STEP_BAND_FLOORS.length && steps >= STEP_BAND_FLOORS[band]!) band++;
  return band as StepBand;
}

/** The Health days keyed by date. With `exportDate`, the export day and any after it are left out: they're cut short, not low. */
export function healthByDay(days: readonly HealthDay[], exportDate?: string): Map<string, HealthDay> {
  return new Map(days.filter((d) => exportDate === undefined || d.date < exportDate).map((d) => [d.date, d]));
}
