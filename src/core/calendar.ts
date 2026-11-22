// The training calendar: months laid out as Monday-first weeks, and a day's workouts.
// Pure: no DOM, no fetch.
import type { DayLoad } from "./consistency";
import { addDays, parseDay } from "./dates";
import type { DayWindow } from "./ranges";
import { latestEntries, type LatestEntry, type Training } from "./training";

export interface CalendarDay {
  day: string;
  /** Working sets (warmups excluded). */
  sets: number;
  sessions: number;
  /** Whether the day is inside the window; days outside it aren't drawn as trained. */
  inWindow: boolean;
}

export interface CalendarMonth {
  /** "YYYY-MM" */
  month: string;
  /** Sessions on days inside the window. */
  sessions: number;
  /** Days inside the window with a session. */
  trainingDays: number;
  /** Monday-first rows of seven; null pads before the 1st and after the month's last day. */
  weeks: (CalendarDay | null)[][];
}

/** The "YYYY-MM" month before `month`. */
function previousMonth(month: string): string {
  const [year, m] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))];
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

function layOutMonth(month: string, days: ReadonlyMap<string, DayLoad>, w: DayWindow): CalendarMonth {
  const first = `${month}-01`;
  const cells: (CalendarDay | null)[] = Array.from({ length: (parseDay(first).getUTCDay() + 6) % 7 }, () => null);
  let sessions = 0;
  let trainingDays = 0;
  for (let day = first; day.startsWith(month); day = addDays(day, 1)) {
    const load = days.get(day);
    const inWindow = day >= w.from && day <= w.to;
    const cell = { day, sets: load?.sets ?? 0, sessions: load?.sessions ?? 0, inWindow };
    if (inWindow && cell.sessions > 0) {
      sessions += cell.sessions;
      trainingDays += 1;
    }
    cells.push(cell);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { month, sessions, trainingDays, weeks };
}

/** Every month `w` touches, newest first. */
export function calendarMonths(days: ReadonlyMap<string, DayLoad>, w: DayWindow): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  const oldest = w.from.slice(0, 7);
  for (let month = w.to.slice(0, 7); month >= oldest; month = previousMonth(month)) months.push(layOutMonth(month, days, w));
  return months;
}

/** The latest day in `w` with a session, or null when there is none. */
export function latestTrainingDay(days: ReadonlyMap<string, DayLoad>, w: DayWindow): string | null {
  let latest: string | null = null;
  for (const [day, load] of days) {
    if (load.sessions > 0 && day >= w.from && day <= w.to && (latest == null || day > latest)) latest = day;
  }
  return latest;
}

/** The day to show: `linked` when it's inside `w` (even a rest day), else the latest training day. */
export function pickDay(days: ReadonlyMap<string, DayLoad>, w: DayWindow, linked: string | undefined): string | null {
  return linked != null && linked >= w.from && linked <= w.to ? linked : latestTrainingDay(days, w);
}

/** A day's workouts, oldest first, each with every exercise's top set, as the training log works them out. */
export function dayEntries(training: Training, day: string, timeZone: string): LatestEntry[] {
  return latestEntries(training, Infinity, timeZone, { from: day, to: day }).toReversed();
}
