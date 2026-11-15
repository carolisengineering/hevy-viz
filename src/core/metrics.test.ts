import { describe, expect, it } from "vitest";
import { estimateOneRepMax, exercisesByFrequency, weeklySetsByMuscle } from "./metrics";
import type { HevyDataset, HevyExercise, HevySet, HevyWorkout } from "./types";

type SetSpec = [weight: number | null, reps: number | null, type?: HevySet["type"]];

const exercise = (templateId: string, sets: SetSpec[], index = 0): HevyExercise => ({
  index,
  title: templateId,
  exercise_template_id: templateId,
  sets: sets.map(([weight_kg, reps, type = "normal"], i) => ({ index: i, type, weight_kg, reps })),
});

const workout = (id: string, date: string, sets: SetSpec[], templateId = "bench"): HevyWorkout => ({
  id,
  title: "Push",
  start_time: `${date}T18:00:00Z`,
  end_time: `${date}T19:00:00Z`,
  exercises: [exercise(templateId, sets)],
});

describe("estimateOneRepMax", () => {
  it("uses Epley", () => {
    expect(estimateOneRepMax({ weight_kg: 100, reps: 5 })).toBeCloseTo(116.67, 2);
  });
  it("returns the weight for a single", () => {
    expect(estimateOneRepMax({ weight_kg: 140, reps: 1 })).toBe(140);
  });
  it("rejects missing, zero, and high-rep sets", () => {
    expect(estimateOneRepMax({ weight_kg: null, reps: 5 })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 100, reps: null })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 100, reps: 0 })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 0, reps: 5 })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 40, reps: 20 })).toBeNull();
  });
});

describe("weeklySetsByMuscle", () => {
  it("counts working sets by primary muscle per week", () => {
    const data: HevyDataset = {
      source: "sample",
      synced_at: "",
      workouts: [
        workout("a", "2026-11-10", [[60, 10, "warmup"], [100, 5], [100, 5]]),
        workout("b", "2026-11-12", [[100, 5]]),
      ],
      exercise_templates: [
        { id: "bench", title: "Bench", type: "weight_reps", primary_muscle_group: "chest", secondary_muscle_groups: [] },
      ],
    };
    expect(weeklySetsByMuscle(data, "UTC").get("2026-11-09")?.get("chest")).toBe(3);
  });
  it("buckets a Sunday-night session into its local week", () => {
    // 05:00 UTC Monday Nov 16 is 21:00 Sunday Nov 15 in California.
    const w = { ...workout("a", "2026-11-16", [[100, 5]]), start_time: "2026-11-16T05:00:00Z" };
    const data: HevyDataset = { source: "sample", synced_at: "", workouts: [w], exercise_templates: [] };
    expect([...weeklySetsByMuscle(data, "America/Los_Angeles").keys()]).toEqual(["2026-11-09"]);
  });
});

describe("exercisesByFrequency", () => {
  it("counts sessions, not sets", () => {
    const list = exercisesByFrequency([
      workout("a", "2026-01-01", [[100, 5], [100, 5]]),
      workout("b", "2026-01-02", [[100, 5]], "squat"),
      workout("c", "2026-01-03", [[100, 5]]),
    ]);
    expect(list[0]).toMatchObject({ templateId: "bench", sessions: 2 });
  });
});
