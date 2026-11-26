import { describe, expect, it } from "vitest";
import type { RecentStretch, StretchRow } from "./core/health";
import type { ProgressPoint } from "./core/progress";
import {
  chartFormat,
  formatChange,
  formatClock,
  formatCount,
  formatDate,
  formatDistance,
  formatDuration,
  formatFullDate,
  formatHealth,
  formatYearLabel,
  healthFormat,
  formatLogDate,
  formatMinutes,
  formatMonth,
  formatPointSet,
  formatShortDate,
  formatValue,
  formatWeight,
  stretchComparison,
  stretchDates,
  stretchValue,
  valueUnit,
} from "./format";

describe("format", () => {
  it("names a month with its year", () => {
    expect(formatMonth("2026-11")).toBe("November 2026");
  });

  it("writes a clock time in a time zone", () => {
    expect(formatClock("2026-11-03T18:42:00Z", "UTC")).toBe("6:42 PM");
    expect(formatClock("2026-11-03T18:42:00Z", "America/Los_Angeles")).toBe("10:42 AM");
  });

  it("writes minutes as hours and minutes", () => {
    expect(formatMinutes(58)).toBe("58 min");
    expect(formatMinutes(72)).toBe("1 h 12 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(59.6)).toBe("1 h");
  });

  it("writes a full date with its weekday", () => {
    expect(formatFullDate("2026-11-03")).toBe("Tue, Nov 3, 2026");
  });

  it("formats a day without shifting it by time zone", () => {
    expect(formatDate("2026-11-14")).toBe("Nov 14, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});

describe("formatHealth", () => {
  it("writes each measure in its own form", () => {
    expect(formatHealth("steps", 8412, "lb")).toBe("8,412");
    expect(formatHealth("exercise", 41, "lb")).toBe("41 min");
    expect(formatHealth("calories", 512, "lb")).toBe("512 kcal");
    expect(formatHealth("sleep", 425, "lb")).toBe("7h05");
  });

  it("writes distance in miles for lb and kilometers for kg", () => {
    expect(formatHealth("distance", 5.8, "lb")).toBe("3.6 mi");
    expect(formatHealth("distance", 5.9, "kg")).toBe("5.9 km");
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

describe("healthFormat", () => {
  it("writes distance in the header's unit with ticks on round display values", () => {
    const mi = healthFormat("distance", "lb");
    expect([mi.unit, mi.value(5.8), mi.scale]).toEqual(["mi", "3.6", 1 / 1.609344]);
    const km = healthFormat("distance", "kg");
    expect([km.unit, km.value(5.8), km.scale]).toEqual(["km", "5.8", 1]);
  });

  it("matches formatHealth for the rest, with the unit apart", () => {
    expect([healthFormat("steps", "lb").value(8412.4), healthFormat("steps", "lb").unit]).toEqual(["8,412", ""]);
    expect([healthFormat("exercise", "lb").value(41.2), healthFormat("exercise", "lb").unit]).toEqual(["41", "min"]);
    expect([healthFormat("calories", "lb").value(512.4), healthFormat("calories", "lb").unit]).toEqual(["512", "kcal"]);
    const sleep = healthFormat("sleep", "lb");
    expect([sleep.value(425), sleep.unit, sleep.scale]).toEqual(["7h05", "", 1 / 60]);
  });
});

describe("formatYearLabel", () => {
  it("names a whole year by itself and a partial one by where it starts or ends", () => {
    expect(formatYearLabel({ year: "2025" })).toBe("2025");
    expect(formatYearLabel({ year: "2026", partialTo: "2026-11-13" })).toBe("2026, to Nov 13");
    expect(formatYearLabel({ year: "2025", partialFrom: "2025-11-14" })).toBe("2025, from Nov 14");
    expect(formatYearLabel({ year: "2026", partialFrom: "2026-05-01", partialTo: "2026-08-31" })).toBe("2026, May 1 to Aug 31");
  });
});

describe("stretch text", () => {
  const row = (id: StretchRow["id"], recent: number | null, usual: number | null, status: StretchRow["status"] = "compared"): StretchRow => ({
    id,
    recent,
    usual,
    status,
  });

  it("says a percentage for steps, with under 5% as about the same", () => {
    expect(stretchComparison(row("steps", 104.9, 100), "lb")).toBe("about the same");
    expect(stretchComparison(row("steps", 105, 100), "lb")).toBe("5% above");
    expect(stretchComparison(row("steps", 88, 100), "lb")).toBe("12% below");
  });

  it("says minutes for sleep, rounded to 5, with under 10 as about the same", () => {
    expect(stretchComparison(row("sleep", 429, 420), "lb")).toBe("about the same");
    expect(stretchComparison(row("sleep", 432, 420), "lb")).toBe("10 min more");
    expect(stretchComparison(row("sleep", 395, 420), "lb")).toBe("25 min less");
  });

  it("says days a week for training", () => {
    const r = row("training", 2.5, 3.4);
    expect(stretchValue(r, "lb")).toBe("2.5 days a week");
    expect(stretchComparison(r, "lb")).toBe("usual 3.4");
  });

  it("writes distance in the chosen unit", () => {
    expect(stretchValue(row("distance", 5.8, 6), "lb")).toBe("3.6 mi");
    expect(stretchValue(row("distance", 5.8, 6), "kg")).toBe("5.8 km");
  });

  it("says when a row can't be compared", () => {
    const thin = row("exercise", 30, null, "not-enough-data");
    expect(stretchValue(thin, "lb")).toBe("30 min");
    expect(stretchComparison(thin, "lb")).toBe("not enough data");
    const stale = row("training", null, null, "not-synced");
    expect(stretchValue(stale, "lb")).toBe("—");
    expect(stretchComparison(stale, "lb")).toBe("sync Hevy to include");
  });

  it("names the stretch's dates across New Year", () => {
    const s: RecentStretch = { from: "2026-12-20", to: "2027-01-16", usualFrom: "2025-12-20", usualTo: "2026-12-19", rows: [] };
    expect(stretchDates(s, "2027")).toBe("Dec 20 – Jan 16");
    expect(stretchDates(s, "2028")).toBe("Dec 20 – Jan 16, 2027");
  });

  it("adds the year when the stretch ended in an earlier year", () => {
    const s: RecentStretch = { from: "2025-10-16", to: "2025-11-12", usualFrom: "2024-10-16", usualTo: "2025-10-15", rows: [] };
    expect(stretchDates(s, "2025")).toBe("Oct 16 – Nov 12");
    expect(stretchDates(s, "2026")).toBe("Oct 16 – Nov 12, 2025");
  });
});
