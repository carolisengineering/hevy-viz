// Shapes returned by the Hevy public API (https://api.hevyapp.com/docs).
// Only the fields this project uses are typed.

export type SetType = "normal" | "warmup" | "dropset" | "failure";

export interface HevySet {
  index: number;
  type: SetType;
  weight_kg: number | null;
  reps: number | null;
  distance_meters?: number | null;
  duration_seconds?: number | null;
  rpe?: number | null;
}

export interface HevyExercise {
  index: number;
  title: string;
  exercise_template_id: string;
  sets: HevySet[];
}

export interface HevyWorkout {
  id: string;
  title: string;
  start_time: string; // ISO 8601
  end_time: string;
  created_at?: string; // ISO 8601. Hevy sends it and orders its workout list by it; the sample data doesn't have it.
  updated_at?: string; // ISO 8601. Hevy always sends it; the sample data doesn't have it.
  exercises: HevyExercise[];
}

export interface HevyExerciseTemplate {
  id: string;
  title: string;
  type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string[];
}

/** The file written by scripts/sync-hevy.ts and read by the dashboard. */
export interface HevyDataset {
  source: "hevy" | "sample";
  synced_at: string;
  workouts: HevyWorkout[];
  exercise_templates: HevyExerciseTemplate[];
}

/** One local (wall-time) day of Apple Health figures. A measure with no data is left out, never 0. */
export interface HealthDay {
  date: string; // "YYYY-MM-DD", local wall-time day
  steps?: number; // whole
  distance_km?: number; // two decimals
  active_kcal?: number; // whole
  exercise_min?: number; // whole
  sleep_min?: number; // whole
}

/** The file written by scripts/health/ and read by the Activity tab. */
export interface HealthDataset {
  source: "apple-health" | "sample";
  imported_at: string; // ISO instant
  export_date: string; // "YYYY-MM-DD"
  days: HealthDay[]; // ascending by date
}
