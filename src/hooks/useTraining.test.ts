import { describe, expect, it } from "vitest";
import { dataset, template, workout, type SetFields } from "../core/testkit";
import { rangeById } from "../core/ranges";
import { buildTraining, mainLiftsIn } from "./useTraining";

const lift = (id: string, sessions: number, sets: SetFields[] = [{ weight_kg: 100, reps: 5 }]) =>
  Array.from({ length: sessions }, (_, i) => workout(`${id}-${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`, [[id, sets]]));

describe("buildTraining", () => {
  const data = dataset(
    [
      ...lift("squat", 5),
      ...lift("bench", 3),
      ...lift("arow", 3),
      ...lift("plank", 9, [{ duration_seconds: 60 }]),
      ...["a", "b", "c", "d", "e"].flatMap((id) => lift(`lift-${id}`, 2)),
    ],
    [template("plank", "duration", "abdominals")],
  );
  const training = buildTraining(data, "UTC");

  it("lists exercises by sessions, then title", () => {
    expect(training.exercises.slice(0, 4).map((e) => e.templateId)).toEqual(["plank", "squat", "arow", "bench"]);
  });

  // An old favorite: 20 sessions, all in January 2025.
  const oldie = Array.from({ length: 20 }, (_, i) => workout(`old-${i}`, `2025-01-${String(i + 1).padStart(2, "0")}`, [["oldie", [{ weight_kg: 80, reps: 5 }]]]));
  const withOldie = buildTraining({ ...data, source: "sample", workouts: [...oldie, ...data.workouts] }, "UTC");

  it("takes the six estimated-1RM lifts with the most sessions in the range as main lifts", () => {
    const lifts = mainLiftsIn(withOldie, rangeById("90d"));
    expect(lifts.map((l) => l.lift.templateId)).toEqual(["squat", "arow", "bench", "lift-a", "lift-b", "lift-c"]);
    expect(lifts.map((l) => l.sessions)).toEqual([5, 3, 3, 2, 2, 2]);
  });

  it("leaves out lifts with no sessions in the range", () => {
    expect(mainLiftsIn(withOldie, rangeById("90d")).some((l) => l.lift.templateId === "oldie")).toBe(false);
    expect(mainLiftsIn(withOldie, rangeById("all"))[0]).toMatchObject({ lift: { templateId: "oldie" }, sessions: 20 });
  });

  it("ends sample ranges on the last workout and counts sessions per day", () => {
    expect(buildTraining({ ...data, source: "sample" }, "UTC").endDay).toBe("2026-10-09");
    expect(training.days.get("2026-10-01")?.sessions).toBe(9);
  });
});
