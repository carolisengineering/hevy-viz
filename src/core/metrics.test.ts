import { describe, expect, it } from "vitest";
import { estimateOneRepMax, exercisesByFrequency } from "./metrics";
import type { HevyExercise, HevySet, HevyWorkout } from "./types";

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
