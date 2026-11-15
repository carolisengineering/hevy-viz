// Pure metric functions. No DOM, no fetch — so the dashboard and a future
// MCP server can share them.
import { toLocalDay, weekStart } from "./dates";
import { filterByRange, type DateRange } from "./ranges";
import type { HevyDataset, HevySet, HevyWorkout } from "./types";

/** Estimates get unreliable past this many reps; ignore them rather than mislead. */
const MAX_REPS_FOR_ESTIMATE = 12;

/** Epley estimated one-rep max. Returns null for sets that can't be estimated. */
export function estimateOneRepMax({ weight_kg, reps }: Pick<HevySet, "weight_kg" | "reps">): number | null {
  if (weight_kg == null || reps == null || weight_kg <= 0 || reps <= 0) return null;
  if (reps === 1) return weight_kg;
  if (reps > MAX_REPS_FOR_ESTIMATE) return null;
  return weight_kg * (1 + reps / 30);
}

const isWorkingSet = (s: HevySet) => s.type !== "warmup";

export interface E1rmPoint {
  date: string; // YYYY-MM-DD, local to the time zone the history was built for
  e1rm: number; // kg
  weightKg: number;
  reps: number;
  workoutId: string;
}

/** Map<templateId, history> — see e1rmIndex. */
export type E1rmIndex = Map<string, E1rmPoint[]>;

/**
 * Best estimated 1RM per local training day for every exercise, oldest first,
 * in one pass over all sets. Exercises with no estimable set are absent.
 */
export function e1rmIndex(workouts: readonly HevyWorkout[], timeZone: string): E1rmIndex {
  const best = new Map<string, Map<string, E1rmPoint>>(); // templateId → day → best point
  for (const w of workouts) {
    const date = toLocalDay(w.start_time, timeZone);
    for (const ex of w.exercises) {
      for (const s of ex.sets) {
        if (!isWorkingSet(s)) continue;
        const e1rm = estimateOneRepMax(s);
        if (e1rm == null) continue;
        let byDay = best.get(ex.exercise_template_id);
        if (!byDay) best.set(ex.exercise_template_id, (byDay = new Map()));
        const prev = byDay.get(date);
        if (!prev || e1rm > prev.e1rm) {
          // estimateOneRepMax returned a number, so weight and reps are set.
          byDay.set(date, { date, e1rm, weightKg: s.weight_kg!, reps: s.reps!, workoutId: w.id });
        }
      }
    }
  }
  const index: E1rmIndex = new Map();
  for (const [templateId, byDay] of best) {
    index.set(templateId, [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)));
  }
  return index;
}

/** Best estimated 1RM per local training day for one exercise template, oldest first. */
export function e1rmHistory(workouts: readonly HevyWorkout[], templateId: string, timeZone: string): E1rmPoint[] {
  return e1rmIndex(workouts, timeZone).get(templateId) ?? [];
}

/** Points where the estimated 1RM beat every earlier session. */
export function personalRecords(history: readonly E1rmPoint[]): E1rmPoint[] {
  let best = -Infinity;
  const prs: E1rmPoint[] = [];
  for (const p of history) {
    if (p.e1rm > best) {
      prs.push(p);
      best = p.e1rm;
    }
  }
  return prs;
}

export interface E1rmSummary {
  /** Points in the range, oldest first. */
  history: E1rmPoint[];
  /** All-time PRs that fall in the range. */
  prs: E1rmPoint[];
  /** Latest point in the range. */
  current: E1rmPoint | undefined;
  /** Latest minus earliest estimate in the range, in kg; null with no points in the range. */
  change: number | null;
  /** Latest point of all time, even if it's before the range; for saying when the lift was last done. */
  lastSession: E1rmPoint | undefined;
}

/**
 * One exercise's full history narrowed to `range`, which ends on `endDay` ("YYYY-MM-DD",
 * usually today). PRs are judged against the full history, then narrowed, so a range
 * can't invent them.
 */
export function e1rmSummary(all: readonly E1rmPoint[], range: DateRange, endDay: string): E1rmSummary {
  const history = filterByRange(all, range, endDay);
  const first = history[0];
  const current = history.at(-1);
  return {
    history,
    prs: filterByRange(personalRecords(all), range, endDay),
    current,
    change: first && current ? current.e1rm - first.e1rm : null,
    lastSession: all.at(-1),
  };
}

/** Working sets per primary muscle group per local week: Map<week, Map<muscle, sets>>. */
export function weeklySetsByMuscle(data: HevyDataset, timeZone: string): Map<string, Map<string, number>> {
  const muscleOf = new Map(data.exercise_templates.map((t) => [t.id, t.primary_muscle_group]));
  const out = new Map<string, Map<string, number>>();
  for (const w of data.workouts) {
    const week = weekStart(toLocalDay(w.start_time, timeZone));
    const bucket = out.get(week) ?? new Map<string, number>();
    for (const ex of w.exercises) {
      const muscle = muscleOf.get(ex.exercise_template_id) ?? "other";
      const n = ex.sets.filter(isWorkingSet).length;
      bucket.set(muscle, (bucket.get(muscle) ?? 0) + n);
    }
    out.set(week, bucket);
  }
  return out;
}

export interface ExerciseSummary {
  templateId: string;
  title: string;
  sessions: number;
}

/** Exercises ordered by how many sessions include them. */
export function exercisesByFrequency(workouts: readonly HevyWorkout[]): ExerciseSummary[] {
  const counts = new Map<string, ExerciseSummary>();
  for (const w of workouts) {
    const seen = new Set<string>();
    for (const ex of w.exercises) {
      if (seen.has(ex.exercise_template_id)) continue;
      seen.add(ex.exercise_template_id);
      const s = counts.get(ex.exercise_template_id) ?? {
        templateId: ex.exercise_template_id,
        title: ex.title,
        sessions: 0,
      };
      s.sessions++;
      counts.set(ex.exercise_template_id, s);
    }
  }
  return [...counts.values()].sort((a, b) => b.sessions - a.sessions);
}

/** Like exercisesByFrequency, but only exercises with at least one 1RM estimate in `index`. */
export function liftsByFrequency(workouts: readonly HevyWorkout[], index: E1rmIndex): ExerciseSummary[] {
  return exercisesByFrequency(workouts).filter((e) => index.has(e.templateId));
}
