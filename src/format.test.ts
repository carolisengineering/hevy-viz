import { describe, expect, it } from "vitest";
import type { ProgressPoint } from "./core/progress";
import {
  chartFormat,
  formatChange,
  formatCount,
  formatDate,
  formatDistance,
  formatDuration,
  formatFullDate,
  formatLogDate,
  formatMonth,
  formatPointSet,
  formatShortDate,
  formatValue,
  formatWeight,
  valueUnit,
} from "./format";

describe("format", () => {
  it("names a month with its year", () => {
    expect(formatMonth("2026-11")).toBe("November 2026");
  });

  it("writes a full date with its weekday", () => {
    expect(formatFullDate("2026-11-03")).toBe("Tue, Nov 3, 2026");
  });

  it("formats a day without shifting it by time zone", () => {
    expect(formatDate("2026-11-14")).toBe("Nov 14, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("measure- and unit-aware formatting", () => {
  it("formats weights to 0.1 kg or whole pounds", () => {
    expect(formatWeight(116.666, "kg")).toBe("116.7");
    expect(formatWeight(118, "kg")).toBe("118");
    expect(formatWeight(100, "lb")).toBe("220");
  });

  it("formats durations as clock time", () => {
    expect(formatDuration(45)).toBe("0:45");
    expect(formatDuration(105)).toBe("1:45");
    expect(formatDuration(3723)).toBe("1:02:03");
  });

  it("formats distances in meters, then kilometers", () => {
    expect(formatDistance(800)).toBe("800 m");
    expect(formatDistance(5000)).toBe("5 km");
    expect(formatDistance(12345)).toBe("12.3 km");
  });

  it("formats a value in its measure's format", () => {
    expect(formatValue("e1rm", 172.5, "kg")).toBe("172.5");
    expect(formatValue("weight", 100, "lb")).toBe("220");
    expect(formatValue("reps", 12, "kg")).toBe("12");
    expect(formatValue("duration", 105, "kg")).toBe("1:45");
    expect(formatValue("distance", 5000, "kg")).toBe("5 km");
  });

  it("names the unit a value is shown in", () => {
    expect(valueUnit("e1rm", "lb")).toBe("lb");
    expect(valueUnit("reps", "kg")).toBe("reps");
    expect(valueUnit("duration", "kg")).toBe("");
  });

  it("formats a signed change with a true minus sign", () => {
    expect(formatChange("e1rm", 6.5, "kg")).toBe("+6.5");
    expect(formatChange("e1rm", -2.5, "kg")).toBe("\u22122.5");
    expect(formatChange("duration", 15, "kg")).toBe("+0:15");
    expect(formatChange("reps", -2, "kg")).toBe("\u22122");
  });

  it("shows a change that rounds to zero as ±0", () => {
    expect(formatChange("e1rm", 0.02, "kg")).toBe("±0");
    expect(formatChange("e1rm", 0.2, "lb")).toBe("±0");
  });

  const point = (fields: Partial<ProgressPoint>): ProgressPoint => ({
    date: "2026-11-14",
    value: 0,
    workoutId: "w",
    weightKg: null,
    reps: null,
    durationS: null,
    distanceM: null,
    ...fields,
  });

  it("formats the set behind a point by exercise type", () => {
    expect(formatPointSet(point({ weightKg: 150, reps: 5 }), "weight_reps", "kg")).toBe("150 × 5");
    expect(formatPointSet(point({ weightKg: 30, reps: 5 }), "bodyweight_weighted", "kg")).toBe("+30 × 5");
    expect(formatPointSet(point({ weightKg: 100, reps: 5 }), "weight_reps", "lb")).toBe("220 × 5");
    expect(formatPointSet(point({ reps: 12 }), "reps_only", "kg")).toBe("12 reps");
    expect(formatPointSet(point({ durationS: 105 }), "duration", "kg")).toBe("1:45");
    expect(formatPointSet(point({ distanceM: 5000, durationS: 1500 }), "distance_duration", "kg")).toBe("5 km in 25:00");
    expect(formatPointSet(point({ weightKg: 40, distanceM: 40 }), "short_distance_weight", "kg")).toBe("40 kg · 40 m");
  });

  it("formats short dates, log dates and counts", () => {
    expect(formatShortDate("2026-11-14")).toBe("Nov 14");
    expect(formatLogDate("2026-11-13")).toBe("Fri 11/13");
    expect(formatCount(1432)).toBe("1,432");
  });
});

describe("chartFormat", () => {
  it("writes weights in the chosen unit with ticks on round pounds", () => {
    const f = chartFormat("e1rm", "weight_reps", "lb");
    expect([f.measure, f.unit, f.value(100)]).toEqual(["Est. 1RM", "lb", "220"]);
    expect(f.scale).toBeCloseTo(2.20462);
  });

  it("writes times as clock time with no unit", () => {
    const f = chartFormat("duration", "duration", "kg");
    expect([f.measure, f.unit, f.value(105), f.scale]).toEqual(["Longest", "", "1:45", 1]);
  });
});
