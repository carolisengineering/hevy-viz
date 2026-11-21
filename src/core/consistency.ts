// How often training happens: per-day load, monthly sessions and the week grid.
// Pure: no DOM, no fetch.
import { addDays, MS_PER_DAY, parseDay, toLocalDay, weekStart } from "./dates";
import { weeksIn, type DayWindow } from "./ranges";
import type { HevyWorkout } from "./types";

export interface DayLoad {
  sessions: number;
  /** Working sets (warmups excluded). */
  sets: number;
  /** Time trained, overlapping workouts counted once. */
  minutes: number;
}

const MS_PER_MINUTE = 60_000;

/** A workout's length in minutes; null when its end can't be read or comes before its start. */
export function workoutMinutes(w: Pick<HevyWorkout, "start_time" | "end_time">): number | null {
  const start = Date.parse(w.start_time);
  const end = Date.parse(w.end_time);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  return (end - start) / MS_PER_MINUTE;
}

/** Minutes covered by `intervals` ([start, end] in ms), each minute counted once. */
function unionMinutes(intervals: [number, number][]): number {
  let total = 0;
  let current: [number, number] | null = null;
  for (const [start, end] of intervals.toSorted((a, b) => a[0] - b[0])) {
    if (current && start <= current[1]) current[1] = Math.max(current[1], end);
    else {
      if (current) total += current[1] - current[0];
      current = [start, end];
    }
  }
  if (current) total += current[1] - current[0];
  return total / MS_PER_MINUTE;
}

/** Sessions, working sets and minutes per local day. A workout belongs to the day it started. */
export function trainingDays(workouts: readonly HevyWorkout[], timeZone: string): Map<string, DayLoad> {
  const days = new Map<string, DayLoad>();
  const intervals = new Map<string, [number, number][]>();
  for (const w of workouts) {
    const day = toLocalDay(w.start_time, timeZone);
    let load = days.get(day);
    if (!load) days.set(day, (load = { sessions: 0, sets: 0, minutes: 0 }));
    load.sessions += 1;
    for (const ex of w.exercises) load.sets += ex.sets.filter((s) => s.type !== "warmup").length;
    if (workoutMinutes(w) == null) continue;
    let list = intervals.get(day);
    if (!list) intervals.set(day, (list = []));
    list.push([Date.parse(w.start_time), Date.parse(w.end_time)]);
  }
  for (const [day, list] of intervals) days.get(day)!.minutes = unionMinutes(list);
  return days;
}

/** Months are compared as "YYYY-MM" and counted as year * 12 + month. */
const monthNumber = (day: string): number => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;

const MAX_AVERAGE_MONTHS = 12;

/**
 * Sessions in `endDay`'s month, and the average over the complete months before it:
 * at most 12, never counting months before the first month trained. The average is
 * null when there is no complete month to average.
 */
export function monthlySessions(
  days: ReadonlyMap<string, DayLoad>,
  endDay: string,
): { thisMonth: number; monthlyAverage: number | null } {
  const current = monthNumber(endDay);
  let firstMonth = Infinity;
  for (const day of days.keys()) firstMonth = Math.min(firstMonth, monthNumber(day));
  const from = Math.max(firstMonth, current - MAX_AVERAGE_MONTHS);

  let thisMonth = 0;
  let earlier = 0;
  for (const [day, load] of days) {
    const m = monthNumber(day);
    if (m === current && day <= endDay) thisMonth += load.sessions;
    else if (m >= from && m < current) earlier += load.sessions;
  }
  const months = current - from;
  return { thisMonth, monthlyAverage: months > 0 ? earlier / months : null };
}

export interface GridWeek {
  /** Monday of the week. */
  weekStart: string;
  /** Monday onward; the final week stops at the end day. */
  days: { day: string; sets: number }[];
}

/** `weeks` Monday-first week columns, the last one containing `endDay`. */
export function dayGrid(days: ReadonlyMap<string, DayLoad>, endDay: string, weeks: number): GridWeek[] {
  const lastWeek = weekStart(endDay);
  const grid: GridWeek[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(lastWeek, -7 * i);
    const week: GridWeek = { weekStart: start, days: [] };
    for (let d = 0; d < 7; d++) {
      const day = addDays(start, d);
      if (day > endDay) break;
      week.days.push({ day, sets: days.get(day)?.sets ?? 0 });
    }
    grid.push(week);
  }
  return grid;
}

