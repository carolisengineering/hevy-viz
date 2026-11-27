// Display formatting shared by every view, the chart and its table.
import { parseDay } from "./core/dates";
import { MEASURES, STEP_BAND_FLOORS, type MeasureId, type RecentStretch, type StretchRow, type StretchRowId } from "./core/health";
import type { HealthDay } from "./core/types";
import { METRIC_LABEL, type MetricId, type ProgressPoint } from "./core/progress";

// Days are UTC midnights (see core/dates), so format in UTC to keep the same date.
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Nov 14, 2026" for a "YYYY-MM-DD" day. */
export const formatDate = (day: string): string => dateFormat.format(parseDay(day));

// Measure- and unit-aware formatting.

export type Unit = "kg" | "lb";

/** The unit used when none is chosen or asked for, in the dashboard and the MCP server alike. */
export const DEFAULT_UNIT: Unit = "lb";

const KG_PER_LB = 0.45359237;

/** A weight rounded for display: 0.1 kg, or whole pounds. */
const roundWeight = (kg: number, unit: Unit): number => (unit === "lb" ? Math.round(kg / KG_PER_LB) : Math.round(kg * 10) / 10);

/** "116.7" or "118" in kg; "220" in lb. No unit suffix. */
export const formatWeight = (kg: number, unit: Unit): string => String(roundWeight(kg, unit));

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "0:45", "1:45", "1:02:03" */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

/** "800 m", "5 km", "12.3 km" */
export function formatDistance(meters: number): string {
  if (Math.round(meters) < 1000) return `${Math.round(meters)} m`;
  return `${Math.round(meters / 100) / 10} km`;
}

/** A value in its measure's format, without the unit for weights and reps. */
export function formatValue(metric: MetricId, value: number, unit: Unit): string {
  switch (metric) {
    case "e1rm":
    case "weight":
      return formatWeight(value, unit);
    case "reps":
      return String(Math.round(value));
    case "duration":
      return formatDuration(value);
    case "distance":
      return formatDistance(value);
  }
}

/** The unit shown beside a value: "kg", "lb", "reps", or "" when the value carries its own. */
export function valueUnit(metric: MetricId, unit: Unit): string {
  if (metric === "e1rm" || metric === "weight") return unit;
  return metric === "reps" ? "reps" : "";
}

/** The magnitude a change displays as, so "±0" matches what the reader would see. */
function displayedMagnitude(metric: MetricId, delta: number, unit: Unit): number {
  const abs = Math.abs(delta);
  if (metric === "e1rm" || metric === "weight") return roundWeight(abs, unit);
  return metric === "distance" && abs >= 1000 ? Math.round(abs / 100) : Math.round(abs);
}

/** "+6.5", "−2.5" (true minus sign), "+0:15", or "±0" when it displays as zero. */
export function formatChange(metric: MetricId, delta: number, unit: Unit): string {
  if (displayedMagnitude(metric, delta, unit) === 0) return "±0";
  return `${delta > 0 ? "+" : "−"}${formatValue(metric, Math.abs(delta), unit)}`;
}

/** The set behind a point: "150 × 5", "+30 × 5", "12 reps", "1:45", "5 km in 25:00", "40 kg · 40 m". */
export function formatPointSet(p: ProgressPoint, type: string, unit: Unit): string {
  const weight = p.weightKg != null ? formatWeight(p.weightKg, unit) : null;
  if (weight != null && type === "short_distance_weight" && p.distanceM != null) return `${weight} ${unit} · ${formatDistance(p.distanceM)}`;
  if (weight != null && type === "weight_duration" && p.durationS != null) return `${weight} ${unit} · ${formatDuration(p.durationS)}`;
  if (weight != null && p.reps != null) {
    const sign = type === "bodyweight_weighted" ? "+" : type === "bodyweight_assisted" ? "−" : "";
    return `${sign}${weight} × ${p.reps}`;
  }
  if (p.reps != null) return `${p.reps} ${p.reps === 1 ? "rep" : "reps"}`;
  if (p.distanceM != null) return p.durationS != null ? `${formatDistance(p.distanceM)} in ${formatDuration(p.durationS)}` : formatDistance(p.distanceM);
  if (p.durationS != null) return formatDuration(p.durationS);
  return weight != null ? `${weight} ${unit}` : "";
}

const shortDateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const fullDateFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "November 2026" for a "YYYY-MM" month. */
export const formatMonth = (month: string): string => monthFormat.format(parseDay(`${month}-01`));

/** "Tue, Nov 3, 2026" */
export const formatFullDate = (day: string): string => fullDateFormat.format(parseDay(day));

const clockFormats = new Map<string, Intl.DateTimeFormat>();

/** "6:42 PM": the time an ISO timestamp shows in `timeZone`. */
export function formatClock(iso: string, timeZone: string): string {
  let format = clockFormats.get(timeZone);
  if (!format) clockFormats.set(timeZone, (format = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone })));
  // Newer ICU puts a narrow no-break space before AM/PM; write a plain one.
  return format.format(new Date(iso)).replace(/\s/g, " ");
}

/** "58 min", "1 h 12 min", "1 h", rounded to whole minutes. */
export function formatMinutes(minutes: number): string {
  const total = Math.round(minutes);
  const [h, m] = [Math.floor(total / 60), total % 60];
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "Nov 14" */
export const formatShortDate = (day: string): string => shortDateFormat.format(parseDay(day));

/** "Fri 11/13", for the training log. */
export const formatLogDate = (day: string): string =>
  `${weekdayFormat.format(parseDay(day))} ${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;

const countFormat = new Intl.NumberFormat("en-US");

/** "1,432" */
export const formatCount = (n: number): string => countFormat.format(n);

/** How one measure is written on the chart, its table and its tooltip. */
export interface ChartFormat {
  /** A stored value as text, without the unit: "172.5", "1:45", "5 km". */
  value: (v: number) => string;
  /** Written small after values: "kg", "lb", "reps", or "". */
  unit: string;
  /** The set behind a point: "150 × 5". */
  set: (p: ProgressPoint) => string;
  /** The measure's name, for the table's column: "Est. 1RM". */
  measure: string;
  /** Display units per stored unit (2.2046… for pounds), so axis ticks land on round display values. */
  scale: number;
}

/** How a measure is written on its chart and table, for an exercise type and unit. */
export function chartFormat(metric: MetricId, type: string, unit: Unit): ChartFormat {
  const isWeight = metric === "e1rm" || metric === "weight";
  return {
    value: (v) => formatValue(metric, v, unit),
    unit: valueUnit(metric, unit),
    set: (p) => formatPointSet(p, type, unit),
    measure: METRIC_LABEL[metric],
    scale: isWeight && unit === "lb" ? 1 / KG_PER_LB : 1,
  };
}

const KM_PER_MILE = 1.609344;

/** A distance in km as the header's unit shows it, to 0.1: miles for lb, km for kg. One conversion for the table and the chart. */
const distanceText = (km: number, unit: Unit): string => (unit === "lb" ? km / KM_PER_MILE : km).toFixed(1);

/** "8,412", "3.6 mi" or "5.9 km" (lb means miles), "41 min", "512 kcal", "7h05": one day's figure for a health measure. */
export function formatHealth(measure: MeasureId, value: number, unit: Unit): string {
  switch (measure) {
    case "steps":
      return formatCount(Math.round(value));
    case "distance":
      return `${distanceText(value, unit)} ${unit === "lb" ? "mi" : "km"}`;
    case "exercise":
      return `${Math.round(value)} min`;
    case "calories":
      return `${formatCount(Math.round(value))} kcal`;
    case "sleep": {
      const total = Math.round(value);
      return `${Math.floor(total / 60)}h${String(total % 60).padStart(2, "0")}`;
    }
  }
}

const DAY_TOTAL_SUFFIX: Record<MeasureId, string> = { steps: " steps", distance: "", exercise: " exercise", calories: "", sleep: " sleep" };

/** "9,300 steps · 4.1 mi · 46 min exercise · 540 kcal · 7h20 sleep": the day's measures in Activity-tab order, missing ones left out; "" when it has none. */
export function formatDayTotals(day: HealthDay, unit: Unit): string {
  return MEASURES.flatMap(({ id, key }) => {
    const value = day[key];
    return value === undefined ? [] : [`${formatHealth(id, value, unit)}${DAY_TOTAL_SUFFIX[id]}`];
  }).join(" · ");
}

/** A steps band's range for the legend: "under 5,000", "5,000–7,499", …, "20,000+". */
export function stepBandLabel(band: 1 | 2 | 3 | 4 | 5 | 6): string {
  const from = STEP_BAND_FLOORS[band - 1]!;
  const next = STEP_BAND_FLOORS[band];
  if (band === 1) return `under ${formatCount(next!)}`;
  return next === undefined ? `${formatCount(from)}+` : `${formatCount(from)}–${formatCount(next - 1)}`;
}

const shortMonthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

/** "Oct", or "Oct 2025" when the month isn't in `currentYear`. */
export function formatMonthShort(month: string, currentYear: string): string {
  const name = shortMonthFormat.format(parseDay(`${month}-01`));
  return month.slice(0, 4) === currentYear ? name : `${name} ${month.slice(0, 4)}`;
}

/** "2025", "2026, to Nov 13", "2025, from Nov 14", or "2026, May 1 to Aug 31" for a year the range cuts at both ends. */
export function formatYearLabel(y: { year: string; partialFrom?: string; partialTo?: string }): string {
  const { year, partialFrom: from, partialTo: to } = y;
  if (from && to) return `${year}, ${formatShortDate(from)} to ${formatShortDate(to)}`;
  if (from) return `${year}, from ${formatShortDate(from)}`;
  if (to) return `${year}, to ${formatShortDate(to)}`;
  return year;
}

/**
 * How a health measure is written on its detail chart: values in stored units (km, minutes) become
 * the header unit's display value with the unit apart, and `scale` puts axis ticks on round display
 * values (miles, hours). No set text: a point is a month's average.
 */
export function healthFormat(measure: MeasureId, unit: Unit): ChartFormat {
  const base = { set: () => "", measure: "", scale: 1 };
  switch (measure) {
    case "distance":
      return { ...base, value: (v) => distanceText(v, unit), unit: unit === "lb" ? "mi" : "km", scale: unit === "lb" ? 1 / KM_PER_MILE : 1 };
    case "exercise":
      return { ...base, value: (v) => String(Math.round(v)), unit: "min" };
    case "calories":
      return { ...base, value: (v) => formatCount(Math.round(v)), unit: "kcal" };
    case "sleep":
      return { ...base, value: (v) => formatHealth("sleep", v, unit), unit: "", scale: 1 / 60 };
    case "steps":
      return { ...base, value: (v) => formatCount(Math.round(v)), unit: "" };
  }
}

// The "Last 4 weeks" card. Four-week averages wobble on their own, so small differences read as "about the same".
const SAME_PERCENT = 5;
const SAME_SLEEP_MIN = 10;

export const STRETCH_LABELS: Record<StretchRowId, string> = {
  training: "Training",
  steps: "Steps",
  distance: "Distance",
  exercise: "Exercise",
  calories: "Active calories",
  sleep: "Sleep",
};

/** "2.5 days a week", or a health measure's daily figure ("8,412", "7h05"); "—" when there is none. */
export function stretchValue(row: StretchRow, unit: Unit): string {
  if (row.recent == null) return "—";
  return row.id === "training" ? `${row.recent.toFixed(1)} days a week` : formatHealth(row.id, row.recent, unit);
}

/** "12% below", "25 min less", "usual 3.4", "about the same", "not enough data" or "sync Hevy to include". */
export function stretchComparison(row: StretchRow, _unit: Unit): string {
  if (row.status === "not-synced") return "sync Hevy to include";
  if (row.status === "not-enough-data" || row.recent == null || row.usual == null) return "not enough data";
  if (row.id === "training") return `usual ${row.usual.toFixed(1)}`;
  const diff = row.recent - row.usual;
  if (row.id === "sleep") {
    if (Math.abs(diff) < SAME_SLEEP_MIN) return "about the same";
    return `${Math.round(Math.abs(diff) / 5) * 5} min ${diff > 0 ? "more" : "less"}`;
  }
  const percent = (diff * 100) / row.usual;
  if (Math.abs(percent) < SAME_PERCENT) return "about the same";
  return `${Math.round(Math.abs(percent))}% ${percent > 0 ? "above" : "below"}`;
}

/** "Oct 24 – Nov 20", or "Oct 24 – Nov 20, 2025" when the stretch ended before `currentYear`, so an old export never reads as recent. */
export function stretchDates(s: RecentStretch, currentYear: string): string {
  const dates = `${formatShortDate(s.from)} – ${formatShortDate(s.to)}`;
  return s.to.slice(0, 4) === currentYear ? dates : `${dates}, ${s.to.slice(0, 4)}`;
}
