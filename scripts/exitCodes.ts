// Which exit code `npm run sync` ends with for each kind of failure. Kept apart
// from sync-hevy.ts, which runs on import, so it can be tested.

/**
 * Kingdom Keys runs the sync nightly, throws its output away for privacy and
 * reads only the exit code (app/gym/causes.py in that repo), so these values
 * are a contract: change them there too. They start at 20 to stay clear of
 * Node's own codes (1-14) and the shell's (126 and up). 1 stays "anything else".
 */
export const EXIT = { badKey: 20, rateLimited: 21, offline: 22, hevyError: 23, saveFailed: 24 } as const;

/** Hevy answered, but not with success. */
export class HevyHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HevyHttpError";
    this.status = status;
  }
}

/** Gave up waiting out Hevy's rate limit (429). */
export class RateLimitError extends Error {
  name = "RateLimitError";
}

/** Couldn't write data/hevy.json; the original error is the `cause`. */
export class SaveError extends Error {
  name = "SaveError";
}

/** Error codes (from Node's fetch, undici and the OS) that mean the network is down or unreachable. */
export const NETWORK_CODES: ReadonlySet<string> = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const codeOf = (e: unknown): unknown => (e as { code?: unknown } | null | undefined)?.code;

/** fetch wraps the real failure as `cause`; with several addresses to try it is an AggregateError of them. */
function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const cause = error.cause;
  const codes = cause instanceof AggregateError ? cause.errors.map(codeOf) : [codeOf(cause)];
  return codes.some((c) => typeof c === "string" && NETWORK_CODES.has(c));
}

/** The process exit code for a sync that failed with `error`. */
export function exitCodeFor(error: unknown): number {
  if (error instanceof HevyHttpError) {
    return error.status === 401 || error.status === 403 ? EXIT.badKey : EXIT.hevyError;
  }
  if (error instanceof RateLimitError) return EXIT.rateLimited;
  if (error instanceof SaveError) return EXIT.saveFailed;
  if (isNetworkFailure(error)) return EXIT.offline;
  return 1;
}
