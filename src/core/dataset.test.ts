import { describe, expect, it } from "vitest";
import { dropUndatedWorkouts, rangeEndDay } from "./dataset";
import type { HevyDataset, HevyWorkout } from "./types";

const workout = (id: string, start_time: unknown): HevyWorkout =>
  ({ id, title: id, start_time, end_time: "2026-11-01T18:00:00Z", exercises: [] }) as unknown as HevyWorkout;

const dataset = (workouts: HevyWorkout[]): HevyDataset => ({
  source: "hevy",
  synced_at: "2026-11-14T00:00:00Z",
  workouts,
  exercise_templates: [],
});

describe("dropUndatedWorkouts", () => {
  it("keeps every workout when all dates parse, and returns the same dataset", () => {
    const data = dataset([workout("a", "2026-11-01T17:00:00Z"), workout("b", "2026-11-02T17:00:00+01:00")]);
    const result = dropUndatedWorkouts(data);
    expect(result.data).toBe(data);
    expect(result.skipped).toBe(0);
  });

  it("drops workouts whose start_time is not a readable timestamp", () => {
    const data = dataset([
      workout("good", "2026-11-01T17:00:00Z"),
      workout("garbage", "not a date"),
      workout("empty", ""),
      workout("missing", undefined),
      workout("null", null), // new Date(null) is 1970-01-01, which would pass silently
      workout("number", 1730480400000),
    ]);
    const result = dropUndatedWorkouts(data);
    expect(result.data.workouts.map((w) => w.id)).toEqual(["good"]);
    expect(result.skipped).toBe(5);
  });

  it("does not modify the input", () => {
    const data = dataset([workout("good", "2026-11-01T17:00:00Z"), workout("bad", "nope")]);
    dropUndatedWorkouts(data);
    expect(data.workouts).toHaveLength(2);
  });
});

describe("rangeEndDay", () => {
  const NOW = new Date("2026-11-14T03:00:00Z"); // Evening of Nov 13 in Los Angeles

  it("is today, in the given time zone, for synced data", () => {
    const data = dataset([workout("old", "2026-01-01T17:00:00Z")]);
    expect(rangeEndDay(data, "America/Los_Angeles", NOW)).toBe("2026-11-13");
    expect(rangeEndDay(data, "UTC", NOW)).toBe("2026-11-14");
  });

  it("is the last workout day for the sample, a fixed snapshot", () => {
    const sample = {
      ...dataset([workout("b", "2025-03-02T17:00:00Z"), workout("a", "2025-01-01T17:00:00Z")]),
      source: "sample" as const,
    };
    expect(rangeEndDay(sample, "UTC", NOW)).toBe("2025-03-02");
  });

  it("falls back to today for an empty sample", () => {
    expect(rangeEndDay({ ...dataset([]), source: "sample" }, "UTC", NOW)).toBe("2026-11-14");
  });
});
