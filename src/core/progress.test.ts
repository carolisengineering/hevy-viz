import { describe, expect, it } from "vitest";
import sampleJson from "../../public/data/sample.json?raw";
import { toLocalDay } from "./dates";
import { estimateOneRepMax } from "./metrics";
import { bestSet, longBreaks, metricFor, progressIndex, recordsBy, summarize, summarizeIn } from "./progress";
import { rangeById } from "./ranges";
import { dataset, template, workout } from "./testkit";
import type { HevyDataset, HevyWorkout } from "./types";

describe("metricFor", () => {
  it("charts weight-and-reps lifts by estimated 1RM when a set can be estimated", () => {
    expect(metricFor("weight_reps", true)).toBe("e1rm");
    expect(metricFor("weight_reps", false)).toBe("weight");
  });

  it("charts weighted types by the heaviest set", () => {
    expect(metricFor("bodyweight_weighted", false)).toBe("weight");
    expect(metricFor("short_distance_weight", true)).toBe("weight");
    expect(metricFor("weight_duration", false)).toBe("weight");
  });

  it("charts bodyweight types by reps", () => {
    expect(metricFor("reps_only", false)).toBe("reps");
    expect(metricFor("bodyweight_assisted", true)).toBe("reps");
  });

  it("charts timed types by duration", () => {
    expect(metricFor("duration", false)).toBe("duration");
    expect(metricFor("floors_duration", false)).toBe("duration");
    expect(metricFor("steps_duration", false)).toBe("duration");
  });

  it("charts distance types by distance", () => {
    expect(metricFor("distance_duration", false)).toBe("distance");
  });
});

describe("progressIndex", () => {
  const w1 = workout("w1", "2026-01-05", [
    [
      "bench",
      [
        { weight_kg: 60, reps: 10, type: "warmup" },
        { weight_kg: 100, reps: 5 },
        { weight_kg: 105, reps: 3 },
      ],
    ],
    ["pullup", [{ reps: 8 }, { reps: 10 }]],
    ["plank", [{ duration_seconds: 60 }, { duration_seconds: 75 }]],
    ["run", [{ distance_meters: 5000, duration_seconds: 1500 }]],
    [
      "curl",
      [
        { weight_kg: 12, reps: 15 },
        { weight_kg: 14, reps: 15 },
      ],
    ],
  ]);
  const w2 = workout("w2", "2026-01-08", [
    ["bench", [{ weight_kg: 102.5, reps: 5 }]],
    ["pullup", [{ reps: 12 }]],
  ]);
  const w3 = workout("w3", "2026-01-08", [["bench", [{ weight_kg: 90, reps: 5 }]]]);
  const templates = [
    template("bench", "weight_reps", "chest"),
    template("pullup", "reps_only", "lats"),
    template("plank", "duration", "abdominals"),
    template("run", "distance_duration", "cardio"),
    template("curl", "weight_reps", "biceps"),
  ];
  const index = progressIndex(dataset([w1, w2, w3], templates), "America/Los_Angeles");

  it("indexes every exercise", () => {
    expect([...index.keys()].sort()).toEqual(["bench", "curl", "plank", "pullup", "run"]);
  });

  it("keeps the best estimated 1RM per day for a weight-and-reps lift", () => {
    const bench = index.get("bench")!;
    expect(bench.metric).toBe("e1rm");
    expect(bench.points.map((p) => [p.date, p.weightKg, p.reps, p.workoutId])).toEqual([
      ["2026-01-05", 100, 5, "w1"],
      ["2026-01-08", 102.5, 5, "w2"],
    ]);
  });

  it("charts reps, duration and distance types by their own measure", () => {
    expect(index.get("pullup")!.points.map((p) => p.value)).toEqual([10, 12]);
    expect(index.get("plank")!.points.map((p) => p.value)).toEqual([75]);
    expect(index.get("run")!.points[0]).toMatchObject({ value: 5000, distanceM: 5000, durationS: 1500 });
  });

  it("charts a lift with no estimable set by its heaviest set", () => {
    const curl = index.get("curl")!;
    expect(curl.metric).toBe("weight");
    expect(curl.points[0]).toMatchObject({ value: 14, reps: 15 });
  });

  it("counts sessions and the last day trained", () => {
    expect(index.get("bench")).toMatchObject({ sessions: 3, lastDay: "2026-01-08" });
  });

  it("dates a session by the local day it happened", () => {
    // 03:30 UTC on Jan 6 is the evening of Jan 5 in California.
    const late = { ...workout("late", "2026-01-06", [["bench", [{ weight_kg: 100, reps: 5 }]]]), start_time: "2026-01-06T03:30:00Z" };
    expect(progressIndex(dataset([late], templates), "America/Los_Angeles").get("bench")!.points[0].date).toBe("2026-01-05");
  });

  it("charts a type Hevy adds later by what its sets record", () => {
    const w = workout("w5", "2026-02-02", [
      ["hold", [{ duration_seconds: 40 }, { duration_seconds: 55 }]],
      ["hops", [{ reps: 30 }]],
    ]);
    const index = progressIndex(dataset([w], [template("hold", "brand_new_timed", "calves"), template("hops", "brand_new_reps", "calves")]), "UTC");
    expect(index.get("hold")).toMatchObject({ metric: "duration", points: [{ value: 55 }] });
    expect(index.get("hops")).toMatchObject({ metric: "reps", points: [{ value: 30 }] });
  });

  it("infers the type of an exercise with no template from its sets", () => {
    const w = workout("w4", "2026-02-01", [["mystery", [{ weight_kg: 50, reps: 5 }]]]);
    const mystery = progressIndex(dataset([w], []), "America/Los_Angeles").get("mystery");
    expect(mystery).toMatchObject({ type: "weight_reps", metric: "e1rm", muscle: "other" });
  });
});

