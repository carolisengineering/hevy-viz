// Progress for every exercise, charted by the measure its Hevy type supports.
// Pure: no DOM, no fetch.
import { toLocalDay } from "./dates";
import { estimateOneRepMax } from "./metrics";
import { filterByRange, type DateRange } from "./ranges";
import type { HevyDataset, HevySet } from "./types";

export type MetricId = "e1rm" | "weight" | "reps" | "duration" | "distance";

export const METRIC_LABEL: Record<MetricId, string> = {
  e1rm: "Est. 1RM",
  weight: "Heaviest set",
  reps: "Most reps",
  duration: "Longest",
  distance: "Longest distance",
};

const METRIC_OF_TYPE: Readonly<Record<string, MetricId>> = {
  bodyweight_weighted: "weight",
  short_distance_weight: "weight",
  weight_duration: "weight",
  reps_only: "reps",
  bodyweight_assisted: "reps",
  duration: "duration",
  floors_duration: "duration",
  steps_duration: "duration",
  distance_duration: "distance",
};

/**
 * The measure an exercise is charted by. Weight-and-reps lifts use estimated 1RM when
 * any working set can be estimated (12 reps or fewer), else their heaviest set.
 */
export function metricFor(type: string, hasEstimableSet: boolean): MetricId {
  if (type === "weight_reps") return hasEstimableSet ? "e1rm" : "weight";
  return Object.hasOwn(METRIC_OF_TYPE, type) ? METRIC_OF_TYPE[type] : "weight";
}

/** The best set of one exercise on one local day, by the exercise's measure. */
export interface ProgressPoint {
  date: string; // YYYY-MM-DD, local to the index's time zone
  value: number; // kg for e1rm and weight, reps, seconds or meters
  workoutId: string;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
}

export interface ExerciseProgress {
  templateId: string;
  title: string;
  type: string;
  /** Hevy primary muscle id, or "other" without a template. */
  muscle: string;
  metric: MetricId;
  /** Best point per day, oldest first. Empty when no set has a value for the measure. */
  points: ProgressPoint[];
  /** Workouts the exercise appears in. */
  sessions: number;
  lastDay: string;
}

const METRICS: readonly MetricId[] = ["e1rm", "weight", "reps", "duration", "distance"];

/** A set's value for each measure, or null when the set has none. */
function valueOf(metric: MetricId, s: HevySet): number | null {
  const positive = (n: number | null | undefined) => (n != null && n > 0 ? n : null);
  switch (metric) {
    case "e1rm":
      return estimateOneRepMax(s);
    case "weight":
      return positive(s.weight_kg);
    case "reps":
      return positive(s.reps);
    case "duration":
      return positive(s.duration_seconds);
    case "distance":
      return positive(s.distance_meters);
  }
}

/** The type of an exercise with no template, from the first working set with any field. */
function inferType(s: HevySet): string | null {
  if (s.weight_kg != null && s.reps != null) return "weight_reps";
  if (s.distance_meters != null) return "distance_duration";
  if (s.reps != null) return "reps_only";
  if (s.duration_seconds != null) return "duration";
  return null;
}

interface Accumulator {
  title: string;
  inferredType: string | null;
  workouts: Set<string>;
  lastDay: string;
  estimable: boolean;
  best: Record<MetricId, Map<string, ProgressPoint>>; // metric → day → best point
}

/** Every exercise in the dataset, keyed by template id, in one pass over all working sets. */
export function progressIndex(data: HevyDataset, timeZone: string): Map<string, ExerciseProgress> {
  const templates = new Map(data.exercise_templates.map((t) => [t.id, t]));
  const acc = new Map<string, Accumulator>();
  for (const w of data.workouts) {
    const date = toLocalDay(w.start_time, timeZone);
    for (const ex of w.exercises) {
      let a = acc.get(ex.exercise_template_id);
      if (!a) {
        a = {
          title: ex.title,
          inferredType: null,
          workouts: new Set(),
          lastDay: date,
          estimable: false,
          best: { e1rm: new Map(), weight: new Map(), reps: new Map(), duration: new Map(), distance: new Map() },
        };
        acc.set(ex.exercise_template_id, a);
      }
      a.workouts.add(w.id);
      if (date > a.lastDay) a.lastDay = date;
      for (const s of ex.sets) {
        if (s.type === "warmup") continue;
        a.inferredType ??= inferType(s);
        for (const metric of METRICS) {
          const value = valueOf(metric, s);
          if (value == null) continue;
          if (metric === "e1rm") a.estimable = true;
          const prev = a.best[metric].get(date);
          if (prev && value <= prev.value) continue;
          a.best[metric].set(date, {
            date,
            value,
            workoutId: w.id,
            weightKg: s.weight_kg ?? null,
            reps: s.reps ?? null,
            durationS: s.duration_seconds ?? null,
            distanceM: s.distance_meters ?? null,
          });
        }
      }
    }
  }

  const index = new Map<string, ExerciseProgress>();
  for (const [templateId, a] of acc) {
    const t = templates.get(templateId);
    const type = t?.type ?? a.inferredType ?? "weight_reps";
    const metric = metricFor(type, a.estimable);
    index.set(templateId, {
      templateId,
      title: t?.title ?? a.title,
      type,
      muscle: t?.primary_muscle_group ?? "other",
      metric,
      points: [...a.best[metric].values()].sort((x, y) => x.date.localeCompare(y.date)),
      sessions: a.workouts.size,
      lastDay: a.lastDay,
    });
  }
  return index;
}

/** Points that beat every earlier point. */
export function recordsBy<T extends { value: number }>(points: readonly T[]): T[] {
  let best = -Infinity;
  const records: T[] = [];
  for (const p of points) {
    if (p.value > best) {
      records.push(p);
      best = p.value;
    }
  }
  return records;
}

export interface Summary<T> {
  /** Points in the range, oldest first. */
  history: T[];
  /** All-time records that fall in the range. */
  prs: T[];
  /** Latest point in the range. */
  current: T | undefined;
  /** Latest minus earliest value in the range; null with no points in the range. */
  change: number | null;
  /** All-time best, even if it's before the range. */
  best: T | undefined;
  /** Latest point of all time, for saying when the exercise was last done. */
  lastSession: T | undefined;
}

/**
 * One exercise's full history narrowed to `range` ending on `endDay`. Records are judged
 * against the full history, then narrowed, so a range can't invent them.
 */
export function summarize<T extends { date: string; value: number }>(all: readonly T[], range: DateRange, endDay: string): Summary<T> {
  const history = filterByRange(all, range, endDay);
  const records = recordsBy(all);
  const first = history[0];
  const current = history.at(-1);
  return {
    history,
    prs: filterByRange(records, range, endDay),
    current,
    change: first && current ? current.value - first.value : null,
    best: records.at(-1),
    lastSession: all.at(-1),
  };
}
