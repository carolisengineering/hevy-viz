// How often training happens: per-day load, monthly sessions and the week grid.
// Pure: no DOM, no fetch.
import { addDays, MS_PER_DAY, parseDay, toLocalDay, weekStart } from "./dates";
import type { DayWindow } from "./ranges";
import type { HevyWorkout } from "./types";

export interface DayLoad {
  sessions: number;
  /** Working sets (warmups excluded). */
  sets: number;
}

/** Sessions and working sets per local day. */
export function trainingDays(workouts: readonly HevyWorkout[], timeZone: string): Map<string, DayLoad> {
  const days = new Map<string, DayLoad>();
  for (const w of workouts) {
    const day = toLocalDay(w.start_time, timeZone);
    let load = days.get(day);
    if (!load) days.set(day, (load = { sessions: 0, sets: 0 }));
    load.sessions += 1;
    for (const ex of w.exercises) load.sets += ex.sets.filter((s) => s.type !== "warmup").length;
  }
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
  const weeks = daysBetween(weekStart(w.from), weekStart(w.to)) / 7 + 1;
  return { sessions, trainingDays, weeks, weeksTrained: trainedWeeks.size, sessionsPerWeek: Math.round((sessions / weeks) * 10) / 10 };
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
