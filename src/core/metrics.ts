// Pure metric functions. No DOM, no fetch — so the dashboard and a future
// MCP server can share them.
import type { HevySet, HevyWorkout } from "./types";

/** Estimates get unreliable past this many reps; ignore them rather than mislead. */
const MAX_REPS_FOR_ESTIMATE = 12;

/** Epley estimated one-rep max. Returns null for sets that can't be estimated. */
export function estimateOneRepMax({ weight_kg, reps }: Pick<HevySet, "weight_kg" | "reps">): number | null {
  if (weight_kg == null || reps == null || weight_kg <= 0 || reps <= 0) return null;
  if (reps === 1) return weight_kg;
  if (reps > MAX_REPS_FOR_ESTIMATE) return null;
  return weight_kg * (1 + reps / 30);
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
