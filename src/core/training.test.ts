import { describe, expect, it } from "vitest";
import { rangeById, windowFor } from "./ranges";
import { dataset, template, workout, type SetFields } from "./testkit";
import { buildTraining, latestEntries, mainLiftsIn } from "./training";

const lift = (id: string, sessions: number, sets: SetFields[] = [{ weight_kg: 100, reps: 5 }]) =>
  Array.from({ length: sessions }, (_, i) => workout(`${id}-${i}`, `2026-10-${String(i + 1).padStart(2, "0")}`, [[id, sets]]));

describe("buildTraining", () => {
  const data = dataset(
    [
      ...lift("squat", 5),
      ...lift("bench", 3),
      ...lift("arow", 3),
      ...lift("plank", 9, [{ duration_seconds: 60 }]),
      ...["a", "b", "c", "d", "e"].flatMap((id) => lift(`lift-${id}`, 2)),
    ],
    [template("plank", "duration", "abdominals")],
  );
  const training = buildTraining(data, "UTC");

  it("lists exercises by sessions, then title", () => {
    expect(training.exercises.slice(0, 4).map((e) => e.templateId)).toEqual(["plank", "squat", "arow", "bench"]);
  });

  // An old favorite: 20 sessions, all in January 2025.
  const oldie = Array.from({ length: 20 }, (_, i) => workout(`old-${i}`, `2025-01-${String(i + 1).padStart(2, "0")}`, [["oldie", [{ weight_kg: 80, reps: 5 }]]]));
  const withOldie = buildTraining({ ...data, source: "sample", workouts: [...oldie, ...data.workouts] }, "UTC");
  const window = (id: "90d" | "all") => windowFor(rangeById(id), withOldie.endDay, withOldie.firstDay);

  it("takes the six estimated-1RM lifts with the most sessions in the window as main lifts", () => {
    const lifts = mainLiftsIn(withOldie, window("90d"));
    expect(lifts.map((l) => l.lift.templateId)).toEqual(["squat", "arow", "bench", "lift-a", "lift-b", "lift-c"]);
    expect(lifts.map((l) => l.sessions)).toEqual([5, 3, 3, 2, 2, 2]);
  });

  it("leaves out lifts with no sessions in the window", () => {
    expect(mainLiftsIn(withOldie, window("90d")).some((l) => l.lift.templateId === "oldie")).toBe(false);
    expect(mainLiftsIn(withOldie, window("all"))[0]).toMatchObject({ lift: { templateId: "oldie" }, sessions: 20 });
  });

  it("ends sample ranges on the last workout and counts sessions per day", () => {
    expect(buildTraining({ ...data, source: "sample" }, "UTC").endDay).toBe("2026-10-09");
    expect(training.days.get("2026-10-01")?.sessions).toBe(9);
  });

  it("knows the first workout day", () => {
    expect(training.firstDay).toBe("2026-10-01");
    expect(withOldie.firstDay).toBe("2025-01-01");
  });

  it("starts an empty dataset on its end day", () => {
    const empty = buildTraining(dataset([], []), "UTC");
    expect(empty.firstDay).toBe(empty.endDay);
  });
});

describe("latestEntries", () => {
  const data = dataset(
    [
      workout("first", "2026-10-01", [["bench", [{ weight_kg: 100, reps: 5 }]]]),
      workout("high-reps", "2026-10-03", [["bench", [{ weight_kg: 60, reps: 15 }]]]),
      workout("middle", "2026-10-02", [["bench", [{ weight_kg: 90, reps: 5 }]]]),
    ],
    [template("bench", "weight_reps", "chest")],
  );
  const training = buildTraining(data, "UTC");
  const entries = latestEntries(training, 2, "UTC");

  it("returns the most recent workouts, newest first", () => {
    expect(entries.map((e) => e.workout.id)).toEqual(["high-reps", "middle"]);
    expect(entries.map((e) => e.day)).toEqual(["2026-10-03", "2026-10-02"]);
  });

  it("logs a set that can't be estimated by its weight, without a record", () => {
    expect(entries[0].sets[0]).toMatchObject({ exercise: { templateId: "bench" }, top: { value: 60 }, record: false });
  });

  it("keeps only workouts in a window, when given one", () => {
    expect(latestEntries(training, 5, "UTC", { from: "2026-10-01", to: "2026-10-02" }).map((e) => e.workout.id)).toEqual(["middle", "first"]);
    expect(latestEntries(training, 1, "UTC", { from: "2026-10-01", to: "2026-10-02" }).map((e) => e.workout.id)).toEqual(["middle"]);
    expect(latestEntries(training, 5, "UTC", { from: "2030-01-01", to: "2030-01-31" })).toEqual([]);
  });

  it("marks a first-ever estimated-1RM session as a record", () => {
    const [first] = latestEntries(training, 3, "UTC").slice(-1);
    expect(first.workout.id).toBe("first");
    expect(first.sets[0].record).toBe(true);
  });
});
