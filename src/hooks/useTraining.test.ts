import { describe, expect, it } from "vitest";
import { dataset, template, workout, type SetFields } from "../core/testkit";
import { buildTraining } from "./useTraining";

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

  it("takes the six most-trained estimated-1RM lifts as main lifts", () => {
    expect(training.mainLifts.map((e) => e.templateId)).toEqual(["squat", "arow", "bench", "lift-a", "lift-b", "lift-c"]);
  });

  it("ends sample ranges on the last workout and counts sessions per day", () => {
    expect(buildTraining({ ...data, source: "sample" }, "UTC").endDay).toBe("2026-10-09");
    expect(training.days.get("2026-10-01")?.sessions).toBe(9);
  });
});
