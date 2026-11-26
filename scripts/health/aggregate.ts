import type { HealthDay } from "../../src/core/types.ts";

/** One parsed record or summary; times are wall time "YYYY-MM-DD HH:MM:SS" (offset dropped). */
export type HealthRecord =
  | { kind: "quantity"; type: "steps" | "distance"; source: string; watch: boolean; start: string; end: string; value: number; unit: string }
  | { kind: "sleep"; source: string; start: string; end: string; asleep: boolean }
  | { kind: "summary"; date: string; activeEnergy: number; activeEnergyUnit: string; exerciseMin: number };

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const KM_PER_MILE = 1.609344;
const KJ_PER_KCAL = 4.184;

export type Interval = readonly [startMs: number, endMs: number];

/** Wall time as epoch ms, read as if it were UTC. Only differences and calendar fields are used, so DST never enters. */
export function wallMs(wall: string): number {
  return Date.parse(`${wall.replace(" ", "T")}Z`);
}

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hourKey = (ms: number) => new Date(ms).toISOString().slice(0, 13).replace("T", " ");

/** Share of `value` that falls in each wall-clock hour ("YYYY-MM-DD HH"), in proportion to time. A zero-length record goes wholly to its start hour. */
export function splitByHour(startMs: number, endMs: number, value: number): Map<string, number> {
  const shares = new Map<string, number>();
  if (endMs <= startMs) {
    shares.set(hourKey(startMs), value);
    return shares;
  }
  const total = endMs - startMs;
  for (let hourStart = Math.floor(startMs / HOUR_MS) * HOUR_MS; hourStart < endMs; hourStart += HOUR_MS) {
    const overlap = Math.min(endMs, hourStart + HOUR_MS) - Math.max(startMs, hourStart);
    shares.set(hourKey(hourStart), (value * overlap) / total);
  }
  return shares;
}

/** For each hour, the largest total across sources (not the sum). */
export function hourlyMax(bySource: Iterable<Map<string, number>>): Map<string, number> {
  const best = new Map<string, number>();
  for (const hours of bySource) {
    for (const [hour, value] of hours) best.set(hour, Math.max(best.get(hour) ?? 0, value));
  }
  return best;
}

/** Sum hourly totals into local days ("YYYY-MM-DD"). */
export function sumByDay(hours: Map<string, number>): Map<string, number> {
  const days = new Map<string, number>();
  for (const [hour, value] of hours) {
    const day = hour.slice(0, 10);
    days.set(day, (days.get(day) ?? 0) + value);
  }
  return days;
}

/** Merge overlapping or touching intervals into a sorted, disjoint list. */
export function unionIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/** The day a sleep interval belongs to: D when it ends in (D-1 18:00, D 18:00]. A night files under the morning, a nap under its own day. */
export function nightDay(endMs: number): string {
  return isoDate(endMs + 6 * HOUR_MS - 1);
}

export function toKilometers(value: number, unit: string): number {
  return unit === "mi" ? value * KM_PER_MILE : value;
}

export function toKilocalories(value: number, unit: string): number {
  return unit === "kJ" ? value / KJ_PER_KCAL : value;
}

type QuantityType = "steps" | "distance";

export class HealthAggregator {
  private readonly quantities: Record<QuantityType, Map<string, Map<string, number>>> = { steps: new Map(), distance: new Map() };
  private readonly watchDays = new Set<string>();
  private readonly summaries = new Map<string, { kcal: number; exerciseMin: number }>();
  private readonly asleep: Interval[] = [];

  add(record: HealthRecord): void {
    if (record.kind === "quantity") {
      const startMs = wallMs(record.start);
      const value = record.type === "distance" ? toKilometers(record.value, record.unit) : record.value;
      const bySource = this.quantities[record.type];
      let hours = bySource.get(record.source);
      if (!hours) bySource.set(record.source, (hours = new Map()));
      for (const [hour, share] of splitByHour(startMs, wallMs(record.end), value)) hours.set(hour, (hours.get(hour) ?? 0) + share);
      if (record.watch) this.watchDays.add(isoDate(startMs));
    } else if (record.kind === "sleep") {
      if (record.asleep) {
        const start = wallMs(record.start);
        const end = wallMs(record.end);
        if (end > start) this.asleep.push([start, end]); // an empty or backwards interval is bad data
      }
    } else {
      this.summaries.set(record.date, { kcal: toKilocalories(record.activeEnergy, record.activeEnergyUnit), exerciseMin: record.exerciseMin });
    }
  }

  /** Rows for every day with at least one measure, ascending. */
  days(): HealthDay[] {
    const rows = new Map<string, HealthDay>();
    const row = (date: string) => {
      let r = rows.get(date);
      if (!r) rows.set(date, (r = { date }));
      return r;
    };

    for (const [day, total] of sumByDay(hourlyMax(this.quantities.steps.values()))) row(day).steps = Math.round(total);
    for (const [day, total] of sumByDay(hourlyMax(this.quantities.distance.values()))) row(day).distance_km = Math.round(total * 100) / 100;

    for (const day of this.watchDays) {
      const ring = this.summaries.get(day);
      if (!ring) continue;
      const r = row(day);
      r.active_kcal = Math.round(ring.kcal);
      r.exercise_min = Math.round(ring.exerciseMin);
    }

    const sleepMs = new Map<string, number>();
    for (const [start, end] of unionIntervals(this.asleep)) {
      const day = nightDay(end);
      sleepMs.set(day, (sleepMs.get(day) ?? 0) + (end - start));
    }
    for (const [day, ms] of sleepMs) row(day).sleep_min = Math.round(ms / MINUTE_MS);

    return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
