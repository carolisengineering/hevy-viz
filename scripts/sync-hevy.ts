// Pulls your Hevy history into data/hevy.json (git-ignored, never built into dist/).
// The first sync downloads everything; later ones fetch only what changed.
// Usage: npm run sync                           (add `-- --full` to download everything again)
// The key is a Hevy Pro developer key (https://hevy.com/settings?developer), read from HEVY_API_KEY
// in the environment, else from a git-ignored .env in the repo root.
import { MalformedKeyError, resolveApiKey, REPO_ENV_FILE, type ApiKey } from "./api-key.ts";
import { exitCodeFor } from "./exitCodes.ts";
import { MAX_RETRIES } from "./retry.ts";
import { runSync, type SyncProgress, type SyncResult } from "./sync.ts";

const DATA_FILE = "data/hevy.json";
const count = (n: number) => n.toLocaleString("en-US");
let resolved: ApiKey | null;
try {
  resolved = resolveApiKey(process.env, REPO_ENV_FILE);
} catch (error) {
  if (!(error instanceof MalformedKeyError)) throw error;
  // Only the message: the key must not reach the terminal.
  console.error(error.message);
  process.exit(1);
}
if (!resolved) {
  console.error("Set HEVY_API_KEY (Hevy Pro → Settings → Developer).");
  process.exit(1);
}

function onProgress(p: SyncProgress): void {
  if (p.kind === "page") process.stdout.write(p.pageCount > 0 ? `\r${p.key}: page ${p.page}/${p.pageCount}` : `\r${p.key}: none`);
  else if (p.kind === "pagesDone") process.stdout.write("\n");
  // Leading newline: don't overwrite the pagination progress line.
  else console.warn(`\nRate-limited on ${p.path}; retrying in ${Math.ceil(p.waitMs / 1000)} s (retry ${p.attempt}/${MAX_RETRIES}).`);
}

function summarize(r: SyncResult): string {
  if (r.mode === "full") return `Full sync (${r.reason}). Saved ${count(r.workouts)} workouts`;
  const time = new Date(r.previousSyncAt!).toLocaleString();
  return r.added + r.updated + r.deleted > 0
    ? `Synced since ${time}: ${count(r.added)} new, ${count(r.updated)} updated, ${count(r.deleted)} deleted. ${count(r.workouts)} workouts`
    : `No workout changes since ${time}. ${count(r.workouts)} workouts`;
}

// Kingdom Keys reads the exit code to say why a sync failed (see exitCodes.ts).
try {
  // Outside public/ so `npm run build` never ships personal data; vite.config.ts serves it in dev.
  const result = await runSync({ apiKey: resolved.key, file: DATA_FILE, full: process.argv.slice(2).includes("--full"), onProgress });
  console.log(`${summarize(result)} → ${DATA_FILE}`);
} catch (error) {
  console.error(error);
  // Not process.exit: it can cut off stderr when that is a pipe. Let the process end on its own.
  process.exitCode = exitCodeFor(error);
}