export interface WindowStats {
  sessions: number;
  /** Days with at least one session. */
  trainingDays: number;
  /** Monday-first weeks the window touches. */
  weeks: number;
  /** Of those weeks, the ones with a session. */
  weeksTrained: number;
  /** `sessions / weeks`, rounded to 0.1. */
  sessionsPerWeek: number;
}

const daysBetween = (from: string, to: string): number => Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / MS_PER_DAY);

/** How often training happened in `w`. */
export function windowStats(days: ReadonlyMap<string, DayLoad>, w: DayWindow): WindowStats {
  let sessions = 0;
  let trainingDays = 0;
  const trainedWeeks = new Set<string>();
  for (const [day, load] of days) {
    if (day < w.from || day > w.to || load.sessions === 0) continue;
    sessions += load.sessions;
    trainingDays += 1;
    trainedWeeks.add(weekStart(day));
  }
  const weeks = weeksIn(w);
  return { sessions, trainingDays, weeks, weeksTrained: trainedWeeks.size, sessionsPerWeek: Math.round((sessions / weeks) * 10) / 10 };
}

/** Minutes trained in `w`, and the average over its days with time (null when there are none). */
export function windowTime(days: ReadonlyMap<string, DayLoad>, w: DayWindow): { minutes: number; averagePerTrainingDay: number | null } {
  let minutes = 0;
  let timedDays = 0;
  for (const [day, load] of days) {
    if (day < w.from || day > w.to || load.minutes <= 0) continue;
    minutes += load.minutes;
    timedDays += 1;
  }
  return { minutes, averagePerTrainingDay: timedDays > 0 ? minutes / timedDays : null };
}

export type Period = "week" | "month";

/** The first day of the period after the one starting on `start`. */
const nextPeriod = (start: string, by: Period): string => {
  if (by === "week") return addDays(start, 7);
  const [year, month] = [Number(start.slice(0, 4)), Number(start.slice(5, 7))];
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
};

const periodStart = (day: string, by: Period): string => (by === "week" ? weekStart(day) : `${day.slice(0, 7)}-01`);

/**
 * Minutes and training days per Monday-first week or calendar month, for every period `w`
 * touches, oldest first, empty ones included. Only days inside `w` count, so the first
 * and last periods can be partial.
 */
export function timeByPeriod(
  days: ReadonlyMap<string, DayLoad>,
  w: DayWindow,
  by: Period,
): { start: string; minutes: number; trainingDays: number }[] {
  const periods = new Map<string, { start: string; minutes: number; trainingDays: number }>();
  for (let start = periodStart(w.from, by); start <= w.to; start = nextPeriod(start, by)) periods.set(start, { start, minutes: 0, trainingDays: 0 });
  for (const [day, load] of days) {
    if (day < w.from || day > w.to) continue;
    const period = periods.get(periodStart(day, by))!;
    period.minutes += load.minutes;
    if (load.sessions > 0) period.trainingDays += 1;
  }
  return [...periods.values()];
}

/**
 * The longest run of consecutive days in `w` without a session: `from` and `to` are its
 * first and last rest days. Null when every day in the window has a session.
 */
export function longestBreak(days: ReadonlyMap<string, DayLoad>, w: DayWindow): { from: string; to: string; days: number } | null {
  let best: { from: string; to: string; days: number } | null = null;
  let runStart: string | null = null;
  const close = (lastRest: string) => {
    if (runStart == null) return;
    const length = daysBetween(runStart, lastRest) + 1;
    if (!best || length > best.days) best = { from: runStart, to: lastRest, days: length };
    runStart = null;
  };
  for (let day = w.from; day <= w.to; day = addDays(day, 1)) {
    if ((days.get(day)?.sessions ?? 0) > 0) close(addDays(day, -1));
    else runStart ??= day;
  }
  close(w.to);
  return best;
}
