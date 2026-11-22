import { describe, expect, it } from "vitest";
import { calendarMonths, dayEntries, latestTrainingDay } from "./calendar";
import type { DayLoad } from "./consistency";
import { dataset, template, workout } from "./testkit";
import { buildTraining, latestEntries } from "./training";

const load = (sessions: number, sets: number): DayLoad => ({ sessions, sets, minutes: 60 });
const days = new Map([
  ["2026-10-19", load(1, 10)], // before the window
  ["2026-10-21", load(1, 12)],
  ["2026-11-03", load(2, 20)],
  ["2026-11-20", load(1, 9)], // after the window
]);
const w = { from: "2026-10-20", to: "2026-11-14" };

describe("calendarMonths", () => {
  const months = calendarMonths(days, w);

  it("lists months newest first", () => {
    expect(months.map((m) => m.month)).toEqual(["2026-11", "2026-10"]);
  });

  it("pads Monday-first weeks to seven days", () => {
    const [nov, oct] = months;
    // 2026-11-01 is a Sunday; 2026-10-01 is a Thursday.
    expect(nov.weeks[0].map((c) => c?.day ?? null)).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(oct.weeks[0].slice(0, 4).map((c) => c?.day ?? null)).toEqual([null, null, null, "2026-10-01"]);
    expect(nov.weeks).toHaveLength(6);
    expect(nov.weeks.at(-1)!.map((c) => c?.day ?? null)).toEqual(["2026-11-30", null, null, null, null, null, null]);
    for (const m of months) for (const week of m.weeks) expect(week).toHaveLength(7);
  });

  it("counts only days inside the window", () => {
    expect(months[0]).toMatchObject({ sessions: 2, trainingDays: 1 });
    expect(months[1]).toMatchObject({ sessions: 1, trainingDays: 1 });
  });

  it("marks days outside the window", () => {
    const cell = (day: string) => months.flatMap((m) => m.weeks.flat()).find((c) => c?.day === day)!;
    expect(cell("2026-10-19")).toEqual({ day: "2026-10-19", sets: 10, sessions: 1, inWindow: false });
    expect(cell("2026-11-14").inWindow).toBe(true);
    expect(cell("2026-11-15").inWindow).toBe(false);
    expect(cell("2026-11-03")).toEqual({ day: "2026-11-03", sets: 20, sessions: 2, inWindow: true });
  });

  it("lists a month with no training", () => {
    const m = calendarMonths(days, { from: "2026-09-15", to: "2026-10-05" });
    expect(m.map((x) => x.month)).toEqual(["2026-10", "2026-09"]);
    expect(m[1]).toMatchObject({ sessions: 0, trainingDays: 0 });
  });
});

describe("latestTrainingDay", () => {
  it("finds the latest day with a session in the window", () => {
    expect(latestTrainingDay(days, w)).toBe("2026-11-03");
    expect(latestTrainingDay(days, { from: "2026-12-01", to: "2026-12-31" })).toBeNull();
  });
});

describe("dayEntries", () => {
  const at = (id: string, start: string, end: string, kg: number) => ({
    ...workout(id, "2026-11-03", [["bench", [{ weight_kg: kg, reps: 5 }]]]),
    start_time: start,
    end_time: end,
  });
  const data = dataset(
    [
      at("b", "2026-11-03T22:00:00Z", "2026-11-03T23:00:00Z", 90),
      at("a", "2026-11-03T15:00:00Z", "2026-11-03T16:00:00Z", 100),
      at("late", "2026-11-04T07:30:00Z", "2026-11-04T08:30:00Z", 80),
    ],
    [template("bench", "weight_reps", "chest")],
  );
  const training = buildTraining(data, "UTC");

  it("lists a day's workouts oldest first", () => {
    expect(dayEntries(training, "2026-11-03", "UTC").map((e) => e.workout.id)).toEqual(["a", "b"]);
  });

  it("gives the same top sets and records as latestEntries", () => {
    const latest = latestEntries(training, 10, "UTC");
    for (const entry of dayEntries(training, "2026-11-03", "UTC")) {
      expect(entry.sets).toEqual(latest.find((e) => e.workout.id === entry.workout.id)!.sets);
    }
  });

  it("uses the local day", () => {
    const la = buildTraining(data, "America/Los_Angeles");
    expect(dayEntries(la, "2026-11-03", "America/Los_Angeles").map((e) => e.workout.id)).toContain("late");
    expect(dayEntries(la, "2026-11-04", "America/Los_Angeles")).toEqual([]);
  });

  it("returns nothing for a rest day", () => {
    expect(dayEntries(training, "2026-11-05", "UTC")).toEqual([]);
  });
});
