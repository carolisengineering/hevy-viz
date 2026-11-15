import { describe, expect, it } from "vitest";
import sampleJson from "../../public/data/sample.json?raw";
import { toLocalDay } from "./dates";
import {
  e1rmHistory,
  e1rmIndex,
  e1rmSummary,
  estimateOneRepMax,
  exercisesByFrequency,
  liftsByFrequency,
  personalRecords,
  weeklySetsByMuscle,
  type E1rmPoint,
} from "./metrics";
import { rangeById } from "./ranges";
import type { HevyDataset, HevyExercise, HevySet, HevyWorkout } from "./types";

/** The pre-index algorithm, kept here as an independent reference: one full scan per exercise. */
function referenceHistory(workouts: HevyWorkout[], templateId: string, timeZone: string): E1rmPoint[] {
  const byDay = new Map<string, E1rmPoint>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (ex.exercise_template_id !== templateId) continue;
      for (const s of ex.sets.filter((x) => x.type !== "warmup")) {
        const e1rm = estimateOneRepMax(s);
        if (e1rm == null) continue;
        const date = toLocalDay(w.start_time, timeZone);
        const prev = byDay.get(date);
        if (!prev || e1rm > prev.e1rm) byDay.set(date, { date, e1rm, weightKg: s.weight_kg!, reps: s.reps!, workoutId: w.id });
      }
    }
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

type SetSpec = [weight: number | null, reps: number | null, type?: HevySet["type"]];

const exercise = (templateId: string, sets: SetSpec[], index = 0): HevyExercise => ({
  index,
  title: templateId,
  exercise_template_id: templateId,
  sets: sets.map(([weight_kg, reps, type = "normal"], i) => ({ index: i, type, weight_kg, reps })),
});

const workout = (id: string, date: string, sets: SetSpec[], templateId = "bench"): HevyWorkout => ({
  id,
  title: "Push",
  start_time: `${date}T18:00:00Z`,
  end_time: `${date}T19:00:00Z`,
  exercises: [exercise(templateId, sets)],
});

describe("estimateOneRepMax", () => {
  it("uses Epley", () => {
    expect(estimateOneRepMax({ weight_kg: 100, reps: 5 })).toBeCloseTo(116.67, 2);
  });
  it("returns the weight for a single", () => {
    expect(estimateOneRepMax({ weight_kg: 140, reps: 1 })).toBe(140);
  });
  it("rejects missing, zero, and high-rep sets", () => {
    expect(estimateOneRepMax({ weight_kg: null, reps: 5 })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 100, reps: null })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 100, reps: 0 })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 0, reps: 5 })).toBeNull();
    expect(estimateOneRepMax({ weight_kg: 40, reps: 20 })).toBeNull();
  });
});

describe("e1rmHistory", () => {
  it("keeps the best working set per day and ignores warmups", () => {
    const h = e1rmHistory(
      [
        workout("a", "2026-01-05", [[60, 10, "warmup"], [100, 5], [105, 3]]),
        workout("b", "2026-01-01", [[95, 5]]),
      ],
      "bench",
      "UTC",
    );
    expect(h.map((p) => p.date)).toEqual(["2026-01-01", "2026-01-05"]);
    expect(h[1].weightKg).toBe(100); // 100x5 (116.7) beats 105x3 (115.5)
  });
  it("ignores other exercises", () => {
    expect(e1rmHistory([workout("a", "2026-01-01", [[100, 5]], "squat")], "bench", "UTC")).toEqual([]);
  });
  it("dates a session by the local day it happened", () => {
    // 03:30 UTC on Jan 6 is the evening of Jan 5 in California.
    const w = { ...workout("a", "2026-01-06", [[100, 5]]), start_time: "2026-01-06T03:30:00Z" };
    expect(e1rmHistory([w], "bench", "America/Los_Angeles")[0].date).toBe("2026-01-05");
  });
});

