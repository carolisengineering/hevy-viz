// Merges Hevy workout events into saved workouts. Kept apart from sync-hevy.ts,
// which runs on import, so it can be tested.
import type { HevyWorkout } from "../src/core/types.ts";

export type WorkoutEvent =
  | { type: "updated"; workout: HevyWorkout }
  | { type: "deleted"; id: string; deleted_at: string };

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

/** Newest start_time first; an unreadable one last; ties by id. */
function byStartDescending(x: HevyWorkout, y: HevyWorkout): number {
  const tx = Date.parse(x.start_time);
  const ty = Date.parse(y.start_time);
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

  return { workouts: [...byId.values()].sort(byStartDescending), added, updated, deleted };
}
