// Display formatting shared by every view, the chart and its table.
import { parseDay } from "./core/dates";
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
