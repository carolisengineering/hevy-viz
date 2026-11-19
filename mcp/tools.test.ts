import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIN_GROUPS } from "../src/core/muscles";
import { monthlySessions, windowStats } from "../src/core/consistency";
import { weekStart } from "../src/core/dates";
import { recordsBy, summarize } from "../src/core/progress";
import { rangeById, windowFor } from "../src/core/ranges";
import { buildTraining, mainLiftsIn } from "../src/core/training";
import type { HevyDataset } from "../src/core/types";
import { dataset, template, workout } from "../src/core/testkit";
import { formatChange, formatWeight } from "../src/format";
import { balance, consistency, exerciseProgress, findExercises, mainLifts, recentWorkouts, resolveExercise, resolveWindow, ToolError, type ToolContext } from "./tools";

const sample = JSON.parse(readFileSync(new URL("../public/data/sample.json", import.meta.url), "utf8")) as HevyDataset;
const t = buildTraining(sample, "America/Chicago");
const ctx: ToolContext = { training: t, timeZone: "America/Chicago", syncedAt: sample.synced_at };

/** The ToolError a call throws, so a test can read its message. */
function toolError(call: () => unknown): ToolError {
  try {
    call();
  } catch (e) {
    if (e instanceof ToolError) return e;
    throw e;
  }
  throw new Error("expected a ToolError");
}

describe("resolveExercise", () => {
  it("matches a title trimmed and in any case", () => {
    expect(resolveExercise(t, "  squat (BARBELL) ").templateId).toBe("squat");
  });

  it("prefers an exact id over a substring of a title", () => {
    expect(resolveExercise(t, "squat").templateId).toBe("squat");
    expect(resolveExercise(t, "ohp").templateId).toBe("ohp");
  });

  it("takes a unique substring", () => {
    expect(resolveExercise(t, "overhead").templateId).toBe("ohp");
  });

  it("lists the candidates, with ids, when a name is ambiguous", () => {
    const e = toolError(() => resolveExercise(t, "press"));
    expect(e.message).toContain('"press" matches 2 exercises');
    expect(e.message).toContain("Bench Press (Barbell) (bench)");
    expect(e.message).toContain("Overhead Press (Barbell) (ohp)");
  });

  it("lists at most 10 candidates, most sessions first", () => {
    const many = buildTraining(
      {
        ...sample,
        exercise_templates: [],
        workouts: Array.from({ length: 12 }, (_, i) => ({
          ...sample.workouts[0],
          id: `w${i}`,
          exercises: Array.from({ length: i + 1 }, (_, j) => ({ ...sample.workouts[0].exercises[0], exercise_template_id: `curl-${j}`, title: `Curl ${j}` })),
        })),
      },
      "UTC",
    );
    const message = toolError(() => resolveExercise(many, "curl")).message;
    expect(message).toContain('"curl" matches 12 exercises');
    expect(message).toContain("Curl 0 (curl-0), Curl 1 (curl-1)");
    expect(message).toContain("Curl 9 (curl-9)");
    expect(message).not.toContain("(curl-10)");
    expect(message).toContain("and 2 more");
  });

  it("treats regex characters literally and says nothing matches", () => {
    for (const query of ["Pull-Up+", "(.*)"]) {
      expect(toolError(() => resolveExercise(t, query)).message).toBe(`No exercise matches "${query}"; find_exercises lists them.`);
    }
  });

  it("asks for a name when given only spaces", () => {
    expect(toolError(() => resolveExercise(t, "   ")).message).toMatch(/^Name an exercise/);
  });
});

