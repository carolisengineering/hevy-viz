// Hevy muscle ids grouped for the balance view and the overview's sides.

export type MuscleGroup = "Legs" | "Back" | "Chest" | "Shoulders" | "Arms" | "Core" | "Full body" | "Cardio" | "Other";

/** The groups the balance bars always show, in display order. */
export const MAIN_GROUPS: readonly MuscleGroup[] = ["Legs", "Back", "Chest", "Shoulders", "Arms", "Core"];

const GROUP_OF: Readonly<Record<string, MuscleGroup>> = {
  quadriceps: "Legs",
  hamstrings: "Legs",
  glutes: "Legs",
  calves: "Legs",
  abductors: "Legs",
  adductors: "Legs",
  upper_back: "Back",
  lats: "Back",
  lower_back: "Back",
  traps: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Arms",
  triceps: "Arms",
  forearms: "Arms",
  abdominals: "Core",
  full_body: "Full body",
  cardio: "Cardio",
};

export const muscleGroup = (muscle: string): MuscleGroup => (Object.hasOwn(GROUP_OF, muscle) ? GROUP_OF[muscle] : "Other");

/** Which side of the overview's tracklist an exercise goes on. */
export type Side = "lower" | "upper" | "bonus";

export function sideOf(muscle: string): Side {
  const group = muscleGroup(muscle);
  if (group === "Legs" || muscle === "lower_back") return "lower";
  if (group === "Back" || group === "Chest" || group === "Shoulders" || group === "Arms") return "upper";
  return "bonus";
}

/** "upper_back" → "Upper back" */
export function muscleLabel(muscle: string): string {
  const words = muscle.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