describe("progressIndex on the sample dataset", () => {
  /** The pre-index algorithm, kept here as an independent reference: one full scan per exercise. */
  function referenceHistory(workouts: HevyWorkout[], templateId: string, timeZone: string) {
    const byDay = new Map<string, { date: string; value: number; weightKg: number; reps: number; workoutId: string }>();
    for (const w of workouts) {
      for (const ex of w.exercises) {
        if (ex.exercise_template_id !== templateId) continue;
        for (const s of ex.sets.filter((x) => x.type !== "warmup")) {
          const e1rm = estimateOneRepMax(s);
          if (e1rm == null) continue;
          const date = toLocalDay(w.start_time, timeZone);
          const prev = byDay.get(date);
          if (!prev || e1rm > prev.value) byDay.set(date, { date, value: e1rm, weightKg: s.weight_kg!, reps: s.reps!, workoutId: w.id });
        }
      }
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  it("matches an independent per-exercise scan for every estimated-1RM lift", () => {
    const sample = JSON.parse(sampleJson) as HevyDataset;
    const tz = "America/Los_Angeles";
    const index = progressIndex(sample, tz);
    const lifts = sample.exercise_templates.filter((t) => index.get(t.id)?.metric === "e1rm");
    expect(lifts.length).toBe(sample.exercise_templates.length);
    for (const t of lifts) {
      const points = index.get(t.id)!.points.map((p) => ({
        date: p.date,
        value: p.value,
        weightKg: p.weightKg,
        reps: p.reps,
        workoutId: p.workoutId,
      }));
      expect(points).toEqual(referenceHistory(sample.workouts, t.id, tz));
    }
  });
});

describe("recordsBy", () => {
  it("keeps each point that beats every earlier one", () => {
    const points = [1, 3, 2, 4].map((value) => ({ value }));
    expect(recordsBy(points).map((p) => p.value)).toEqual([1, 3, 4]);
  });
});

describe("summarize", () => {
  const all = [
    { date: "2025-01-01", value: 100 },
    { date: "2025-06-01", value: 120 },
    { date: "2026-10-01", value: 110 },
    { date: "2026-11-01", value: 115 },
  ];
  const ninety = rangeById("90d");

  it("narrows to the range and keeps the all-time best and last session", () => {
    const s = summarize(all, ninety, "2026-11-14");
    expect(s.history.map((p) => p.value)).toEqual([110, 115]);
    expect(s.change).toBe(5);
    expect(s.best).toBe(all[1]);
    expect(s.lastSession).toBe(all[3]);
  });

  it("judges PRs against all time", () => {
    expect(summarize(all, ninety, "2026-11-14").prs).toEqual([]);
    expect(summarize(all, rangeById("all"), "2026-11-14").prs.map((p) => p.value)).toEqual([100, 120]);
  });

  it("counts the range back from the end day, not from the last session", () => {
    // 90 days before 2026-12-31 is 2026-10-02, so the 10-01 point drops out.
    const s = summarize(all, ninety, "2026-12-31");
    expect(s.history.map((p) => p.value)).toEqual([115]);
    expect(s.change).toBe(0);
    expect(summarize(all, ninety, "2025-07-01").prs.map((p) => p.value)).toEqual([120]);
  });

  it("narrows to a custom window, judging PRs against all time", () => {
    const s = summarizeIn(all, { from: "2025-01-01", to: "2025-12-31" });
    expect(s.history.map((p) => p.value)).toEqual([100, 120]);
    expect(s.change).toBe(20);
    expect(s.prs.map((p) => p.value)).toEqual([100, 120]);
    expect(s.best).toBe(all[1]);
    expect(s.lastSession).toBe(all[3]);
  });

  it("summarizes an empty history", () => {
    expect(summarize([], rangeById("all"), "2026-11-14")).toEqual({
      history: [],
      prs: [],
      current: undefined,
      change: null,
      best: undefined,
      lastSession: undefined,
    });
  });

  it("returns an empty history for a range with no points", () => {
    const s = summarize(all, ninety, "2027-06-01");
    expect(s.history).toEqual([]);
    expect(s.current).toBeUndefined();
    expect(s.change).toBeNull();
    expect(s.lastSession).toBe(all[3]);
  });
});

describe("bestSet", () => {
  const w = workout("w9", "2026-03-02", [
    [
      "bench",
      [
        { weight_kg: 120, reps: 1, type: "warmup" },
        { weight_kg: 100, reps: 5 },
        { weight_kg: 90, reps: 10 },
      ],
    ],
  ]);

  it("picks a workout's top working set by the exercise's measure", () => {
    expect(bestSet(w.exercises[0].sets, "e1rm", "2026-03-02", "w9")).toMatchObject({ value: 120, weightKg: 90, reps: 10 });
    expect(bestSet(w.exercises[0].sets, "weight", "2026-03-02", "w9")).toMatchObject({ value: 100, reps: 5 });
  });

  it("returns undefined when no working set has the measure", () => {
    expect(bestSet(w.exercises[0].sets, "duration", "2026-03-02", "w9")).toBeUndefined();
  });
});

describe("longBreaks", () => {
  const at = (...dates: string[]) => dates.map((date) => ({ date }));

  it("finds gaps longer than 28 days between sessions, oldest first", () => {
    expect(longBreaks(at("2026-01-01", "2026-01-20", "2026-04-01"))).toEqual([{ from: "2026-01-20", to: "2026-04-01", days: 71 }]);
  });

  it("doesn't count a gap of exactly 28 days", () => {
    expect(longBreaks(at("2026-01-01", "2026-01-29"))).toEqual([]);
    expect(longBreaks(at("2026-01-01", "2026-01-30"))).toEqual([{ from: "2026-01-01", to: "2026-01-30", days: 29 }]);
  });

  it("takes a custom gap and handles short histories", () => {
    expect(longBreaks(at("2026-01-01", "2026-01-10"), 7)).toEqual([{ from: "2026-01-01", to: "2026-01-10", days: 9 }]);
    expect(longBreaks([])).toEqual([]);
    expect(longBreaks(at("2026-01-01"))).toEqual([]);
  });
});
