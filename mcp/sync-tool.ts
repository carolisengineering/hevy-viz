// The `sync_now` tool's logic: pull new, edited and deleted workouts from Hevy into the data file.
// The only place in the MCP server that reads the API key or uses the network.
import { resolveApiKey, type KeySource } from "../scripts/api-key.ts";
import { EXIT, exitCodeFor, FullSyncNeededError, HevyHttpError } from "../scripts/exitCodes.ts";
import { runSync, type SyncProgress } from "../scripts/sync.ts";
import { ToolError } from "./tools.ts";

export interface SyncNowDeps {
  file: string;
  timeZone: string;
  env: NodeJS.ProcessEnv;
  envFile: string;
  fetch?: typeof fetch;
  log: (line: string) => void; // the server passes a stderr writer
  onSynced: () => void; // the server clears its loaded data
}

export interface SyncNowResult {
  added: number;
  updated: number;
  deleted: number;
  workouts: number;
  previousSyncAt: string;
  syncedAt: string;
  timeZone: string;
  summary: string;
}

const plural = (n: number, one: string, many: string): string => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

const formatTime = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function describeProgress(p: SyncProgress): string {
  switch (p.kind) {
    case "page":
      return `hevy-viz: ${p.key} page ${p.page} of ${p.pageCount}`;
    case "pagesDone":
      return `hevy-viz: ${p.key} done`;
    case "rateLimited":
      return `hevy-viz: Hevy is rate-limiting; waiting ${Math.ceil(p.waitMs / 1000)}s (attempt ${p.attempt})`;
  }
}

function summarize(r: { added: number; updated: number; deleted: number; workouts: number }, since: string, timeZone: string): string {
  const changes = [
    r.added > 0 ? plural(r.added, "new workout", "new workouts") : null,
    r.updated > 0 ? `${r.updated.toLocaleString("en-US")} edited` : null,
    r.deleted > 0 ? `${r.deleted.toLocaleString("en-US")} deleted` : null,
  ].filter((part): part is string => part !== null);
  const head = changes.length > 0 ? changes.join(", ") : "No workout changes";
  return `${head} since ${formatTime(since, timeZone)}. ${plural(r.workouts, "workout", "workouts")}.`;
}

/** `text` with the key, and the forms fetch may quote it in (trimmed; outer HTTP whitespace stripped), replaced by [redacted]. */
function redact(text: string, key: string): string {
  const forms = new Set([key, key.trim(), key.replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "")]);
  return [...forms]
    .filter((form) => form.length > 0)
    .toSorted((a, b) => b.length - a.length)
    .reduce((out, form) => out.split(form).join("[redacted]"), text);
}

const isAbort = (error: unknown, signal?: AbortSignal): boolean =>
  signal?.aborted === true || (error !== null && typeof error === "object" && (error as { name?: unknown }).name === "AbortError");

/** The ToolError for a failed sync, or null when the error isn't one we know. */
function toToolError(error: unknown, source: KeySource | undefined, signal?: AbortSignal): ToolError | null {
  if (isAbort(error, signal)) return new ToolError("Sync canceled; nothing was changed.");
  if (error instanceof FullSyncNeededError) {
    return new ToolError(`Can't sync from here: ${error.reason}. Run \`npm run sync\` in the hevy-viz folder.`);
  }
  // A 200 whose body isn't JSON.
  if (error instanceof SyntaxError) return new ToolError("Hevy returned something unexpected; nothing was changed.");
  switch (exitCodeFor(error)) {
    case EXIT.badKey: {
      const where = source === "environment" ? "the HEVY_API_KEY environment variable" : ".env";
      return new ToolError(`Hevy rejected the API key in ${where}. Check it under Hevy → Settings → Developer.`);
    }
    case EXIT.rateLimited:
      return new ToolError("Hevy is rate-limiting requests; try again in a few minutes.");
    case EXIT.offline:
      return new ToolError("Couldn't reach Hevy. Check the internet connection.");
    case EXIT.hevyError:
      return new ToolError(error instanceof HevyHttpError ? `Hevy returned an error (HTTP ${error.status}); nothing was changed.` : "Hevy returned something unexpected; nothing was changed.");
    case EXIT.saveFailed:
      return new ToolError("Synced, but couldn't write the data file; nothing was changed.");
    default:
      return null;
  }
}

/** Returns the function the tool calls; concurrent calls share one in-flight sync. Throws ToolError with fixed wording. */
export function makeSyncNow(deps: SyncNowDeps): (signal?: AbortSignal) => Promise<SyncNowResult> {
  let inFlight: Promise<SyncNowResult> | undefined;

  async function sync(signal?: AbortSignal): Promise<SyncNowResult> {
    let key: ReturnType<typeof resolveApiKey>;
    try {
      key = resolveApiKey(deps.env, deps.envFile);
    } catch (error) {
      // The raw error carries the absolute path to .env, so the tool result gets fixed copy and the log gets only the code.
      const code = (error as NodeJS.ErrnoException).code;
      deps.log(`hevy-viz: couldn't read .env (${typeof code === "string" ? code : "unknown error"})`);
      throw new ToolError("Couldn't read .env in the hevy-viz folder.");
    }
    if (!key) throw new ToolError("No Hevy API key. Add HEVY_API_KEY to .env in the hevy-viz folder (see .env.example).");
    try {
      const r = await runSync({
        apiKey: key.key,
        file: deps.file,
        allowFull: false,
        fetch: deps.fetch,
        signal,
        onProgress: (p) => deps.log(describeProgress(p)),
      });
      deps.onSynced();
      const previousSyncAt = r.previousSyncAt ?? r.syncedAt;
      return {
        added: r.added,
        updated: r.updated,
        deleted: r.deleted,
        workouts: r.workouts,
        previousSyncAt,
        syncedAt: r.syncedAt,
        timeZone: deps.timeZone,
        summary: summarize(r, previousSyncAt, deps.timeZone),
      };
    } catch (error) {
      const known = toToolError(error, key.source, signal);
      if (known) throw known;
      // Unknown errors can carry the key (a bad header value) or Hevy's raw body, so the tool result gets fixed copy.
      const detail = error instanceof Error ? error.message : String(error);
      deps.log(`hevy-viz: sync failed: ${redact(detail, key.key)}`);
      throw new ToolError("The sync failed unexpectedly; nothing was changed.");
    }
  }

  // A joining caller shares the first caller's signal.
  return (signal) => {
    inFlight ??= sync(signal).finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };
}
