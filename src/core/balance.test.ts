import { describe, expect, it } from "vitest";
import { setsPerWeekByGroup, setsPerWeekByMuscle } from "./balance";
import { rangeById } from "./ranges";
import { dataset, template, workout, type SetFields } from "./testkit";

const sets = (n: number, type: SetFields["type"] = "normal"): SetFields[] => Array.from({ length: n }, () => ({ weight_kg: 50, reps: 8, type }));

const data = dataset(
  [
    workout("old", "2025-01-01", [["squat", sets(100)]]),
    workout("w", "2026-10-01", [
      ["squat", sets(30)],
      ["bench", sets(20)],
      ["row", sets(20)],
      ["press", sets(12)],
      ["curl", sets(14)],
      ["crunch", sets(2)],
    ]),
    workout("warmup", "2026-10-02", [["squat", sets(5, "warmup")]]),
  ],
  [
    template("squat", "weight_reps", "quadriceps"),
    template("bench", "weight_reps", "chest"),
    template("row", "weight_reps", "upper_back"),
    template("press", "weight_reps", "shoulders"),
    template("curl", "weight_reps", "biceps"),
    template("crunch", "reps_only", "abdominals"),
  ],
);
const tz = "America/Los_Angeles";
const end = "2026-11-14";

describe("setsPerWeekByGroup", () => {
  const groups = setsPerWeekByGroup(data, tz, rangeById("90d"), end);

  it("returns the six main groups in order, in working sets per week", () => {
    expect(groups.map((g) => g.group)).toEqual(["Legs", "Back", "Chest", "Shoulders", "Arms", "Core"]);
    expect(groups[0].setsPerWeek).toBeCloseTo(30 / (90 / 7));
  });

  it("flags groups under half the median as light", () => {
    expect(groups.filter((g) => g.light).map((g) => g.group)).toEqual(["Core"]);
  });
});

describe("setsPerWeekByMuscle", () => {
  it("orders muscles busiest first", () => {
    const muscles = setsPerWeekByMuscle(data, tz, rangeById("90d"), end);
    expect(muscles.map((m) => m.muscle)).toEqual(["quadriceps", "chest", "upper_back", "biceps", "shoulders", "abdominals"]);
  });

  it("averages all time over the weeks since the first workout", () => {
    const quads = setsPerWeekByMuscle(data, tz, rangeById("all"), end).find((m) => m.muscle === "quadriceps")!;
    const weeks = (Date.parse("2026-11-14") - Date.parse("2025-01-01")) / (7 * 86_400_000);
    expect(quads.setsPerWeek).toBeCloseTo(130 / weeks);
  });
});
