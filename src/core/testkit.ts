// Builders for core tests. Never imported by the app.
import type { HevyDataset, HevyExerciseTemplate, HevySet, HevyWorkout } from "./types";

export type SetFields = Partial<Pick<HevySet, "weight_kg" | "reps" | "duration_seconds" | "distance_meters" | "type">>;

/** One exercise in a workout: its template id and its sets. */
export type Entry = [templateId: string, sets: SetFields[]];

const set = (fields: SetFields, index: number): HevySet => ({
  index,
  type: "normal",
  weight_kg: null,
  reps: null,
  ...fields,
});

/** A workout on `date` starting at 18:00 UTC. Each exercise's title is its template id. */
export function workout(id: string, date: string, entries: Entry[]): HevyWorkout {
  return {
    id,
    title: `Workout ${id}`,
    start_time: `${date}T18:00:00Z`,
    end_time: `${date}T19:00:00Z`,
    exercises: entries.map(([templateId, sets], index) => ({
      index,
      title: templateId,
      exercise_template_id: templateId,
      sets: sets.map(set),
    })),
  };
}

export const template = (id: string, type: string, primary: string): HevyExerciseTemplate => ({
  id,
  title: id,
  type,
  primary_muscle_group: primary,
  secondary_muscle_groups: [],
});

export const dataset = (
  workouts: HevyWorkout[],
  templates: HevyExerciseTemplate[],
  source: HevyDataset["source"] = "hevy",
): HevyDataset => ({ source, synced_at: "2026-11-14T00:00:00Z", workouts, exercise_templates: templates });
