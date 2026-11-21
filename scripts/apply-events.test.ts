import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../src/core/types.ts";
import { applyEvents, type WorkoutEvent } from "./apply-events.ts";

const T = Date.parse("2026-11-20T12:00:00Z");
const at = (minutes: number) => new Date(T + minutes * 60_000).toISOString();

function workout(id: string, start_time: string, updated_at: string, title = id): HevyWorkout {
  return { id, title, start_time, end_time: start_time, updated_at, exercises: [] };
}
const updated = (w: HevyWorkout): WorkoutEvent => ({ type: "updated", workout: w });
const deleted = (id: string, deleted_at: string): WorkoutEvent => ({ type: "deleted", id, deleted_at });
const ids = (ws: HevyWorkout[]) => ws.map((w) => w.id);

const a = workout("a", "2026-11-01T10:00:00Z", at(0));
const b = workout("b", "2026-11-02T10:00:00Z", at(0));

describe("applyEvents", () => {
  it("adds a new workout", () => {
    const result = applyEvents([a], [updated(b)]);
    expect(ids(result.workouts)).toEqual(["b", "a"]);
    expect(result).toMatchObject({ added: 1, updated: 0, deleted: 0 });
  });

  it("replaces an edited workout", () => {
    const result = applyEvents([workout("a", a.start_time, at(0), "Old")], [updated(workout("a", a.start_time, at(5), "New"))]);
    expect(result.workouts.map((w) => w.title)).toEqual(["New"]);
    expect(result).toMatchObject({ added: 0, updated: 1, deleted: 0 });
  });

  it("removes a deleted workout", () => {
    const result = applyEvents([a, b], [deleted("a", at(1))]);
    expect(ids(result.workouts)).toEqual(["b"]);
    expect(result).toMatchObject({ added: 0, updated: 0, deleted: 1 });
  });

  it("ignores deleting a workout that isn't saved", () => {
    const result = applyEvents([a], [deleted("z", at(1))]);
    expect(ids(result.workouts)).toEqual(["a"]);
    expect(result).toMatchObject({ added: 0, updated: 0, deleted: 0 });
  });

  it("gives the same workouts when applied twice", () => {
    const events = [updated(b), updated(workout("a", a.start_time, at(5), "New")), deleted("c", at(2))];
    const once = applyEvents([a, workout("c", "2026-11-03T10:00:00Z", at(0))], events);
    const twice = applyEvents(once.workouts, events);
    expect(twice.workouts).toEqual(once.workouts);
  });

  it("lets the latest event win whatever the order", () => {
    const update = updated(workout("a", a.start_time, at(0), "Edited"));
    const del = deleted("a", at(1));
    expect(applyEvents([a], [update, del]).workouts).toEqual([]);
    expect(applyEvents([a], [del, update]).workouts).toEqual([]);

    const earlyDel = deleted("a", at(0));
    const lateUpdate = updated(workout("a", a.start_time, at(1), "Edited"));
    for (const events of [[earlyDel, lateUpdate], [lateUpdate, earlyDel]]) {
      expect(applyEvents([a], events).workouts.map((w) => w.title)).toEqual(["Edited"]);
    }
  });

  it("counts a missing or unreadable event time as oldest", () => {
    const update = updated(workout("a", a.start_time, at(0), "Edited"));
    for (const deleted_at of ["garbage", undefined]) {
      const del = { type: "deleted", id: "a", deleted_at } as unknown as WorkoutEvent;
      for (const events of [[del, update], [update, del]]) {
        expect(applyEvents([a], events).workouts.map((w) => w.title)).toEqual(["Edited"]);
      }
    }

    const noTime = updated({ ...workout("a", a.start_time, at(0), "Edited"), updated_at: undefined });
    const del = deleted("a", at(1));
    expect(applyEvents([a], [noTime, del]).workouts).toEqual([]);
    expect(applyEvents([a], [del, noTime]).workouts).toEqual([]);
  });

  it("lets the later update win between two updates", () => {
    const early = updated(workout("a", a.start_time, at(1), "Early"));
    const late = updated(workout("a", a.start_time, at(2), "Late"));
    for (const events of [[early, late], [late, early]]) {
      expect(applyEvents([a], events).workouts.map((w) => w.title)).toEqual(["Late"]);
    }

    const first = updated(workout("a", a.start_time, at(3), "First"));
    const second = updated(workout("a", a.start_time, at(3), "Second"));
    expect(applyEvents([a], [first, second]).workouts.map((w) => w.title)).toEqual(["Second"]);
    expect(applyEvents([a], [second, first]).workouts.map((w) => w.title)).toEqual(["First"]);
  });

  it("sorts newest first by start_time", () => {
    const old = workout("old", "2026-10-01T10:00:00Z", at(0));
    const mid = workout("mid", "2026-11-01T11:00:00Z", at(0));
    const result = applyEvents([a, old], [updated(b), updated(mid)]);
    expect(ids(result.workouts)).toEqual(["b", "mid", "a", "old"]);
  });

  it("sorts a workout with an unreadable start_time last", () => {
    const bad = workout("bad", "garbage", at(0));
    expect(ids(applyEvents([a], [updated(bad), updated(b)]).workouts)).toEqual(["b", "a", "bad"]);
  });
});
