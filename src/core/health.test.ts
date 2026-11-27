import { describe, expect, it } from "vitest";
import sampleHealthJson from "../../public/data/sample-health.json";
import sampleHevyJson from "../../public/data/sample.json";
import { addDays } from "./dates";
import { RANGES } from "./ranges";
import { buildTraining } from "./training";
import type { HealthDataset, HealthDay, HevyDataset } from "./types";
import {
  firstDayOf,
  healthByDay,
  healthEndDay,
  healthWindow,
  latestCompleteMonth,
  MEASURES,
  monthlyAverages,
  recentStretch,
  stepBand,
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
    const days = [day("2025-01-01", 1000), day("2025-06-02", 3000), day("2026-02-01", 4000)];
    const got = yearlyAverages(days, "steps", { from: "2025-01-01", to: "2026-11-25" });
    expect(got).toEqual([
      { year: "2025", value: 2000, days: 2 },
      { year: "2026", value: 4000, days: 1, partialTo: "2026-11-25" },
    ]);
  });

  it("marks a year cut at the start of the window with partialFrom", () => {
    const days = [day("2025-11-14", 1000), day("2026-02-01", 4000)];
    const got = yearlyAverages(days, "steps", { from: "2025-11-14", to: "2026-11-13" });
    expect(got).toEqual([
      { year: "2025", value: 1000, days: 1, partialFrom: "2025-11-14" },
      { year: "2026", value: 4000, days: 1, partialTo: "2026-11-13" },
    ]);
  });

  it("marks both ends when the window sits inside one year", () => {
    const got = yearlyAverages([day("2026-05-01", 1000)], "steps", { from: "2026-05-01", to: "2026-08-31" });
    expect(got).toEqual([{ year: "2026", value: 1000, days: 1, partialFrom: "2026-05-01", partialTo: "2026-08-31" }]);
  });

  it("does not mark a year that starts on Jan 1", () => {
    const got = yearlyAverages([day("2025-01-01", 1000)], "steps", { from: "2025-01-01", to: "2026-11-13" });
    expect(got[0]).toEqual({ year: "2025", value: 1000, days: 1 });
  });

  it("starts a year where the measure's own data starts when that is after the window's start", () => {
    const days = [day("2025-03-01", 5000), day("2025-06-02", 5000, 30), day("2026-01-05", 5000, 50)];
    const got = yearlyAverages(days, "exercise", { from: "2025-01-01", to: "2026-12-31" });
    expect(got).toEqual([
      { year: "2025", value: 30, days: 1, partialFrom: "2025-06-02" },
      { year: "2026", value: 50, days: 1 },
    ]);
  });

  it("does not mark a year that ends on Dec 31", () => {
    const got = yearlyAverages([day("2025-01-01", 1000)], "steps", { from: "2025-01-01", to: "2025-12-31" });
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
    expect(healthEndDay("2026-11-25", data("2026-11-13"), false)).toBe("2026-11-13");
  });

  it("is the Hevy end day when the export is newer and the Hevy data is real", () => {
    expect(healthEndDay("2026-11-12", data("2026-11-13"), false)).toBe("2026-11-12");
  });

  it("is the export date for a real export beside the Hevy sample, even when the sample ends earlier", () => {
    expect(healthEndDay("2026-11-12", data("2027-03-01"), true)).toBe("2027-03-01");
  });

  it("keeps the earlier-of rule for the health sample beside the Hevy sample", () => {
    const sample: HealthDataset = { ...data("2026-11-13"), source: "sample" };
    expect(healthEndDay("2026-11-12", sample, true)).toBe("2026-11-12");
  });

  it("keeps a stale export's last month and year honest", () => {
    const d = data("2026-12-02", [day("2026-10-10", 1000), day("2026-11-10", 2000), day("2026-12-01", 3000), day("2026-12-02", 5000)]);
    const end = healthEndDay("2027-01-05", d, false);
    expect(latestCompleteMonth(d.days, "steps", end)).toEqual({ month: "2026-11", value: 2000, days: 1 });
    const years = yearlyAverages(d.days, "steps", { from: "2026-01-01", to: end });
    expect(years.at(-1)?.partialTo).toBe("2026-12-02");
  });
});

