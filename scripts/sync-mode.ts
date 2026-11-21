// Decides whether a sync can fetch only recent changes. Kept apart from
// sync-hevy.ts, which runs on import, so it can be tested.
import type { HevyDataset } from "../src/core/types.ts";

/** Events are requested from this long before the last sync, to cover small differences between this machine's clock and Hevy's. */
export const EVENTS_OVERLAP_MS = 10 * 60_000;

export type SyncPlan =
  | { mode: "incremental"; since: string; saved: HevyDataset }
  | { mode: "full"; reason: string };

const full = (reason: string): SyncPlan => ({ mode: "full", reason });
const UNREADABLE = "saved data can't be read";

/** `savedText` is the contents of data/hevy.json, or null when the file doesn't exist. */
export function planSync(savedText: string | null, args: string[], now = Date.now()): SyncPlan {
  if (args.includes("--full")) return full("--full");
  if (savedText === null) return full("no saved data");

  let parsed: unknown;
  try {
    parsed = JSON.parse(savedText);
  } catch {
    return full(UNREADABLE);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return full(UNREADABLE);
  const saved = parsed as HevyDataset;
  if (!Array.isArray(saved.workouts) || !Array.isArray(saved.exercise_templates)) return full(UNREADABLE);

  if (saved.source === "sample") return full("saved data is the sample");
  if (saved.source !== "hevy") return full(UNREADABLE);

  const syncedAt = typeof saved.synced_at === "string" ? Date.parse(saved.synced_at) : NaN;
  if (Number.isNaN(syncedAt)) return full("saved data has no sync time");
  if (syncedAt > now) return full("saved sync time is in the future");

  return { mode: "incremental", since: new Date(syncedAt - EVENTS_OVERLAP_MS).toISOString(), saved };
}
