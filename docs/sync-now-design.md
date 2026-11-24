# Sync now (MCP tool): design

**Status:** implemented in PR #18, merged 2026-11-23. Proposed 2026-11-22.
**Scope:** one PR. Builds the "sync now" item under Future enhancements in `docs/mcp-server-design.md`.
Choices are the author's unless marked as the owner's.

## Why

"I wanted to check this morning's workout this afternoon" *(owner)*. The data is refreshed overnight (Kingdom Keys runs `npm run sync` on a schedule), so by the afternoon the MCP server's answers stop at last night and leave out the morning's workout. Running the sync means leaving the conversation for a terminal. With this tool, Claude can pull the latest workouts itself and then answer.

## How it works today

- `scripts/sync-hevy.ts` runs on import. It reads `HEVY_API_KEY` from the environment and decides between a full and an incremental sync (`scripts/sync-mode.ts`). Next it pages through `/v1/workouts/events` (or `/v1/workouts` for a full sync) and `/v1/exercise_templates` (776 templates, 8 requests), applies the events (`scripts/apply-events.ts`), and writes `data/hevy.json` atomically (`scripts/write-dataset.ts`). It prints a progress line and a summary to stdout.
- Failures map to exit codes in `scripts/exitCodes.ts`. Kingdom Keys reads only the exit code, so those values are a contract.
- 429s are retried per `scripts/retry.ts`: at most 5 retries, and the sync gives up if Hevy asks for a wait over 60 s.
- The key is passed on the command line (`HEVY_API_KEY=... npm run sync`). Nothing in the repo stores it.
- The MCP server (`mcp/server.ts`) reads `data/hevy.json`, or `HEVY_VIZ_DATA`. It reloads the file when its mtime changes. It makes no network calls and never reads the key; its header comment, the README and the MCP design doc all promise that. stdout is its protocol channel, so diagnostics go to stderr.

## Goals

- In a conversation, Claude can bring the data up to date with Hevy and then answer, without the owner leaving the chat.
- Claude does this on its own when a question is about something after the last sync, like "how did this morning go?" The owner doesn't have to ask for a sync, but Claude Code asks the owner before every call *(owner, 2026-11-22)*, even in auto mode or with the server approved as a whole (section 3).
- The tool says what changed, like "1 new workout since last night."
- `npm run sync` and the nightly Kingdom Keys run behave exactly as before: same exit codes, same output, same file.
- The key lives in one place that works however the server is launched (Claude Code or the desktop app), and `npm run sync` can use it too.

## Non-goals

- A full re-download from chat. That stays `npm run sync -- --full` in a terminal.
- Syncing routines, body measurements or anything else Hevy holds.
- Background or scheduled syncing inside the server.
- Any change to the dashboard.

## Anti-goals

- The API key showing up anywhere it could leak: a tool result, an error message, stderr, a log, or a commit.
- Anything written to the server's stdout other than protocol messages.
- The six existing tools gaining network access or reading the key.
- A change that breaks Kingdom Keys, such as a changed exit code or a sync that fails where it used to succeed.
- A failed sync from chat that damages `data/hevy.json` or leaves the server serving half-updated data.

## Approaches

### Running the sync (owner picked 2)

1. **Run `npm run sync` as a child process.** The tool would start the script, wait for it, and read its exit code and last output line. It barely touches the script, but it reads counts out of printed text (or needs a `--json` flag), starts a new process for every call, and always writes `data/hevy.json` even when the server reads another file.
2. **Move the sync into a function that both callers share (picked).** A `runSync()` returns the counts as data and reports progress through a callback. `npm run sync` becomes a thin command-line wrapper that prints what it prints today. The server calls the function directly. The counts come back typed, it can be tested without the network, and it writes the file the server actually reads. The cost is refactoring a script Kingdom Keys depends on; tests pin its exit codes and output.

### Where the key comes from (owner picked B)

- **A. The shell environment**, passed through `.mcp.json` as `${HEVY_API_KEY}`. Nothing new is stored, but it works only if the key is exported in the shell that starts Claude Code, and the desktop app would need the key typed into its config file.
- **B. A git-ignored `.env` file in the repo root (picked).** It works the same however the server is launched, and `npm run sync` reads it too. The cost is a plaintext key on disk, inside the repo folder only.
- **C. macOS Keychain.** The most secure option, but Mac-only, which doesn't suit the other Hevy Pro lifters named in PRODUCT.md.

## Design

### 1. A shared sync function

Move the body of `scripts/sync-hevy.ts` into an importable module, for example `scripts/sync.ts`, exporting `runSync`:

- **Inputs:** the API key, the data file path, the command-line flags or a `full` boolean, an `allowFull` switch (see section 3), and an `onProgress` callback for the paging and rate-limit messages. *(Author's call: the `fetch` function can also be passed in, so tests need no network.)*
- **Output:** what happened: `mode` (`incremental` or `full`), the reason for a full sync, `added`, `updated`, `deleted`, the total workout count, the previous `synced_at` and the new one.
- **Errors:** it throws the same error classes as today (`HevyHttpError`, `RateLimitError`, `SaveError`, network `TypeError`s, `UnexpectedResponseError`), so `exitCodeFor` keeps working unchanged.
- **No direct output.** It never writes to `process.stdout` or `process.stderr`; everything goes through `onProgress`.
- **Any data path.** It creates the file's folder if needed (today: `mkdir data`), so it works for whatever path it's given.

`scripts/sync-hevy.ts` stays the command-line entry point: it loads `.env` (section 2), calls `runSync` with `data/hevy.json`, prints the same progress line and summary as today from the result, and sets the same exit codes. Missing key: same message and exit code 1 as today. The summary wording moves from the sync logic into this wrapper.

### 2. The key in `.env`

- A `.env` file in the repo root holding `HEVY_API_KEY=...`. Add `.env` to `.gitignore`, and commit a `.env.example` with an empty `HEVY_API_KEY=` and a comment saying where to get the key. *(Author's call on the example file.)*
- **A variable already set in the environment wins over `.env`.** That way, anything that passes the key explicitly today, Kingdom Keys included, behaves exactly as before.
- **`npm run sync`** loads `.env` at startup if it exists. Node 22 can do this without a dependency (`process.loadEnvFile` or `util.parseEnv`). A missing `.env` is not an error.
- **The server** reads the key only when `sync_now` is called, never at startup. It uses the same rule as `npm run sync`: `HEVY_API_KEY` from its environment if set, else from `.env`. *(Author's call: one rule everywhere. Claude Code passes its environment on to servers it starts, so a key exported in the shell would win in either case.)* It resolves `.env` against the repo root rather than the working directory, because the desktop app launches the server from elsewhere. It takes only `HEVY_API_KEY` from the file and doesn't load the rest into `process.env`. *(Author's call: that keeps the key away from the other six tools, and a key added to `.env` mid-session works on the next call without a restart.)*
- **Errors about the key say where it came from** ("the HEVY_API_KEY environment variable" or ".env"), so a stale exported key isn't blamed on `.env`.

### 3. The `sync_now` tool

- **Name and arguments:** `sync_now`, no arguments.
- **Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`, `openWorldHint: true`.
- **Ask before every call** *(owner, 2026-11-22)*. The owner's global settings use auto mode, and `.claude/settings.local.json` approves the `hevy-viz` server as a whole, so without a rule the call could go through unprompted. Commit a new project `.claude/settings.json` (none exists yet) with `permissions.ask: ["mcp__hevy-viz__sync_now"]`. The builder confirms by hand that Claude Code prompts for it in auto mode, with the server approved. If an `ask` rule doesn't beat auto mode, stop and come back to the owner. This applies only in Claude Code; the desktop app has its own tool approval, and the README says so.
- **Incremental only.** It calls `runSync` with `allowFull: false`. If a full sync would be needed (no data file, the sample file, an unreadable file, or no `synced_at`), it changes nothing and returns a tool error naming the reason and saying to run `npm run sync` in the hevy-viz folder. Pointing `HEVY_VIZ_DATA` at the sample is therefore covered: it refuses instead of overwriting the sample.
- **Writes the file the server reads,** whether that's `data/hevy.json` or `HEVY_VIZ_DATA`.
- **After it succeeds,** it clears the server's loaded data so the next call reloads the file, rather than relying on the mtime changing. *(Author's call: a cheap guarantee.)*
- **One at a time.** If a call arrives while a sync is already running in this server, it waits for that sync and returns the same result instead of starting a second one. A Kingdom Keys sync running at the same moment is harmless: both write atomically, and the last rename wins with complete data.
- **Result**, as structured content like the other tools:
  `{ added, updated, deleted, workouts, previousSyncAt, syncedAt, timeZone }`, plus a one-line `summary` such as "1 new workout since Nov 21, 11:02 PM. 1,438 workouts." Counts only: Claude follows up with `recent_workouts` or another tool for the details. *(Author's call: that keeps one tool's job to syncing and the details in the tools that already format them.)*
- **Progress:** `onProgress` messages go to stderr, prefixed `hevy-viz:`, never to stdout.
- **Errors**, each one sentence Claude can relay (via `exitCodeFor`'s categories). None includes the key, request headers, or Hevy's raw response body:
  - No key: "No Hevy API key. Add HEVY_API_KEY to .env in the hevy-viz folder (see .env.example)."
  - Bad key (401/403): "Hevy rejected the API key in .env. Check it under Hevy → Settings → Developer."
  - Rate-limited: "Hevy is rate-limiting requests; try again in a few minutes."
  - Offline: "Couldn't reach Hevy. Check the internet connection."
  - Other Hevy error, unexpected response: "Hevy returned an error (HTTP <status>); nothing was changed."
  - Save failed: "Synced, but couldn't write the data file; nothing was changed."
  - *Changed 2026-11-23:* the bad-key message names where the key came from ("the HEVY_API_KEY environment variable" when it's not from `.env`). Added: "Couldn't read .env in the hevy-viz folder." (an unreadable `.env`), "Hevy returned something unexpected; nothing was changed." (a reply that isn't JSON, or isn't the shape expected), "Sync canceled; nothing was changed." and "The sync failed unexpectedly; nothing was changed." (anything else; the detail goes to stderr with the key removed).
  - *Changed 2026-11-24:* a key with a line break or NUL inside is refused before any request, here and in `npm run sync`, with "The Hevy API key in <.env | the HEVY_API_KEY environment variable> has a line break or other invalid character in it. Copy it again from Hevy → Settings → Developer." Otherwise `fetch`'s error would quote the key. A byte-order mark at the start of `.env` is ignored.
- **Rate limits:** the same retry rules as `npm run sync` (`scripts/retry.ts`). The budget is per request (up to 5 retries of up to 60 s each), and a sync makes at least 9 requests, so in a bad case a call can run for many minutes. *(Author's call: it's rare, and a separate set of rules for chat isn't worth the drift.)*
- **Cancellation:** `runSync` takes an optional `AbortSignal` and passes it to `fetch` and to the retry waits. The tool passes the signal the MCP SDK gives each call, so if the client cancels or times out, the sync stops and writes nothing. Once the write has started, it finishes. *(Author's call: otherwise Claude reports a failure while the server quietly writes the file afterward.)* The command-line wrapper passes no signal and behaves as today.

### 4. When Claude calls it

- **`sync_now`'s description:** it pulls new, edited and deleted workouts from Hevy. Call it when the user asks about something that may be after `context.syncedAt` (today's workout, "this morning", "just now") or asks to sync. Don't call it on every question. One call is enough per conversation unless the user says they've logged something since.
- **The other six tools' shared freshness sentence** (`describe()` in `mcp/server.ts`) changes from "Mention the sync date if it's more than a few days old" to say that if the question is about workouts after `context.syncedAt`, Claude should call `sync_now` first, and otherwise mention the sync date when it's more than a few days old.
- *Changed 2026-11-24:* both descriptions now say not to call `sync_now` when `context.source` is `"sample"`, since it would only ask permission and then refuse.

### 5. Docs

- `mcp/server.ts` header comment: the server reads data locally; only `sync_now` uses the network and the key.
- README, "Use your own data": put the key in `.env` (copy `.env.example`) and run `npm run sync`; the command-line form still works.
- README, "Ask Claude about your training": add `sync_now` to the table. Under "Good to know", Freshness says Claude can sync mid-conversation. Replace "Read-only" with: it never changes anything in Hevy; only `sync_now` reads the key (from `.env`) and talks to Hevy, and only to fetch your workouts. Privacy: the server makes network calls only to Hevy, only through `sync_now`.
- README: setup step 1 mentions `.env`. The desktop app needs nothing extra, since the server finds `.env` itself.
- README: Claude Code asks before each sync (the committed `.claude/settings.json` rule). In the desktop app, approval follows that app's own tool settings.
- `docs/mcp-server-design.md`: change the status line to implemented (it still says "nothing is built yet"), and add a dated note under the "sync now" enhancement pointing here.

### 6. Tests

- **`runSync`** with a fake `fetch`: incremental with new, edited and deleted workouts; no changes; a full sync when allowed; refusal with the reason when `allowFull` is false; 429 then success; 401 throws `HevyHttpError`; a failed write throws `SaveError` and leaves the old file; progress goes only through `onProgress`.
- **The command-line wrapper:** exit codes unchanged for each failure class (extend the existing `exitCodes` tests if that's enough); `.env` is loaded; an environment variable wins over `.env`; a missing `.env` is fine.
- **The server's `sync_now`:** no key; key from `.env` resolved against the repo root; refusal when a full sync would be needed, including the sample file; success clears the loaded data so the next tool call sees the new workout; two calls at once run one sync; a canceled call writes nothing; an environment key wins over `.env` and the error names its source; no error message contains the key; nothing is written to stdout. The server tests copy the developer's environment into the child process (`mcp/server.test.ts`), so they must clear `HEVY_API_KEY` there.
- **The six existing tools** still never read `.env` or the environment for the key (for example, they work with no `.env` and no key).
- **By hand, in Claude Code:** with auto mode on and the server approved, asking about today's workout brings up a permission prompt for `sync_now`; declining it leaves the data file untouched.
- House rules as before: `npm test`, `npm run lint`, `npm run build` and `npm run test:e2e` pass.

## Left to the builder

- Module and function names, and the exact shape of `runSync`'s options and result.
- Whether to use `process.loadEnvFile` or `util.parseEnv`, as long as the environment wins over `.env`.
- The exact wording of tool descriptions, summaries and errors, within section 3's rules.
- Commit boundaries. A natural order: extract `runSync` with the wrapper unchanged in behavior, then `.env`, then the tool, then docs.