describe("resolveWindow", () => {
  it("defaults to the past year", () => {
    expect(resolveWindow(t, {})).toEqual(windowFor(rangeById("1y"), t.endDay));
  });

  it("starts all time at the first workout", () => {
    expect(resolveWindow(t, { range: "all" })).toEqual({ from: t.firstDay, to: t.endDay });
  });

  it("runs `from` alone to the end day, and `to` alone from the first workout", () => {
    expect(resolveWindow(t, { from: "2026-01-01" })).toEqual({ from: "2026-01-01", to: t.endDay });
    expect(resolveWindow(t, { to: "2025-01-01" })).toEqual({ from: t.firstDay, to: "2025-01-01" });
  });

  it("lets a custom window override the range", () => {
    expect(resolveWindow(t, { range: "90d", from: "2025-01-01", to: "2025-12-31" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });

  it("accepts a window outside the data", () => {
    expect(resolveWindow(t, { from: "2030-01-01", to: "2030-02-01" })).toEqual({ from: "2030-01-01", to: "2030-02-01" });
  });

  it("ends a custom window at the end day and starts it no earlier than the first workout", () => {
    expect(resolveWindow(t, { from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2026-01-01", to: t.endDay });
    expect(resolveWindow(t, { from: "2015-01-01", to: "2025-06-30" })).toEqual({ from: t.firstDay, to: "2025-06-30" });
  });

  it("gives an empty window, not an error, when a half-given window misses the data", () => {
    expect(resolveWindow(t, { to: "2020-01-01" })).toEqual({ from: "2020-01-01", to: "2020-01-01" });
    expect(resolveWindow(t, { from: "2099-01-01" })).toEqual({ from: "2099-01-01", to: "2099-01-01" });
  });

  it("rejects dates that aren't real YYYY-MM-DD days", () => {
    for (const from of ["2026-02-30", "2026-1-5", "Jan 5", "2026-13-01"]) {
      expect(toolError(() => resolveWindow(t, { from })).message).toBe("Dates must be YYYY-MM-DD, like 2026-01-31.");
    }
  });

  it("rejects a window that starts after it ends", () => {
    expect(toolError(() => resolveWindow(t, { from: "2026-05-01", to: "2026-04-01" })).message).toBe(
      "The window starts after it ends: 2026-05-01 is after 2026-04-01.",
    );
  });
});

describe("findExercises", () => {
  it("searches titles as a plain substring and counts every match", () => {
    const result = findExercises(ctx, { query: "(barbell)" });
    expect(result.total).toBe(5);
    expect(result.exercises.map((e) => e.id)).not.toContain("pullup");
  });

  it("lists most sessions first by default, like the dashboard", () => {
    expect(findExercises(ctx, {}).exercises.map((e) => e.id)).toEqual(t.exercises.map((e) => e.templateId));
  });

  it("sorts A–Z and by most recent", () => {
    const az = findExercises(ctx, { sort: "az" }).exercises.map((e) => e.title);
    expect(az).toEqual(az.toSorted((a, b) => a.localeCompare(b)));
    const recent = findExercises(ctx, { sort: "recent" }).exercises.map((e) => e.lastDone);
    expect(recent).toEqual(recent.toSorted().reverse());
  });

  it("filters by kind", () => {
    expect(findExercises(ctx, { kind: "weights" }).total).toBe(6);
    expect(findExercises(ctx, { kind: "timed" })).toMatchObject({ total: 0, exercises: [] });
  });

  it("caps the list at 50 and defaults to 20", () => {
    const many = buildTraining(
      {
        ...sample,
        exercise_templates: [],
        workouts: [{ ...sample.workouts[0], exercises: Array.from({ length: 60 }, (_, j) => ({ ...sample.workouts[0].exercises[0], exercise_template_id: `x${j}`, title: `X ${j}` })) }],
      },
      "UTC",
    );
    const manyCtx = { ...ctx, training: many };
    expect(findExercises(manyCtx, {}).exercises).toHaveLength(20);
    expect(findExercises(manyCtx, { limit: 500 })).toMatchObject({ total: 60 });
    expect(findExercises(manyCtx, { limit: 500 }).exercises).toHaveLength(50);
  });

  it("gives the best in whole pounds, with the dashboard's text", () => {
    const [squat] = findExercises(ctx, { query: "squat", unit: "lb" }).exercises;
    const best = recordsBy(t.index.get("squat")!.points).at(-1)!;
    expect(squat).toMatchObject({ id: "squat", title: "Squat (Barbell)", muscle: "Quadriceps", group: "Legs", measure: "Est. 1RM" });
    expect(Number.isInteger(squat.best!.value)).toBe(true);
    expect(squat.best).toEqual({ value: Number(formatWeight(best.value, "lb")), text: formatWeight(best.value, "lb"), date: best.date });
  });

  it("gives the best in whole pounds by default", () => {
    const result = findExercises(ctx, { query: "squat" });
    expect(Number.isInteger(result.exercises[0].best!.value)).toBe(true);
    expect(result.context.unit).toBe("lb");
  });

  it("gives the best in kg to 0.1 when asked", () => {
    const [squat] = findExercises(ctx, { query: "squat", unit: "kg" }).exercises;
    expect(squat.best!.value * 10).toBeCloseTo(Math.round(squat.best!.value * 10));
    expect(squat.best!.text).toBe(String(squat.best!.value));
  });

  it("gives a null best for an exercise with no sets to chart", () => {
    const warmupsOnly = buildTraining(
      {
        ...sample,
        workouts: [{ ...sample.workouts[0], exercises: [{ ...sample.workouts[0].exercises[0], sets: sample.workouts[0].exercises[0].sets.map((s) => ({ ...s, type: "warmup" as const })) }] }],
      },
      "UTC",
    );
    expect(findExercises({ ...ctx, training: warmupsOnly }, {}).exercises[0].best).toBeNull();
  });

  it("says what data it describes", () => {
    expect(findExercises(ctx, { unit: "lb" }).context).toEqual({
      source: "sample",
      syncedAt: sample.synced_at,
      timeZone: "America/Chicago",
      window: null,
      unit: "lb",
    });
  });
});

/** Monday-first weeks a window touches. */
const weeksTouched = (from: string, to: string) => (Date.parse(weekStart(to)) - Date.parse(weekStart(from))) / (7 * 86_400_000) + 1;
/** A kg value as the tools return it: 0.1 kg. */
const kg = (v: number) => Number(formatWeight(v, "kg"));

describe("exerciseProgress", () => {
  describe("names the unit of a time or distance", () => {
    const cardio = buildTraining(
      dataset(
        [workout("w", "2026-10-01", [["plank", [{ duration_seconds: 60 }]], ["row-erg", [{ distance_meters: 2000, duration_seconds: 480 }]]])],
        [template("plank", "duration", "abdominals"), template("row-erg", "distance_duration", "cardio")],
      ),
      "America/Chicago",
    );
    const c: ToolContext = { training: cardio, timeZone: "America/Chicago", syncedAt: "2026-11-14T00:00:00Z" };

    it("gives seconds for a timed exercise", () => {
      expect(exerciseProgress(c, { exercise: "plank" }).unit).toBe("seconds");
    });
    it("gives meters for a distance exercise", () => {
      expect(exerciseProgress(c, { exercise: "row-erg" }).unit).toBe("meters");
    });
    it("gives meters for a distance exercise even when lb is asked for", () => {
      expect(exerciseProgress(c, { exercise: "row-erg", unit: "lb" }).unit).toBe("meters");
    });
  });

  const all = exerciseProgress(ctx, { exercise: "squat", range: "all", unit: "kg" });

  it("matches the dashboard's summary for the same exercise and range", () => {
    const s = summarize(t.index.get("squat")!.points, rangeById("all"), t.endDay);
    expect(all.bestEver!.value).toBe(kg(s.best!.value));
    expect(all.changeInWindow).toEqual({ value: Math.sign(s.change!) * kg(Math.abs(s.change!)), text: formatChange("e1rm", s.change!, "kg") });
    expect(all.prsInWindow).toHaveLength(Math.min(20, s.prs.length));
    expect(all.prsInWindow.at(-1)!.date).toBe(s.prs.at(-1)!.date);
    expect(all.daysCharted).toBe(s.history.length);
    expect(all.latestInWindow!.date).toBe(s.current!.date);
  });

  it("names the exercise, its measure and unit, and the data it describes", () => {
    expect(all).toMatchObject({ id: "squat", title: "Squat (Barbell)", measure: "Est. 1RM", unit: "kg" });
    expect(all.context).toEqual({ source: "sample", syncedAt: sample.synced_at, timeZone: "America/Chicago", window: { from: t.firstDay, to: t.endDay }, unit: "kg" });
    expect(all.bestEver!.set).toMatch(/^\d+(\.\d)? × \d+$/);
  });

  it("counts workouts with the exercise in the window", () => {
    const w = resolveWindow(t, { range: "90d" });
    const expected = sample.workouts.filter((wk) => {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(wk.start_time));
      return day >= w.from && day <= w.to && wk.exercises.some((e) => e.exercise_template_id === "squat");
    }).length;
    expect(exerciseProgress(ctx, { exercise: "squat", range: "90d" }).sessionsInWindow).toBe(expected);
  });

  it("charts weekly bests for a year", () => {
    expect(exerciseProgress(ctx, { exercise: "squat" }).series.by).toBe("week");
  });

  it("switches to monthly bests past 104 weeks", () => {
    expect(all.series.by).toBe(weeksTouched(t.firstDay, t.endDay) > 104 ? "month" : "week");
    const long = buildTraining(
      dataset(
        ["2023-01-02", "2026-01-05"].map((day, i) => workout(`w${i}`, day, [["squat", [{ weight_kg: 100, reps: 5 }]]])),
        [template("squat", "weight_reps", "quadriceps")],
      ),
      "UTC",
    );
    expect(exerciseProgress({ ...ctx, training: long, timeZone: "UTC" }, { exercise: "squat", from: "2023-01-02", to: "2026-01-05" }).series.by).toBe("month");
  });

  it("gives each period's best value", () => {
    for (const range of ["1y", "all"] as const) {
      const result = exerciseProgress(ctx, { exercise: "squat", range, unit: "kg" });
      const history = summarize(t.index.get("squat")!.points, rangeById(range), t.endDay).history;
      const keyOf = (day: string) => (result.series.by === "week" ? weekStart(day) : `${day.slice(0, 7)}-01`);
      expect(result.series.points.length).toBeGreaterThan(0);
      for (const [start, value] of result.series.points) {
        const best = Math.max(...history.filter((p) => keyOf(p.date) === start).map((p) => p.value));
        expect(value).toBe(kg(best));
      }
    }
  });

  it("gives whole pounds when asked", () => {
    const lb = exerciseProgress(ctx, { exercise: "squat", unit: "lb" });
    expect(lb.unit).toBe("lb");
    expect(Number.isInteger(lb.bestEver!.value)).toBe(true);
    expect(lb.series.points.every(([, v]) => Number.isInteger(v))).toBe(true);
  });

  it("returns an empty but valid result for a window outside the data", () => {
    const empty = exerciseProgress(ctx, { exercise: "squat", from: "2030-01-01", to: "2030-02-01" });
    expect(empty).toMatchObject({ daysCharted: 0, sessionsInWindow: 0, latestInWindow: null, changeInWindow: null, prsInWindow: [], breaks: [], series: { points: [] } });
    expect(empty.bestEver).not.toBeNull();
  });

  it("lists breaks longer than 28 days inside the window", () => {
    const gappy = buildTraining(
      dataset(
        ["2026-01-01", "2026-01-20", "2026-04-01", "2026-04-05"].map((day, i) => workout(`w${i}`, day, [["squat", [{ weight_kg: 100, reps: 5 }]]])),
        [template("squat", "weight_reps", "quadriceps")],
      ),
      "UTC",
    );
    const gappyCtx = { ...ctx, training: gappy, timeZone: "UTC" };
    expect(exerciseProgress(gappyCtx, { exercise: "squat", range: "all" }).breaks).toEqual([{ from: "2026-01-20", to: "2026-04-01", days: 71 }]);
    expect(exerciseProgress(gappyCtx, { exercise: "squat", from: "2026-03-01" }).breaks).toEqual([]);
  });

  it("says there's nothing to chart for an exercise with only warmups", () => {
    const warm = buildTraining(
      dataset([workout("w", "2026-10-01", [["warm", [{ weight_kg: 50, reps: 5, type: "warmup" }]]])], [template("warm", "weight_reps", "chest")]),
      "UTC",
    );
    const result = exerciseProgress({ ...ctx, training: warm, timeZone: "UTC" }, { exercise: "warm" });
    expect(result).toMatchObject({ bestEver: null, latestInWindow: null, series: { points: [] }, note: "No sets to chart" });
    expect(all.note).toBeUndefined();
  });

  it("keeps the 20 most recent PRs", () => {
    const climbing = buildTraining(
      dataset(
        Array.from({ length: 30 }, (_, i) => workout(`w${i}`, `2026-09-${String(i + 1).padStart(2, "0")}`, [["squat", [{ weight_kg: 100 + i, reps: 5 }]]])),
        [template("squat", "weight_reps", "quadriceps")],
      ),
      "UTC",
    );
    const prs = exerciseProgress({ ...ctx, training: climbing, timeZone: "UTC" }, { exercise: "squat", range: "all" }).prsInWindow;
    expect(prs).toHaveLength(20);
    expect(prs[0].date).toBe("2026-09-11");
    expect(prs.at(-1)!.date).toBe("2026-09-30");
  });

  it("stays under 4 KB for squat over all time", () => {
    expect(JSON.stringify(all).length).toBeLessThan(4096);
  });

  it("throws for an unknown exercise", () => {
    expect(toolError(() => exerciseProgress(ctx, { exercise: "nope" })).message).toBe('No exercise matches "nope"; find_exercises lists them.');
  });
});

describe("mainLifts", () => {
  const result = mainLifts(ctx, { range: "all", unit: "kg" });

  it("lists the dashboard's main lifts in its order", () => {
    expect(result.lifts.map((l) => l.id)).toEqual(mainLiftsIn(t, windowFor(rangeById("all"), t.endDay, t.firstDay)).map((m) => m.lift.templateId));
    expect(result.lifts.map((l) => l.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("puts each lift on its side of the tracklist", () => {
    const side = Object.fromEntries(result.lifts.map((l) => [l.id, l.side]));
    expect(side).toMatchObject({ squat: "lower", deadlift: "lower", bench: "upper", ohp: "upper" });
  });

  it("gives each lift's best set, change, latest and PR in the window, as the dashboard figures them", () => {
    const squat = result.lifts.find((l) => l.id === "squat")!;
    const s = summarize(t.index.get("squat")!.points, rangeById("all"), t.endDay);
    const best = recordsBy(s.history).at(-1)!;
    expect(squat.daysCharted).toBe(s.history.length);
    expect(squat.bestSetInWindow).toMatchObject({ value: kg(best.value), date: best.date });
    expect(squat.change!.text).toBe(formatChange("e1rm", s.change!, "kg"));
    expect(squat.latest).toEqual({ value: kg(s.current!.value), text: formatWeight(s.current!.value, "kg") });
    expect(squat.prInWindow).toBe(s.prs.length > 0);
  });

  it("returns no lifts for a window outside the data", () => {
    expect(mainLifts(ctx, { from: "2030-01-01", to: "2030-02-01" }).lifts).toEqual([]);
  });
});

describe("consistency", () => {
  const result = consistency(ctx, { range: "90d" });
  const w = resolveWindow(t, { range: "90d" });

  it("compares this month with the monthly average, as on the overview", () => {
    const m = monthlySessions(t.days, t.endDay);
    expect(result.thisMonth).toBe(m.thisMonth);
    expect(result.monthlyAverage).toBeCloseTo(m.monthlyAverage!, 1);
  });

  it("counts sessions, training days and weeks in the window", () => {
    const stats = windowStats(t.days, w);
    expect(result).toMatchObject({
      sessionsInWindow: stats.sessions,
      trainingDaysInWindow: stats.trainingDays,
      sessionsPerWeek: stats.sessionsPerWeek,
      weeksTrained: stats.weeksTrained,
      weeksInWindow: stats.weeks,
    });
    expect([13, 14]).toContain(result.weeksInWindow);
  });

  it("gives the longest break in the window", () => {
    expect(result.longestBreak!.days).toBeGreaterThan(0);
    expect(result.longestBreak!.from >= w.from && result.longestBreak!.to <= w.to).toBe(true);
    expect(result.context).toMatchObject({ window: w, unit: null });
  });

  it("counts no weeks or rest days past the end day or before the first workout", () => {
    expect(consistency(ctx, { from: "2026-01-01", to: "2026-12-31" })).toEqual(consistency(ctx, { from: "2026-01-01" }));
    expect(consistency(ctx, { from: "2015-01-01" })).toEqual(consistency(ctx, { range: "all" }));
  });

  it("finds no break in a window outside the data", () => {
    expect(consistency(ctx, { from: "2030-01-01", to: "2030-02-01" })).toMatchObject({ sessionsInWindow: 0, longestBreak: null });
  });
});

describe("balance", () => {
  const result = balance(ctx, { range: "all" });

  it("lists the six main groups in order, with the light rule", () => {
    expect(result.groups.map((g) => g.group)).toEqual(MAIN_GROUPS);
    expect(result.rule).toBe("Light means under half the sets per week of the median group.");
  });

  it("lists at most the ten busiest muscles, rounded to 0.1", () => {
    expect(result.muscles.length).toBeGreaterThan(0);
    expect(result.muscles.length).toBeLessThanOrEqual(10);
    for (const v of [...result.groups, ...result.muscles].map((x) => x.setsPerWeek)) expect(Math.round(v * 10) / 10).toBe(v);
    const perWeek = result.muscles.map((m) => m.setsPerWeek);
    expect(perWeek).toEqual(perWeek.toSorted((a, b) => b - a));
  });

  it("counts no weeks past the end day", () => {
    expect(balance(ctx, { from: "2026-01-01", to: "2026-12-31" })).toEqual(balance(ctx, { from: "2026-01-01" }));
  });

  it("gives zero sets for a window outside the data", () => {
    const empty = balance(ctx, { from: "2030-01-01", to: "2030-02-01" });
    expect(empty.muscles).toEqual([]);
    expect(empty.groups.every((g) => g.setsPerWeek === 0)).toBe(true);
  });
});

describe("recentWorkouts", () => {
  /** Workouts on local days in a window, counted from the dataset. */
  const workoutsIn = (from: string, to: string) =>
    sample.workouts.filter((wk) => {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(wk.start_time));
      return day >= from && day <= to;
    }).length;

  it("lists the latest five workouts, newest first, with no window", () => {
    const result = recentWorkouts(ctx, {});
    expect(result.workouts).toHaveLength(5);
    expect(result.workouts[0].date).toBe(t.endDay);
    expect(result.context.window).toBeNull();
    expect(result).not.toHaveProperty("totalInWindow");
  });

  it("returns at most 40 workouts", () => {
    const result = recentWorkouts(ctx, { limit: 99 });
    expect(result.workouts).toHaveLength(40);
    const dates = result.workouts.map((w) => w.date);
    expect(dates).toEqual(dates.toSorted().reverse());
  });

  it("returns every workout in a window, newest first", () => {
    const result = recentWorkouts(ctx, { from: "2026-10-01", to: "2026-10-31" });
    const expected = workoutsIn("2026-10-01", "2026-10-31");
    expect(expected).toBeGreaterThan(5);
    expect(result.workouts).toHaveLength(expected);
    expect(result.totalInWindow).toBe(expected);
    expect(result.workouts.every((w) => w.date >= "2026-10-01" && w.date <= "2026-10-31")).toBe(true);
    expect(result.context.window).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(result).not.toHaveProperty("note");
  });

  it("takes a preset range as a window", () => {
    const w = resolveWindow(t, { range: "90d" });
    expect(recentWorkouts(ctx, { range: "90d" }).totalInWindow).toBe(workoutsIn(w.from, w.to));
  });

  it("says how many it left out when a window holds more than the cap", () => {
    const w = resolveWindow(t, { range: "1y" });
    const total = workoutsIn(w.from, w.to);
    expect(total).toBeGreaterThan(40);
    const result = recentWorkouts(ctx, { range: "1y" });
    expect(result.workouts).toHaveLength(40);
    expect(result.totalInWindow).toBe(total);
    expect(result.note).toBe(`Showing the latest 40 of ${total} workouts in the window; ask for a shorter window to see the rest.`);
  });

  it("honors a smaller limit inside a window", () => {
    const result = recentWorkouts(ctx, { from: "2026-10-01", to: "2026-10-31", limit: 3 });
    expect(result.workouts).toHaveLength(3);
    expect(result.note).toMatch(/^Showing the latest 3 of \d+ workouts/);
  });

  it("returns an empty list for a window outside the data", () => {
    expect(recentWorkouts(ctx, { from: "2030-01-01", to: "2030-01-31" })).toMatchObject({ workouts: [], totalInWindow: 0 });
  });

  it("gives each exercise's top set as the log writes it", () => {
    const [latest] = recentWorkouts(ctx, { limit: 1, unit: "lb" }).workouts;
    expect(latest.exercises.length).toBeGreaterThan(0);
    for (const e of latest.exercises) {
      expect(e.topSet).toMatch(/^\d+ × \d+$/);
      expect(typeof e.allTimeRecord).toBe("boolean");
      expect(t.index.has(e.id)).toBe(true);
    }
  });
});

describe("the default unit", () => {
  it("is lb for every tool that takes a unit, when none is given", () => {
    expect(findExercises(ctx, {}).context.unit).toBe("lb");
    expect(exerciseProgress(ctx, { exercise: "squat" }).context.unit).toBe("lb");
    expect(mainLifts(ctx, {}).context.unit).toBe("lb");
    expect(recentWorkouts(ctx, {}).context.unit).toBe("lb");
  });

  it("stays null for the tools that take no unit", () => {
    expect(consistency(ctx, {}).context.unit).toBeNull();
    expect(balance(ctx, {}).context.unit).toBeNull();
  });
});

describe("result sizes", () => {
  // The spec's "typical result" is a default call; recent_workouts over a month runs past 4 KB by design.
  it("keeps every typical result under 4 KB", () => {
    const results = [
      findExercises(ctx, { limit: 50 }),
      mainLifts(ctx, { range: "all" }),
      consistency(ctx, { range: "all" }),
      balance(ctx, { range: "all" }),
      recentWorkouts(ctx, {}),
    ];
    for (const r of results) expect(JSON.stringify(r).length).toBeLessThan(4096);
  });
});