describe("e1rmIndex", () => {
  const workouts: HevyWorkout[] = [
    {
      ...workout("a", "2026-01-08", []),
      exercises: [exercise("bench", [[100, 5]]), exercise("squat", [[140, 3]], 1), exercise("run", [[null, null]], 2)],
    },
    workout("b", "2026-01-01", [[95, 5]]),
  ];
  const index = e1rmIndex(workouts, "UTC");

  it("groups histories by exercise, oldest first", () => {
    expect(index.get("bench")?.map((p) => p.workoutId)).toEqual(["b", "a"]);
    expect(index.get("squat")?.map((p) => p.weightKg)).toEqual([140]);
  });
  it("omits exercises with no estimable sets", () => {
    expect(index.has("run")).toBe(false);
  });
  it("matches an independent per-exercise scan for every lift in the sample dataset", () => {
    const sample = JSON.parse(sampleJson) as HevyDataset;
    const tz = "America/Los_Angeles";
    const sampleIndex = e1rmIndex(sample.workouts, tz);
    expect(sampleIndex.size).toBe(sample.exercise_templates.length);
    for (const t of sample.exercise_templates) {
      expect(sampleIndex.get(t.id)).toEqual(referenceHistory(sample.workouts, t.id, tz));
    }
  });
});

describe("personalRecords", () => {
  it("returns only points that beat every earlier one", () => {
    const h = e1rmHistory(
      [
        workout("a", "2026-01-01", [[100, 5]]),
        workout("b", "2026-01-08", [[95, 5]]),
        workout("c", "2026-01-15", [[102.5, 5]]),
      ],
      "bench",
      "UTC",
    );
    expect(personalRecords(h).map((p) => p.workoutId)).toEqual(["a", "c"]);
  });
});

describe("weeklySetsByMuscle", () => {
  it("counts working sets by primary muscle per week", () => {
    const data: HevyDataset = {
      source: "sample",
      synced_at: "",
      workouts: [
        workout("a", "2026-11-10", [[60, 10, "warmup"], [100, 5], [100, 5]]),
        workout("b", "2026-11-12", [[100, 5]]),
      ],
      exercise_templates: [
        { id: "bench", title: "Bench", type: "weight_reps", primary_muscle_group: "chest", secondary_muscle_groups: [] },
      ],
    };
    expect(weeklySetsByMuscle(data, "UTC").get("2026-11-09")?.get("chest")).toBe(3);
  });
  it("buckets a Sunday-night session into its local week", () => {
    // 05:00 UTC Monday Nov 16 is 21:00 Sunday Nov 15 in California.
    const w = { ...workout("a", "2026-11-16", [[100, 5]]), start_time: "2026-11-16T05:00:00Z" };
    const data: HevyDataset = { source: "sample", synced_at: "", workouts: [w], exercise_templates: [] };
    expect([...weeklySetsByMuscle(data, "America/Los_Angeles").keys()]).toEqual(["2026-11-09"]);
  });
});

describe("exercisesByFrequency", () => {
  it("counts sessions, not sets", () => {
    const list = exercisesByFrequency([
      workout("a", "2026-01-01", [[100, 5], [100, 5]]),
      workout("b", "2026-01-02", [[100, 5]], "squat"),
      workout("c", "2026-01-03", [[100, 5]]),
    ]);
    expect(list[0]).toMatchObject({ templateId: "bench", sessions: 2 });
  });
});

describe("liftsByFrequency", () => {
  it("excludes exercises with no 1RM estimate, even when they are the most frequent", () => {
    const workouts = [
      workout("a", "2026-01-01", [[null, null]], "treadmill"),
      workout("b", "2026-01-02", [[null, null]], "treadmill"),
      workout("c", "2026-01-03", [[null, 10]], "pushup"),
      workout("d", "2026-01-04", [[100, 5]], "bench"),
    ];
    const lifts = liftsByFrequency(workouts, e1rmIndex(workouts, "UTC"));
    expect(lifts.map((e) => e.templateId)).toEqual(["bench"]);
  });
});

describe("e1rmSummary", () => {
  const all = e1rmHistory(
    [
      workout("a", "2025-01-01", [[100, 1]]),
      workout("b", "2025-06-01", [[120, 1]]),
      workout("c", "2026-10-01", [[110, 1]]),
      workout("d", "2026-11-01", [[115, 1]]),
    ],
    "bench",
    "UTC",
  );

  it("filters to the range ending at the latest session", () => {
    const s = e1rmSummary(all, rangeById("90d"));
    expect(s.history.map((p) => p.workoutId)).toEqual(["c", "d"]);
    expect(s.current?.workoutId).toBe("d");
    expect(s.change).toBe(5);
  });
  it("judges PRs against all-time history, not just the range", () => {
    expect(e1rmSummary(all, rangeById("90d")).prs).toEqual([]);
    expect(e1rmSummary(all, rangeById("all")).prs.map((p) => p.workoutId)).toEqual(["a", "b"]);
  });
  it("is empty for an empty history", () => {
    expect(e1rmSummary([], rangeById("all"))).toEqual({ history: [], prs: [], current: undefined, change: null });
  });
});
