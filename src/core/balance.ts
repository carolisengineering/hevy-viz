// Where the training goes: working sets per week by muscle and by muscle group.
// Pure: no DOM, no fetch.
import { MS_PER_DAY, parseDay, toLocalDay } from "./dates";
import { MAIN_GROUPS, muscleGroup, type MuscleGroup } from "./muscles";
import { periodsIn, periodStart, windowFor, type DateRange, type DayWindow, type Period } from "./ranges";
import type { HevyDataset } from "./types";

export interface MuscleVolume {
  /** Hevy primary muscle id, or "other" without a template. */
  muscle: string;
  setsPerWeek: number;
}

/** Working sets per primary muscle in `w`, and the window's length in weeks (at least one). */
function setsByMuscle(data: HevyDataset, timeZone: string, w: DayWindow) {
  const muscleOf = new Map(data.exercise_templates.map((t) => [t.id, t.primary_muscle_group]));
  const counts = new Map<string, number>();
  for (const workout of data.workouts) {
    const day = toLocalDay(workout.start_time, timeZone);
    if (day < w.from || day > w.to) continue;
    for (const ex of workout.exercises) {
      const n = ex.sets.filter((s) => s.type !== "warmup").length;
      if (n === 0) continue;
      const muscle = muscleOf.get(ex.exercise_template_id) ?? "other";
      counts.set(muscle, (counts.get(muscle) ?? 0) + n);
    }
  }
  const weeks = Math.max(1, (parseDay(w.to).getTime() - parseDay(w.from).getTime()) / MS_PER_DAY / 7);
  return { counts, weeks };
}

/**
 * Every muscle trained in `range` ending on `endDay`, busiest first. Weeks run from the
 * range start (or the first workout, for all time) to `endDay`, and are at least one.
 */
export function setsPerWeekByMuscle(data: HevyDataset, timeZone: string, range: DateRange, endDay: string): MuscleVolume[] {
  let firstDay = endDay;
  if (range.days == null) {
    for (const w of data.workouts) {
      const day = toLocalDay(w.start_time, timeZone);
      if (day < firstDay) firstDay = day;
    }
  }
  return setsPerWeekByMuscleIn(data, timeZone, windowFor(range, endDay, firstDay));
}

/** Every muscle trained in `w`, busiest first, in working sets per week over the window's length. */
export function setsPerWeekByMuscleIn(data: HevyDataset, timeZone: string, w: DayWindow): MuscleVolume[] {
  const { counts, weeks } = setsByMuscle(data, timeZone, w);
  return [...counts]
    .map(([muscle, n]) => ({ muscle, setsPerWeek: n / weeks }))
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek || a.muscle.localeCompare(b.muscle));
}

export interface GroupVolume {
  group: MuscleGroup;
  setsPerWeek: number;
  /** Under half the median of the six main groups. */
  light: boolean;
}

const LIGHT_FRACTION = 0.5;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** The six main groups in `MAIN_GROUPS` order, each flagged when light relative to the others. */
export function setsPerWeekByGroup(data: HevyDataset, timeZone: string, range: DateRange, endDay: string): GroupVolume[] {
  return groupVolumes(setsPerWeekByMuscle(data, timeZone, range, endDay));
}

/** The six main groups from muscle volumes already computed, so a view showing both scans the workouts once. */
export function groupVolumes(muscles: readonly MuscleVolume[]): GroupVolume[] {
  const totals = new Map<MuscleGroup, number>(MAIN_GROUPS.map((g) => [g, 0]));
  for (const { muscle, setsPerWeek } of muscles) {
    const group = muscleGroup(muscle);
    if (totals.has(group)) totals.set(group, totals.get(group)! + setsPerWeek);
  }
  const threshold = LIGHT_FRACTION * median([...totals.values()]);
  return MAIN_GROUPS.map((group) => {
    const setsPerWeek = totals.get(group)!;
    return { group, setsPerWeek, light: setsPerWeek < threshold };
  });
}

/** Working sets in one period, for each of the six main groups in `MAIN_GROUPS` order. */
export interface GroupPeriod {
  /** The period's first day: a Monday, or the 1st of a month. */
  start: string;
  sets: number[];
}

/**
 * Working sets per period for the six main groups, for every period `w` touches, oldest
 * first, empty ones as zeros. Only days inside `w` count, so the first and last periods
 * can be partial. Full body, cardio and exercises without a template aren't counted.
 */
export function setsByPeriodAndGroup(data: HevyDataset, timeZone: string, w: DayWindow, by: Period): GroupPeriod[] {
  const muscleOf = new Map(data.exercise_templates.map((t) => [t.id, t.primary_muscle_group]));
  const periods = new Map(periodsIn(w, by).map((start): [string, GroupPeriod] => [start, { start, sets: MAIN_GROUPS.map(() => 0) }]));
  for (const workout of data.workouts) {
    const day = toLocalDay(workout.start_time, timeZone);
    if (day < w.from || day > w.to) continue;
    const period = periods.get(periodStart(day, by))!;
    for (const ex of workout.exercises) {
      const muscle = muscleOf.get(ex.exercise_template_id);
      const group = muscle == null ? -1 : MAIN_GROUPS.indexOf(muscleGroup(muscle));
      if (group === -1) continue;
      period.sets[group] += ex.sets.filter((s) => s.type !== "warmup").length;
    }
  }
  return [...periods.values()];
}
