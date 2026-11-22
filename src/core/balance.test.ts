import { describe, expect, it } from "vitest";
import { groupVolumes, setsByPeriodAndGroup, setsPerWeekByGroup, setsPerWeekByMuscle, setsPerWeekByMuscleIn } from "./balance";
import { periodsIn, rangeById } from "./ranges";
import { dataset, template, workout, type SetFields } from "./testkit";

const sets = (n: number, type: SetFields["type"] = "normal"): SetFields[] => Array.from({ length: n }, () => ({ weight_kg: 50, reps: 8, type }));

const data = dataset(
  [
    workout("old", "2025-01-01", [["squat", sets(100)]]),
    workout("w", "2026-10-01", [
      ["squat", sets(30)],
      ["bench", sets(20)],
      ["row", sets(20)],
      ["press", sets(12)],
      ["curl", sets(14)],
      ["crunch", sets(2)],
    ]),
    workout("warmup", "2026-10-02", [["squat", sets(5, "warmup")]]),
  ],
  [
    template("squat", "weight_reps", "quadriceps"),
    template("bench", "weight_reps", "chest"),
    template("row", "weight_reps", "upper_back"),
    template("press", "weight_reps", "shoulders"),
    template("curl", "weight_reps", "biceps"),
    template("crunch", "reps_only", "abdominals"),
  ],
);
const tz = "America/Los_Angeles";
const end = "2026-11-14";

describe("setsPerWeekByGroup", () => {
  const groups = setsPerWeekByGroup(data, tz, rangeById("90d"), end);

  it("returns the six main groups in order, in working sets per week", () => {
    expect(groups.map((g) => g.group)).toEqual(["Legs", "Back", "Chest", "Shoulders", "Arms", "Core"]);
    expect(groups[0].setsPerWeek).toBeCloseTo(30 / (90 / 7));
  });

  it("flags groups under half the median as light", () => {
    expect(groups.filter((g) => g.light).map((g) => g.group)).toEqual(["Core"]);
  });
});

describe("setsPerWeekByMuscle", () => {
  it("orders muscles busiest first", () => {
    const muscles = setsPerWeekByMuscle(data, tz, rangeById("90d"), end);
    expect(muscles.map((m) => m.muscle)).toEqual(["quadriceps", "chest", "upper_back", "biceps", "shoulders", "abdominals"]);
  });

  it("averages all time over the weeks since the first workout", () => {
    const quads = setsPerWeekByMuscle(data, tz, rangeById("all"), end).find((m) => m.muscle === "quadriceps")!;
    const weeks = (Date.parse("2026-11-14") - Date.parse("2025-01-01")) / (7 * 86_400_000);
    expect(quads.setsPerWeek).toBeCloseTo(130 / weeks);
  });
});

describe("setsPerWeekByMuscleIn", () => {
  it("averages a custom window over its own length in weeks", () => {
    const muscles = setsPerWeekByMuscleIn(data, tz, { from: "2026-09-27", to: "2026-10-11" });
    expect(muscles.find((m) => m.muscle === "quadriceps")!.setsPerWeek).toBeCloseTo(30 / 2);
  });

  it("counts at least one week for a short window", () => {
    const muscles = setsPerWeekByMuscleIn(data, tz, { from: "2026-10-01", to: "2026-10-01" });
    expect(muscles.find((m) => m.muscle === "quadriceps")!.setsPerWeek).toBe(30);
  });
});

describe("groupVolumes", () => {
  it("derives the groups from muscle volumes already computed", () => {
    const muscles = setsPerWeekByMuscle(data, tz, rangeById("90d"), end);
    expect(groupVolumes(muscles)).toEqual(setsPerWeekByGroup(data, tz, rangeById("90d"), end));
  });
});

