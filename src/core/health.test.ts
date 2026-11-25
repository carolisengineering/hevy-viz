import { describe, expect, it } from "vitest";
import { RANGES } from "./ranges";
import type { HealthDataset, HealthDay } from "./types";
import {
  firstDayOf,
  healthEndDay,
  healthWindow,
  latestCompleteMonth,
  MEASURES,
  monthlyAverages,
  windowAverage,
  yearlyAverages,
} from "./health";

const day = (date: string, steps?: number, exercise_min?: number): HealthDay => ({
  date,
  ...(steps != null && { steps }),
  ...(exercise_min != null && { exercise_min }),
});

describe("MEASURES", () => {
  it("labels each measure", () => {
    expect(MEASURES.map((m) => m.label)).toEqual([
      "Steps per day",
      "Distance per day",
      "Exercise per day",
      "Active calories per day",
      "Sleep per night",
    ]);
  });
});

describe("monthlyAverages", () => {
  const w = { from: "2026-01-01", to: "2026-12-31" };

  it("averages only days with a value", () => {
    const days = [day("2026-03-01", 1000), day("2026-03-02", 1000), day("2026-03-03", 1000), day("2026-03-04")];
    expect(monthlyAverages(days, "steps", w)).toEqual([{ month: "2026-03", value: 1000, days: 3 }]);
  });

  it("leaves out a month with no values, rather than 0", () => {
    const days = [day("2026-01-05", 2000), day("2026-02-05", undefined, 30), day("2026-03-05", 4000)];
    expect(monthlyAverages(days, "steps", w).map((m) => m.month)).toEqual(["2026-01", "2026-03"]);
  });

  it("cuts partial months at both ends of the window", () => {
    const days = [day("2026-01-10", 100), day("2026-01-20", 300), day("2026-02-10", 500), day("2026-02-20", 900)];
    const got = monthlyAverages(days, "steps", { from: "2026-01-15", to: "2026-02-15" });
    expect(got).toEqual([
      { month: "2026-01", value: 300, days: 1 },
      { month: "2026-02", value: 500, days: 1 },
    ]);
  });
});

describe("yearlyAverages", () => {
  it("marks the current partial year with partialTo", () => {
    const days = [day("2025-06-01", 1000), day("2025-06-02", 3000), day("2026-02-01", 4000)];
    const got = yearlyAverages(days, "steps", { from: "2025-01-01", to: "2026-11-25" });
    expect(got).toEqual([
      { year: "2025", value: 2000, days: 2 },
      { year: "2026", value: 4000, days: 1, partialTo: "2026-11-25" },
    ]);
  });

  it("does not mark a year that ends on Dec 31", () => {
    const got = yearlyAverages([day("2025-06-01", 1000)], "steps", { from: "2025-01-01", to: "2025-12-31" });
    expect(got).toEqual([{ year: "2025", value: 1000, days: 1 }]);
  });
});

describe("windowAverage", () => {
  const days = [day("2026-05-01", 1000), day("2026-05-02", 3000), day("2026-06-01", 9000)];
  it("averages days with a value inside the window", () => {
    expect(windowAverage(days, "steps", { from: "2026-05-01", to: "2026-05-31" })).toBe(2000);
  });
  it("is null when no day in the window has the measure", () => {
    expect(windowAverage(days, "exercise", { from: "2026-05-01", to: "2026-05-31" })).toBeNull();
    expect(windowAverage(days, "steps", { from: "2026-07-01", to: "2026-07-31" })).toBeNull();
  });
});

describe("latestCompleteMonth", () => {
  const days = [day("2026-09-10", 1000), day("2026-10-10", 2000), day("2026-11-10", 9000)];
  it("skips the month containing endDay", () => {
    expect(latestCompleteMonth(days, "steps", "2026-11-25")).toEqual({ month: "2026-10", value: 2000, days: 1 });
  });
  it("is null when there is none", () => {
    expect(latestCompleteMonth([day("2026-11-10", 9000)], "steps", "2026-11-25")).toBeNull();
  });
  it("skips a complete month with no values", () => {
    const sparse = [day("2026-09-10", 1000), day("2026-10-10", undefined, 20)];
    expect(latestCompleteMonth(sparse, "steps", "2026-11-25")?.month).toBe("2026-09");
  });
});

describe("firstDayOf", () => {
  it("is the first day with the measure", () => {
    const days = [day("2026-01-01", 1), day("2026-01-02", 1, 10)];
    expect(firstDayOf(days, "exercise")).toBe("2026-01-02");
    expect(firstDayOf(days, "sleep")).toBeNull();
  });
});

describe("healthWindow", () => {
  const days = [day("2025-03-04", 1), day("2026-01-01", 1)];
  const [d90, , all] = RANGES;
  it("ends on endDay and counts back for fixed ranges", () => {
    expect(healthWindow(d90, "2026-11-25", days)).toEqual({ from: "2026-08-27", to: "2026-11-25" });
  });
  it("starts all time at the first health day", () => {
    expect(healthWindow(all, "2026-11-25", days)).toEqual({ from: "2025-03-04", to: "2026-11-25" });
  });
});

describe("healthEndDay", () => {
  const data = (export_date: string, days: HealthDay[] = []): HealthDataset => ({
    source: "apple-health",
    imported_at: `${export_date}T00:00:00Z`,
    export_date,
    days,
  });

  it("is the export date when the export is older than the Hevy end day", () => {
    expect(healthEndDay("2026-11-25", data("2026-11-13"))).toBe("2026-11-13");
  });

  it("is the Hevy end day when the export is newer (the sample case)", () => {
    expect(healthEndDay("2026-11-12", data("2026-11-13"))).toBe("2026-11-12");
  });

  it("keeps a stale export's last month and year honest", () => {
    const d = data("2026-12-02", [day("2026-10-10", 1000), day("2026-11-10", 2000), day("2026-12-01", 3000), day("2026-12-02", 5000)]);
    const end = healthEndDay("2027-01-05", d);
    expect(latestCompleteMonth(d.days, "steps", end)).toEqual({ month: "2026-11", value: 2000, days: 1 });
    const years = yearlyAverages(d.days, "steps", { from: "2026-01-01", to: end });
    expect(years.at(-1)?.partialTo).toBe("2026-12-02");
  });
});
