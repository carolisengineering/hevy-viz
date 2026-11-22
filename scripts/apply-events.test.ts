import { describe, expect, it } from "vitest";
import type { HevyWorkout } from "../src/core/types.ts";
import { applyEvents, eventsOf, fromFullSync, toWorkoutEvent, type WorkoutEvent } from "./apply-events.ts";
import { UnexpectedResponseError } from "./exitCodes.ts";

const T = Date.parse("2026-11-20T12:00:00Z");
const at = (minutes: number) => new Date(T + minutes * 60_000).toISOString();

// created_at defaults to start_time, so a workout logged live sorts by when it happened.
function workout(id: string, start_time: string, updated_at: string, title = id, created_at = start_time): HevyWorkout {
  return { id, title, start_time, end_time: start_time, created_at, updated_at, exercises: [] };
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

  it("doesn't count an update whose updated_at is unchanged, but still replaces it", () => {
    const same = workout("a", a.start_time, at(0), "Resent");
    const result = applyEvents([a], [updated(same)]);
    expect(result).toMatchObject({ added: 0, updated: 0, deleted: 0 });
    expect(result.workouts.map((w) => w.title)).toEqual(["Resent"]);
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

  it("sorts newest first by created_at", () => {
    const old = workout("old", "2026-10-01T10:00:00Z", at(0));
    const mid = workout("mid", "2026-11-01T11:00:00Z", at(0));
    expect(ids(applyEvents([a, old], [updated(b), updated(mid)]).workouts)).toEqual(["b", "mid", "a", "old"]);
    // Logged after the fact: started earlier than "a" but created later, so it sorts first.
    const late = workout("late", "2026-09-01T10:00:00Z", at(0), "late", "2026-11-05T10:00:00Z");
    expect(ids(applyEvents([a], [updated(late)]).workouts)).toEqual(["late", "a"]);
  });

  it("sorts a workout with a missing or unreadable created_at last", () => {
    const missing = { ...workout("missing", "2026-11-03T10:00:00Z", at(0)), created_at: undefined };
    const bad = workout("bad", "2026-11-04T10:00:00Z", at(0), "bad", "garbage");
    expect(ids(applyEvents([a], [updated(bad), updated(missing), updated(b)]).workouts)).toEqual(["b", "a", "bad", "missing"]);
  });
});

describe("toWorkoutEvent", () => {
  it("accepts an updated event", () => {
    const raw = { type: "updated", workout: a };
    expect(toWorkoutEvent(raw)).toEqual({ type: "updated", workout: a });
  });

  it("accepts a deleted event", () => {
    const raw = { type: "deleted", id: "a", deleted_at: at(3) };
    expect(toWorkoutEvent(raw)).toEqual({ type: "deleted", id: "a", deleted_at: at(3) });
  });

  it("rejects an unknown type, naming the type and keys", () => {
    expect(() => toWorkoutEvent({ type: "moved", id: "a" })).toThrow(UnexpectedResponseError);
    expect(() => toWorkoutEvent({ type: "moved", id: "a" })).toThrow(/moved.*type, id/);
  });

  it("rejects an updated event without a workout object", () => {
    expect(() => toWorkoutEvent({ type: "updated" })).toThrow(UnexpectedResponseError);
    expect(() => toWorkoutEvent({ type: "updated", workout: "a" })).toThrow(UnexpectedResponseError);
    expect(() => toWorkoutEvent({ type: "updated", workout: null })).toThrow(UnexpectedResponseError);
  });

  it("rejects an updated event whose workout has no string id", () => {
    expect(() => toWorkoutEvent({ type: "updated", workout: { title: "x" } })).toThrow(UnexpectedResponseError);
    expect(() => toWorkoutEvent({ type: "updated", workout: { id: 7 } })).toThrow(UnexpectedResponseError);
  });

  it("rejects a deleted event without a string id", () => {
    expect(() => toWorkoutEvent({ type: "deleted", deleted_at: at(1) })).toThrow(UnexpectedResponseError);
    expect(() => toWorkoutEvent({ type: "deleted", id: 7, deleted_at: at(1) })).toThrow(UnexpectedResponseError);
  });

  it("rejects a deleted event without a readable deleted_at", () => {
    for (const deleted_at of [undefined, 5, null, "garbage", ""]) {
      expect(() => toWorkoutEvent({ type: "deleted", id: "a", deleted_at })).toThrow(UnexpectedResponseError);
    }
    expect(() => toWorkoutEvent({ type: "deleted", id: "a" })).toThrow(/deleted.*type, id/);
  });

  it("rejects things that are not objects", () => {
    for (const raw of [null, undefined, "updated", 5, []]) expect(() => toWorkoutEvent(raw)).toThrow(UnexpectedResponseError);
  });

  it("never puts workout contents in the message", () => {
    const secret = { type: "updated", workout: { title: "Private notes", id: 7 } };
    expect(() => toWorkoutEvent(secret)).toThrow(/updated.*type, workout/);
    expect(() => toWorkoutEvent(secret)).not.toThrow(/Private notes/);
  });
});

describe("eventsOf", () => {
  it("returns the events array", () => expect(eventsOf({ page_count: 1, events: [1, 2] })).toEqual([1, 2]));
  it("treats missing events with no pages as none", () => expect(eventsOf({ page_count: 0 })).toEqual([]));
  it("throws when events is missing but there are pages", () => {
    expect(() => eventsOf({ page_count: 2 })).toThrow(UnexpectedResponseError);
    expect(() => eventsOf({ page_count: 2 })).toThrow(/events/);
  });
  it("throws when events is not an array", () => {
    expect(() => eventsOf({ page_count: 1, events: {} })).toThrow(UnexpectedResponseError);
    expect(() => eventsOf({ page_count: 1, events: "x" })).toThrow(/events/);
  });
});

describe("fromFullSync", () => {
  it("collapses a workout that was downloaded twice and sorts newest first", () => {
    const old = workout("old", "2026-10-01T10:00:00Z", at(0));
    const result = fromFullSync([old, a, b, { ...a, title: "again" }]);
    expect(ids(result)).toEqual(["b", "a", "old"]);
  });
});
