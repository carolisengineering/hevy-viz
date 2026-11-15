// When to retry a rate-limited (429) request. Kept apart from sync-hevy.ts,
// which runs on import, so it can be tested.

/** Retries per request before giving up. */
export const MAX_RETRIES = 5;

/** Longest wait the sync will sit through; past this it gives up with a message instead. */
export const MAX_RETRY_DELAY_MS = 60_000;

/** Retry-After is either whole seconds ("120") or an HTTP-date. */
const DELAY_SECONDS = /^\d+$/;
/** Every HTTP-date form names a day or month. Date.parse alone is too lenient: it reads "-3" as a 2001 date. */
const LOOKS_LIKE_DATE = /[a-z]/i;

/**
 * How long to wait before retry `attempt` (1-based): the server's Retry-After
 * if it's usable, else exponential backoff. Not capped, so the caller can tell
 * a long server-requested wait from a short one.
 */
export function retryDelayMs(attempt: number, retryAfter: string | null, now = Date.now()): number {
  const header = retryAfter?.trim();
  if (header) {
    if (DELAY_SECONDS.test(header)) return Number(header) * 1000;
    const until = LOOKS_LIKE_DATE.test(header) ? Date.parse(header) : NaN;
    if (Number.isFinite(until)) return Math.max(0, until - now);
  }
  return 1000 * 2 ** attempt;
}

export type RetryPlan = { retry: true; waitMs: number } | { retry: false; reason: string };

/** Whether to retry a 429 for `attempt` (1-based), and how long to wait first. */
export function planRetry(attempt: number, retryAfter: string | null, now = Date.now()): RetryPlan {
  if (attempt > MAX_RETRIES) return { retry: false, reason: `still rate-limited after ${MAX_RETRIES} retries` };
  const waitMs = retryDelayMs(attempt, retryAfter, now);
  if (waitMs > MAX_RETRY_DELAY_MS) {
    return { retry: false, reason: `Hevy asked to wait ${Math.ceil(waitMs / 1000)} s; try again later` };
  }
  return { retry: true, waitMs };
}