describe("setsByPeriodAndGroup", () => {
  const templates = [
    template("squat", "weight_reps", "quadriceps"),
    template("bench", "weight_reps", "chest"),
    template("pulldown", "weight_reps", "lats"),
    template("pushdown", "weight_reps", "triceps"),
    template("crunch", "reps_only", "abdominals"),
    template("burpee", "reps_only", "full_body"),
    template("run", "duration", "cardio"),
  ];
  const zeros = [0, 0, 0, 0, 0, 0];

  it("returns every week in the window, empty ones as zeros", () => {
    const d = dataset([workout("a", "2026-11-03", [["squat", sets(4)]])], templates);
    const periods = setsByPeriodAndGroup(d, "UTC", { from: "2026-10-26", to: "2026-11-15" }, "week");
    expect(periods).toEqual([
      { start: "2026-10-26", sets: zeros },
      { start: "2026-11-02", sets: [4, 0, 0, 0, 0, 0] },
      { start: "2026-11-09", sets: zeros },
    ]);
  });

  it("puts each muscle in its group, in MAIN_GROUPS order", () => {
    const d = dataset(
      [workout("a", "2026-11-03", [["bench", sets(3)], ["pulldown", sets(2)], ["pushdown", sets(5)], ["crunch", sets(1)]])],
      templates,
    );
    expect(setsByPeriodAndGroup(d, "UTC", { from: "2026-11-02", to: "2026-11-08" }, "week")[0].sets).toEqual([0, 2, 3, 0, 5, 1]);
  });

  it("counts only days inside the window", () => {
    const d = dataset([workout("mon", "2026-11-02", [["squat", sets(2)]]), workout("thu", "2026-11-05", [["squat", sets(2)]])], templates);
    expect(setsByPeriodAndGroup(d, "UTC", { from: "2026-11-04", to: "2026-11-08" }, "week")).toEqual([
      { start: "2026-11-02", sets: [2, 0, 0, 0, 0, 0] },
    ]);
  });

  it("skips warmups, full body, cardio and exercises without a template", () => {
    const d = dataset(
      [
        workout("a", "2026-11-03", [
          ["squat", [...sets(3), ...sets(2, "warmup")]],
          ["burpee", sets(4)],
          ["run", sets(1)],
          ["mystery", sets(6)],
        ]),
      ],
      templates,
    );
    expect(setsByPeriodAndGroup(d, "UTC", { from: "2026-11-02", to: "2026-11-08" }, "week")[0].sets).toEqual([3, 0, 0, 0, 0, 0]);
  });

  it("uses the local day", () => {
    // 05:30 UTC Monday Nov 9 is 21:30 Sunday Nov 8 in California.
    const late = { ...workout("a", "2026-11-09", [["squat", sets(2)]]), start_time: "2026-11-09T05:30:00Z", end_time: "2026-11-09T06:30:00Z" };
    const d = dataset([late], templates);
    const w = { from: "2026-11-02", to: "2026-11-15" };
    const legsWeek = (tz: string) => setsByPeriodAndGroup(d, tz, w, "week").find((p) => p.sets[0] > 0)?.start;
    expect(legsWeek("America/Los_Angeles")).toBe("2026-11-02");
    expect(legsWeek("UTC")).toBe("2026-11-09");
  });

  it("uses months past 104 weeks", () => {
    const d = dataset([workout("a", "2025-06-10", [["squat", sets(5)]])], templates);
    const periods = setsByPeriodAndGroup(d, "UTC", { from: "2024-01-15", to: "2026-03-10" }, "month");
    expect(periods).toHaveLength(27);
    expect(periods[0].start).toBe("2024-01-01");
    expect(periods.at(-1)!.start).toBe("2026-03-01");
    expect(periods.find((p) => p.start === "2025-06-01")!.sets[0]).toBe(5);
  });

  it("gives zeros for a window outside the data", () => {
    const w = { from: "2030-01-01", to: "2030-01-31" };
    const periods = setsByPeriodAndGroup(data, tz, w, "week");
    expect(periods).toHaveLength(periodsIn(w, "week").length);
    expect(periods.every((p) => p.sets.every((n) => n === 0))).toBe(true);
  });
});
