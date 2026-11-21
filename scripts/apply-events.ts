// Merges Hevy workout events into saved workouts. Kept apart from sync-hevy.ts,
// which runs on import, so it can be tested.
import type { HevyWorkout } from "../src/core/types.ts";
import { UnexpectedResponseError } from "./exitCodes.ts";

export type WorkoutEvent =
  | { type: "updated"; workout: HevyWorkout }
  | { type: "deleted"; id: string; deleted_at: string };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * Checks one raw event from `/workouts/events`. Throws before anything is
 * written when it isn't one we understand. The message names the type and
 * keys only, never workout contents.
 */
export function toWorkoutEvent(raw: unknown): WorkoutEvent {
  if (isObject(raw)) {
    if (raw.type === "updated" && isObject(raw.workout) && typeof raw.workout.id === "string") {
      return { type: "updated", workout: raw.workout as unknown as HevyWorkout };
    }
    if (raw.type === "deleted" && typeof raw.id === "string") {
      // Hevy's deleted shape is unconfirmed; a missing deleted_at becomes "", which reads as an unknown time.
      return { type: "deleted", id: raw.id, deleted_at: typeof raw.deleted_at === "string" ? raw.deleted_at : "" };
    }
  }
  const type = isObject(raw) && typeof raw.type === "string" ? JSON.stringify(raw.type) : "none";
  const keys = isObject(raw) ? Object.keys(raw).join(", ") : typeof raw;
  throw new UnexpectedResponseError(`Unexpected workout event (type: ${type}; keys: ${keys})`);
}

/** The `events` of one `/workouts/events` page. A changed response shape throws rather than reading as "no events". */
export function eventsOf(body: { page_count: number; events?: unknown }): unknown[] {
  if (Array.isArray(body.events)) return body.events;
  if (body.events === undefined && !(body.page_count > 0)) return [];
  throw new UnexpectedResponseError(`Unexpected /workouts/events response ("events" is ${body.events === undefined ? "missing" : "not an array"})`);
}

export interface ApplyResult {
  workouts: HevyWorkout[];
  added: number;
  updated: number;
  deleted: number;
}

const eventId = (e: WorkoutEvent) => (e.type === "updated" ? e.workout.id : e.id);

/** Milliseconds since the epoch, or NaN when missing or unreadable. */
function eventTime(e: WorkoutEvent): number {
  const text = e.type === "updated" ? e.workout.updated_at : e.deleted_at;
  return text === undefined ? NaN : Date.parse(text);
}

/** True when `candidate` should replace `current`: newer, or equal and later in the list. */
function supersedes(candidate: WorkoutEvent, current: WorkoutEvent): boolean {
  const c = eventTime(candidate);
  const p = eventTime(current);
  if (Number.isNaN(c)) return Number.isNaN(p);
  return Number.isNaN(p) || c >= p;
}

/** Newest created_at first (the order Hevy's full sync returns); a missing or unreadable one last; ties by id. */
function byCreatedDescending(x: HevyWorkout, y: HevyWorkout): number {
  const tx = Date.parse(x.created_at ?? "");
  const ty = Date.parse(y.created_at ?? "");
  if (Number.isNaN(tx) !== Number.isNaN(ty)) return Number.isNaN(tx) ? 1 : -1;
  if (!Number.isNaN(tx) && tx !== ty) return ty - tx;
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
}

/**
 * Applies events to the saved workouts. Only the latest event per workout id
 * counts, so the result doesn't depend on event order and applying the same
 * events twice changes nothing. Counts are net per id.
 */
export function applyEvents(saved: HevyWorkout[], events: WorkoutEvent[]): ApplyResult {
  const finalEvents = new Map<string, WorkoutEvent>();
  for (const event of events) {
    const current = finalEvents.get(eventId(event));
    if (!current || supersedes(event, current)) finalEvents.set(eventId(event), event);
  }

  const byId = new Map(saved.map((w) => [w.id, w]));
  let added = 0;
  let updated = 0;
  let deleted = 0;
  for (const [id, event] of finalEvents) {
    const wasSaved = byId.has(id);
    if (event.type === "updated") {
      byId.set(id, event.workout);
      if (wasSaved) updated++;
      else added++;
    } else if (wasSaved) {
      byId.delete(id);
      deleted++;
    }
  }

  return { workouts: [...byId.values()].sort(byCreatedDescending), added, updated, deleted };
}
