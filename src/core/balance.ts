// Where the training goes: working sets per week by muscle and by muscle group.
// Pure: no DOM, no fetch.
import { addDays, MS_PER_DAY, parseDay, toLocalDay } from "./dates";
import { MAIN_GROUPS, muscleGroup, type MuscleGroup } from "./muscles";
import type { DateRange } from "./ranges";
import type { HevyDataset } from "./types";

export interface MuscleVolume {
  /** Hevy primary muscle id, or "other" without a template. */
  muscle: string;
  setsPerWeek: number;
}

/** Working sets per primary muscle in the window, and the window's length in weeks. */
function setsByMuscle(data: HevyDataset, timeZone: string, range: DateRange, endDay: string) {
  const muscleOf = new Map(data.exercise_templates.map((t) => [t.id, t.primary_muscle_group]));
  const days = data.workouts.map((w) => toLocalDay(w.start_time, timeZone));
  let from = range.days == null ? endDay : addDays(endDay, -range.days);
  if (range.days == null) for (const d of days) if (d < from) from = d;

  const counts = new Map<string, number>();
  data.workouts.forEach((w, i) => {
    if (days[i] < from || days[i] > endDay) return;
    for (const ex of w.exercises) {
      const n = ex.sets.filter((s) => s.type !== "warmup").length;
      if (n === 0) continue;
      const muscle = muscleOf.get(ex.exercise_template_id) ?? "other";
      counts.set(muscle, (counts.get(muscle) ?? 0) + n);
    }
  });
  const weeks = Math.max(1, (parseDay(endDay).getTime() - parseDay(from).getTime()) / MS_PER_DAY / 7);
  return { counts, weeks };
}

/**
 * Every muscle trained in `range` ending on `endDay`, busiest first. Weeks run from the
 * range start (or the first workout, for all time) to `endDay`, and are at least one.
 */
export function setsPerWeekByMuscle(data: HevyDataset, timeZone: string, range: DateRange, endDay: string): MuscleVolume[] {
  const { counts, weeks } = setsByMuscle(data, timeZone, range, endDay);
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
