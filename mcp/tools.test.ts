import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordsBy } from "../src/core/progress";
import { rangeById, windowFor } from "../src/core/ranges";
import { buildTraining } from "../src/core/training";
import type { HevyDataset } from "../src/core/types";
import { formatWeight } from "../src/format";
import { findExercises, resolveExercise, resolveWindow, ToolError, type ToolContext } from "./tools";

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
      expect(toolError(() => resolveExercise(t, query)).message).toBe(`No exercise matches "${query}".`);
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

  it("gives the best in kg to 0.1 by default", () => {
    const [squat] = findExercises(ctx, { query: "squat" }).exercises;
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