describe("recentStretch", () => {
  /** One HealthDay per date from `from` to `to`, with what `fill` returns for it (`i` counts from 0). */
  const span = (from: string, to: string, fill: (i: number) => Omit<HealthDay, "date">): HealthDay[] => {
    const out: HealthDay[] = [];
    for (let date = from, i = 0; date <= to; date = addDays(date, 1), i++) out.push({ date, ...fill(i) });
    return out;
  };
  const health = (export_date: string, days: HealthDay[] = [], source: HealthDataset["source"] = "apple-health"): HealthDataset => ({
    source,
    imported_at: `${export_date}T08:00:00Z`,
    export_date,
    days,
  });
  const hevy = (source: HevyDataset["source"], synced_at: string, workoutDays: string[]): HevyDataset => ({
    source,
    synced_at,
    workouts: workoutDays.map((d, i) => ({ id: `w${i}`, title: "Lift", start_time: `${d}T12:00:00Z`, end_time: `${d}T13:00:00Z`, exercises: [] })),
    exercise_templates: [],
  });
  /** Real Hevy synced the day after a Nov 21 export: the stretch is Oct 24 – Nov 20, the usual Oct 24, 2025 – Oct 23, 2026. */
  const realTraining = (workoutDays: string[], synced_at = "2026-11-22T10:00:00Z", timeZone = "UTC") =>
    buildTraining(hevy("hevy", synced_at, workoutDays), timeZone, new Date("2026-11-22T12:00:00Z"));
  const row = (s: ReturnType<typeof recentStretch>, id: string) => s.rows.find((r) => r.id === id)!;
  const FROM = "2026-10-24";
  const TO = "2026-11-20";
  const USUAL_TO = "2026-10-23";

  it("ends the day before the export", () => {
    const s = recentStretch(health("2026-11-21"), realTraining([]), "UTC");
    expect({ from: s.from, to: s.to, usualFrom: s.usualFrom, usualTo: s.usualTo }).toEqual({
      from: FROM,
      to: TO,
      usualFrom: "2025-10-24",
      usualTo: USUAL_TO,
    });
  });

  it("ends on the Hevy end day when it is earlier", () => {
    // The sample's last workout is a week before the export, so only the Hevy end day can give Nov 5.
    const training = buildTraining(hevy("sample", "2026-11-13T00:00:00Z", ["2026-11-01", "2026-11-05"]), "UTC");
    const s = recentStretch(health("2026-11-13", [], "sample"), training, "UTC");
    expect(s.to).toBe("2026-11-05");
    expect(s.from).toBe("2026-10-09");
  });

  it("ends the day before the export beside the Hevy sample", () => {
    const training = buildTraining(hevy("sample", "2026-11-13T00:00:00Z", ["2026-11-10", "2026-11-12"]), "UTC");
    const s = recentStretch(health("2027-01-05"), training, "UTC");
    expect(s.to).toBe("2027-01-04");
    expect(s.from).toBe("2026-12-08");
    expect(s.rows.some((r) => r.id === "training")).toBe(false);
  });

  it("spans New Year", () => {
    const training = buildTraining(hevy("hevy", "2027-01-20T00:00:00Z", []), "UTC", new Date("2027-01-20T12:00:00Z"));
    const s = recentStretch(health("2027-01-17"), training, "UTC");
    expect(s.from).toBe("2026-12-20");
    expect(s.to).toBe("2027-01-16");
    expect(s.usualTo).toBe("2026-12-19");
    expect(s.usualFrom).toBe("2025-12-20");
  });

  it("skips days without a value", () => {
    const days = [...span(addDays(USUAL_TO, -399), USUAL_TO, () => ({ steps: 10000 })), ...span(FROM, TO, (i) => (i % 2 ? {} : { steps: 8000 }))];
    expect(row(recentStretch(health("2026-11-21", days), realTraining([]), "UTC"), "steps")).toEqual({
      id: "steps",
      recent: 8000,
      usual: 10000,
      status: "compared",
    });
  });

  it("needs 14 days in the stretch", () => {
    const usual = span(addDays(USUAL_TO, -364), USUAL_TO, () => ({ steps: 10000 }));
    const withDays = (n: number) => [...usual, ...span(FROM, TO, (i) => (i < n ? { steps: 9000 } : {}))];
    const thirteen = row(recentStretch(health("2026-11-21", withDays(13)), realTraining([]), "UTC"), "steps");
    expect(thirteen).toMatchObject({ recent: 9000, status: "not-enough-data" });
    expect(row(recentStretch(health("2026-11-21", withDays(14)), realTraining([]), "UTC"), "steps").status).toBe("compared");
  });

  it("needs 90 days in the usual", () => {
    const withUsual = (n: number) => [...span(addDays(USUAL_TO, -(n - 1)), USUAL_TO, () => ({ steps: 10000 })), ...span(FROM, TO, () => ({ steps: 9000 }))];
    expect(row(recentStretch(health("2026-11-21", withUsual(89)), realTraining([]), "UTC"), "steps").status).toBe("not-enough-data");
    expect(row(recentStretch(health("2026-11-21", withUsual(90)), realTraining([]), "UTC"), "steps").status).toBe("compared");
  });

  it("treats a usual of zero as not enough data", () => {
    const days = [...span(addDays(USUAL_TO, -364), USUAL_TO, () => ({ exercise_min: 0 })), ...span(FROM, TO, () => ({ exercise_min: 30 }))];
    expect(row(recentStretch(health("2026-11-21", days), realTraining([]), "UTC"), "exercise")).toMatchObject({
      recent: 30,
      usual: 0,
      status: "not-enough-data",
    });
  });

  it("counts a day with two workouts once", () => {
    const training = realTraining(["2025-01-01", "2026-11-02", "2026-11-02", "2026-11-05", "2026-11-09", "2026-11-12"]);
    expect(row(recentStretch(health("2026-11-21"), training, "UTC"), "training").recent).toBe(1);
  });

  it("counts the training usual from the first workout", () => {
    const first = addDays(FROM, -200);
    const workoutDays: string[] = [];
    for (let d = first; d < FROM; d = addDays(d, 7)) workoutDays.push(d);
    const r = row(recentStretch(health("2026-11-21"), realTraining(workoutDays), "UTC"), "training");
    expect(r.usual).toBeCloseTo(1, 1);
    expect(r.status).toBe("compared");
  });

  it("needs Hevy history before the stretch", () => {
    const status = (first: string) => row(recentStretch(health("2026-11-21"), realTraining([first, "2026-11-10"]), "UTC"), "training").status;
    expect(status(addDays(FROM, -89))).toBe("not-enough-data");
    expect(status(addDays(FROM, -90))).toBe("compared");
    expect(status("2026-11-01")).toBe("not-enough-data");
  });

  it("handles a Hevy account with no workouts", () => {
    const s = recentStretch(health("2026-11-21"), realTraining([]), "UTC");
    expect(row(s, "training")).toMatchObject({ recent: 0, status: "not-enough-data" });
    for (const r of s.rows) {
      expect(Number.isNaN(r.recent)).toBe(false);
      expect(Number.isNaN(r.usual)).toBe(false);
    }
  });

  it("asks for a sync when Hevy is older than the stretch", () => {
    const stale = row(recentStretch(health("2026-11-21"), realTraining(["2025-01-01"], "2026-11-19T12:00:00Z"), "UTC"), "training");
    expect(stale).toEqual({ id: "training", recent: null, usual: null, status: "not-synced" });
    const fresh = row(recentStretch(health("2026-11-21"), realTraining(["2025-01-01"], "2026-11-20T12:00:00Z"), "UTC"), "training");
    expect(fresh.status).not.toBe("not-synced");
  });

  it("asks for a sync when the sync time can't be read", () => {
    for (const synced of ["", "not a date"]) {
      expect(row(recentStretch(health("2026-11-21"), realTraining(["2025-01-01"], synced), "UTC"), "training").status).toBe("not-synced");
    }
  });

  it("compares the sync day in the viewer's time zone", () => {
    const zone = "America/Los_Angeles";
    const status = (synced: string) =>
      row(recentStretch(health("2026-11-21"), realTraining(["2025-01-01"], synced, zone), zone), "training").status;
    expect(status("2026-11-21T05:00:00Z")).not.toBe("not-synced"); // Nov 20, 9 pm in Los Angeles
    expect(status("2026-11-20T05:00:00Z")).toBe("not-synced"); // Nov 19, 9 pm
  });

  it("orders rows training first, then the measures", () => {
    expect(recentStretch(health("2026-11-21"), realTraining([]), "UTC").rows.map((r) => r.id)).toEqual([
      "training",
      "steps",
      "distance",
      "exercise",
      "calories",
      "sleep",
    ]);
  });

  it("compares every row on the demo", () => {
    const s = recentStretch(sampleHealthJson as HealthDataset, buildTraining(sampleHevyJson as HevyDataset, "UTC"), "UTC");
    expect(s.to).toBe("2026-11-12");
    expect(s.rows).toHaveLength(6);
    expect(s.rows.filter((r) => r.status !== "compared")).toEqual([]);
  });
});

describe("stepBand", () => {
  it.each([
    [undefined, 0],
    [0, 1],
    [4999, 1],
    [5000, 2],
    [7499, 2],
    [7500, 3],
    [9999, 3],
    [10000, 4],
    [14999, 4],
    [15000, 5],
    [19999, 5],
    [20000, 6],
    [45000, 6],
  ])("puts %s steps in band %i", (steps, band) => {
    expect(stepBand(steps)).toBe(band);
  });
});

describe("healthByDay", () => {
  it("looks up a day by its date", () => {
    const days = [day("2026-11-02", 4000), day("2026-11-03", 9300)];
    const byDay = healthByDay(days);
    expect(byDay.get("2026-11-03")).toBe(days[1]);
    expect(byDay.get("2026-11-04")).toBeUndefined();
  });
});
