import { describe, expect, it } from "vitest";
import { dayGrid, monthlySessions, trainingDays, type DayLoad } from "./consistency";
import { workout } from "./testkit";

const tz = "America/Los_Angeles";

describe("trainingDays", () => {
  it("counts sessions and working sets per local day", () => {
    const a = workout("a", "2026-11-03", [["squat", [{ weight_kg: 60, reps: 5, type: "warmup" }, { weight_kg: 100, reps: 5 }]]]);
    const b = workout("b", "2026-11-03", [["row", [{ reps: 8 }, { reps: 8 }, { reps: 8 }]]]);
    expect(trainingDays([a, b], tz).get("2026-11-03")).toEqual({ sessions: 2, sets: 4 });
  });
});

const days = (entries: [string, number][]): Map<string, DayLoad> =>
  new Map(entries.map(([day, sessions]) => [day, { sessions, sets: sessions * 3 }]));

describe("monthlySessions", () => {
  it("compares this month with the average of the complete months since training began", () => {
    const d = days([
      ["2026-08-04", 1],
      ["2026-09-02", 1],
      ["2026-09-20", 1],
      ["2026-10-01", 2],
      ["2026-10-15", 1],
      ["2026-11-02", 1],
      ["2026-11-10", 1],
    ]);
    expect(monthlySessions(d, "2026-11-14")).toEqual({ thisMonth: 2, monthlyAverage: 2 });
  });

  it("has no average before a complete month of training", () => {
    expect(monthlySessions(days([["2026-11-05", 1]]), "2026-11-14")).toEqual({ thisMonth: 1, monthlyAverage: null });
  });
});

describe("dayGrid", () => {
  const d = new Map<string, DayLoad>([
    ["2026-11-10", { sessions: 1, sets: 4 }],
    ["2026-11-14", { sessions: 1, sets: 2 }],
  ]);
  const grid = dayGrid(d, "2026-11-14", 2);

  it("returns Monday-first weeks ending with the end day's week", () => {
    expect(grid.map((w) => w.weekStart)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("stops the last week at the end day", () => {
    const last = grid[1].days;
    expect(last.map((x) => x.day)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(last.map((x) => x.sets)).toEqual([0, 4, 0, 0, 0, 2]);
  });

  it("fills earlier weeks with all seven days", () => {
    expect(grid[0].days).toHaveLength(7);
  });
});
