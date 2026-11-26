import { describe, expect, it } from "vitest";
import type { HealthDay } from "../../src/core/types.ts";
import { HealthAggregator, type HealthRecord } from "./aggregate.ts";

const D = "2025-03-04";
const steps = (source: string, start: string, end: string, value: number, watch = false): HealthRecord => ({
  kind: "quantity",
  type: "steps",
  source,
  watch,
  start,
  end,
  value,
  unit: "count",
});
const sleep = (source: string, start: string, end: string, asleep = true): HealthRecord => ({ kind: "sleep", source, start, end, asleep });
const summary = (date: string, activeEnergy = 500, exerciseMin = 30, activeEnergyUnit = "kcal"): HealthRecord => ({
  kind: "summary",
  date,
  activeEnergy,
  activeEnergyUnit,
  exerciseMin,
});

function run(...records: HealthRecord[]): HealthDay[] {
  const agg = new HealthAggregator();
  for (const r of records) agg.add(r);
  return agg.days();
}

describe("HealthAggregator", () => {
  it("takes the larger of two sources in the same hour, not the sum", () => {
    expect(run(steps("Phone", `${D} 09:00:00`, `${D} 09:30:00`, 400), steps("Watch", `${D} 09:00:00`, `${D} 09:30:00`, 380, true))).toEqual([
      { date: D, steps: 400 },
    ]);
  });

  it("sums different hours, whichever source wins each", () => {
    const days = run(
      steps("Phone", `${D} 08:10:00`, `${D} 08:20:00`, 100),
      steps("Watch", `${D} 09:10:00`, `${D} 09:20:00`, 300, true),
      steps("Phone", `${D} 09:40:00`, `${D} 09:50:00`, 50),
    );
    expect(days).toEqual([{ date: D, steps: 400 }]);
  });

  it("splits a record across an hour boundary by time", () => {
    const days = run(steps("Phone", `${D} 09:50:00`, `${D} 10:20:00`, 600), steps("Watch", `${D} 10:00:00`, `${D} 10:10:00`, 300, true));
    expect(days).toEqual([{ date: D, steps: 600 }]);
  });

  it("splits a record across midnight", () => {
    expect(run(steps("Phone", `${D} 23:40:00`, "2025-03-05 00:10:00", 900))).toEqual([
      { date: D, steps: 600 },
      { date: "2025-03-05", steps: 300 },
    ]);
  });

  it("puts a zero-length record in its start hour", () => {
    expect(run(steps("Phone", `${D} 09:15:00`, `${D} 09:15:00`, 7))).toEqual([{ date: D, steps: 7 }]);
  });

  it("converts miles to kilometers and rounds to two decimals", () => {
    const record: HealthRecord = { kind: "quantity", type: "distance", source: "Phone", watch: false, start: `${D} 09:00:00`, end: `${D} 09:10:00`, value: 1, unit: "mi" };
    expect(run(record)).toEqual([{ date: D, distance_km: 1.61 }]);
  });

  it("takes ring totals only on days the Watch was worn", () => {
    const days = run(summary("2025-03-03"), summary(D), summary("2025-03-05"), steps("Watch", `${D} 09:00:00`, `${D} 09:10:00`, 100, true));
    expect(days).toEqual([{ date: D, steps: 100, active_kcal: 500, exercise_min: 30 }]);
  });

  it("converts kilojoules to kilocalories", () => {
    const watch = steps("Watch", `${D} 09:00:00`, `${D} 09:10:00`, 100, true);
    expect(run(watch, summary(D, 418.4, 30, "kJ"))[0]?.active_kcal).toBe(100);
    expect(run(watch, summary(D, 300, 30, "Cal"))[0]?.active_kcal).toBe(300);
    expect(run(watch, summary(D, 300, 30, "kcal"))[0]?.active_kcal).toBe(300);
  });

  it("counts overlapping sleep from two sources once", () => {
    const days = run(sleep("Watch", "2025-03-03 23:00:00", `${D} 06:00:00`), sleep("Phone", `${D} 05:00:00`, `${D} 07:00:00`));
    expect(days).toEqual([{ date: D, sleep_min: 480 }]);
  });

  it("ignores InBed and Awake", () => {
    expect(run(sleep("Watch", `${D} 01:00:00`, `${D} 06:00:00`, false))).toEqual([]);
    const days = run(sleep("Watch", `${D} 01:00:00`, `${D} 06:00:00`, false), steps("Phone", `${D} 09:00:00`, `${D} 09:10:00`, 10));
    expect(days[0]).not.toHaveProperty("sleep_min");
  });

  it("files a nap under the same day and a night under the morning", () => {
    const days = run(sleep("Watch", `${D} 14:00:00`, `${D} 14:30:00`), sleep("Watch", `${D} 23:30:00`, "2025-03-05 06:30:00"));
    expect(days).toEqual([
      { date: D, sleep_min: 30 },
      { date: "2025-03-05", sleep_min: 420 },
    ]);
  });

  it("files an interval ending exactly at 18:00 under that day", () => {
    expect(run(sleep("Watch", `${D} 17:00:00`, `${D} 18:00:00`))).toEqual([{ date: D, sleep_min: 60 }]);
  });

  it("leaves out days with no measures and never writes zeros", () => {
    const days = run(summary("2025-03-03"), steps("Phone", `${D} 09:00:00`, `${D} 09:10:00`, 10));
    expect(days).toHaveLength(1);
    expect(Object.keys(days[0]!)).toEqual(["date", "steps"]);
  });

  it("rounds steps, calories, exercise and sleep to whole numbers", () => {
    const days = run(
      steps("Watch", `${D} 09:00:00`, `${D} 09:10:00`, 10.6, true),
      summary(D, 99.5, 29.6),
      sleep("Watch", `${D} 01:00:00`, `${D} 01:00:40`),
    );
    expect(days).toEqual([{ date: D, steps: 11, active_kcal: 100, exercise_min: 30, sleep_min: 1 }]);
  });
});
