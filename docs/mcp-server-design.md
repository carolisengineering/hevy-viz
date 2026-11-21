# MCP server: design

**Status:** proposed, 2026-11-15. Planning only; nothing is built yet.
**Owner's direction:** "write the docs with your own picks." Every choice below is the author's call unless marked as the owner's, and each can be overruled.

## Summary

A small local [MCP](https://modelcontextprotocol.io) server lets Claude (in Claude Code or the Claude desktop app) answer questions about the owner's training, such as "is my squat still going up?", "what have I neglected this month?" or "how does this year's bench compare with last year's?". It reads the synced `data/hevy.json` and computes every figure with the same `src/core` functions the dashboard uses, so an answer in chat always matches what the dashboard shows. It is read-only, runs on the owner's machine over stdio, and never calls the Hevy API.

## Why

- The dashboard answers the questions it was designed for. Questions it doesn't lay out, like comparisons across arbitrary periods or "which lifts stalled?", are easier to ask in words.
- `src/core` was kept pure from the start for exactly this reuse (README, PRODUCT.md and both earlier design docs say so).
- Letting Claude read `hevy.json` directly would not work well. The file is several MB, so Claude would compute figures ad hoc, and they would drift from the dashboard's: warmups counted, a different 1RM formula, a different day boundary.

## Goals

1. Answer the dashboard's four questions in conversation: getting stronger, training consistently, training in balance, and how any one exercise is going.
2. Support comparisons across custom date windows ("this year vs last year"), which the dashboard can't do.
3. Use identical numbers: every figure comes from `src/core`, with the same measure per exercise type, the same Epley estimate, PRs judged against all time, and local days in the owner's time zone.
4. Return small, structured answers: summaries and short lists, never raw workouts.
5. Make it easy to switch on: one command for Claude Code, and a documented config snippet for the desktop app.

## Non-goals (v1)

- Writing to Hevy: creating or editing workouts or routines.
- Live Hevy API calls, or syncing from inside the server. `npm run sync` stays the way data gets in.
- Remote hosting, HTTP transport, accounts or multiple users.
- Apple Health data. That's a separate design.
- MCP resources and prompts. Tools only.

## Anti-goals (a failure even if it technically works)

- A number in chat that disagrees with the dashboard for the same exercise, range and unit.
- Dumping large raw data into the conversation. That is slow and costly, and it sends more personal data than the question needs.
- Any network access, or the Hevy API key ever being read by the server.
- A server that silently answers from stale or sample data as though it were current.

## Constraints

- **Privacy.** The server itself is local (stdio, no network). But whatever a tool returns becomes part of the conversation and is sent to Anthropic as chat content. The README must say this plainly. The tools return only what a question needs, by design (goal 4).
- **Data stays git-ignored.** The server reads `data/hevy.json` in place and writes nothing.
- **Core purity.** No Node APIs in `src/core`. File reading, the clock and the time zone stay in the server.
- **TypeScript setup.** `tsconfig.node.json` uses `module: nodenext`, which requires file extensions on relative imports. `src/core` imports without extensions (bundler resolution, like the app). The server therefore needs its own tsconfig (bundler resolution plus Node types) so that type-checking it also checks the core it imports. It runs with `tsx`, which is already a dev dependency.
- **House rules:** American spelling, tests for every behavior, and `npm test`, `npm run lint`, `npm run build` and `npm run test:e2e` all passing.

## Approaches considered

| Approach | How it works | Trade-offs |
|---|---|---|
| **A. Thin local server over `src/core` (chosen)** | A stdio MCP server in this repo loads `data/hevy.json`, builds the training model once, and exposes a handful of tools that call core functions. | Numbers match the dashboard by construction, it's fast after a ~70 ms load, it's private, and the work is small. Answers are only as fresh as the last `npm run sync`. |
| B. Server calling the Hevy API live | Each tool fetches what it needs from Hevy, reusing the sync script's client. | Always current, but it needs the API key inside the server, runs into Hevy's rate limits (the sync already handles 429s), is slow for "all time" questions, and has to page through 1,400+ workouts per question. Better added later as an explicit "sync now" step (see Future enhancements). |
| C. No server: give Claude the file | Claude reads `data/hevy.json` with its file tools, or a pre-exported summary. | No code at all, but it breaks goal 3 and anti-goal 2: a multi-MB file, figures recomputed ad hoc, and numbers that drift from the dashboard. |
| D. A generic query server (SQLite or DuckDB MCP) over flattened data | Load workouts into a table and let Claude write SQL. | Very flexible, but the measure-per-type rules, Epley, all-time PRs and local days would all have to be reimplemented in SQL, which is exactly the drift A avoids. |

**Pick: A.** It is the only approach that guarantees chat and dashboard agree, and the core was built for it.

## Design

### Shape

```
mcp/
  server.ts        Entry point: stdio transport, tool registration, data loading and reloading
  tools.ts         Pure handlers: (training, args, context) → result. No SDK, no I/O
  tools.test.ts    Handler tests against public/data/sample.json
  server.test.ts   One end-to-end test: spawn the server, list tools, call one over stdio
  tsconfig.json    Bundler resolution plus Node types; included by the root tsconfig references
src/core/training.ts   buildTraining, mainLiftsIn (moved out of src/hooks/useTraining.ts)
```

- **Move `buildTraining` and `mainLiftsIn` into `src/core/training.ts`.** They are pure, but they live in a React hook file today. `src/hooks/useTraining.ts` keeps only the `useMemo` wrapper and `TIME_ZONE`, and re-exports nothing the app doesn't need. This is the one refactor the dashboard shares, and its existing tests move with it.
- **Formatting.** `src/format.ts` is pure and has no DOM code; it imports only a type from the chart module. The server can import `formatWeight`, `formatChange`, `formatPointSet`, `valueUnit` and `formatDuration` as they are, so text in chat reads like the dashboard ("150 × 5", "+6.5", "±0", "1:45"). The type import is fine because it is erased at runtime.

### Data, clock and time zone

- **File.** Read `data/hevy.json`, or the path in `HEVY_VIZ_DATA` if set. Run `dropUndatedWorkouts` on load, as the dashboard does. Build the training model once with `buildTraining`.
- **Reload.** Before each tool call, compare the file's modification time with the loaded one, and rebuild if it changed. That way a sync mid-conversation is picked up without restarting.
- **No synced data.** Every tool returns an error: "No synced data at data/hevy.json. Run `npm run sync` in the hevy-viz folder." It never falls back to the sample silently (anti-goal 4). For tests and demos, `HEVY_VIZ_DATA=public/data/sample.json` points it at the sample explicitly, and every answer then carries `"source": "sample"`.
- **Time zone.** `HEVY_VIZ_TZ` if set, otherwise **`America/Chicago`** (the owner's decision, 2026-11-15). The default lives in the server's code, not in `.mcp.json`, so the committed file stays free of personal values; anyone else sets `HEVY_VIZ_TZ`. This settles the cleanup doc's open question for scripts. The resolved zone appears in every result's `context`.
  - **Matching the dashboard:** the dashboard uses the browser's time zone. Chat and dashboard agree when the browser is on Chicago time. Viewed from another zone, a workout near midnight can fall on a different day, which can shift a session between ranges. The tool descriptions say which zone answers use.
- **"Today".** `rangeEndDay(data, timeZone)`: today for synced data, and the last workout day for the sample, as in the dashboard.

### Ranges

Every tool that looks at a period takes either:
- `range`: `"90d" | "1y" | "all"`, ending today, the same as the dashboard (default `"1y"`); or
- `from` and `to` (`YYYY-MM-DD`, inclusive), for custom windows. When both are present they override `range`.

This needs one small core addition: `filterBetween(points, from, to)` in `src/core/ranges.ts`, plus window variants of `summarize` and of the balance functions (`range` becomes a `{ from, to }` window inside the core, and the existing `DateRange` callers convert to it). Records stay judged against all time and are then narrowed to the window, as today.

### Tools

All tools are read-only. Each returns one JSON object as text content, plus `structuredContent` with a declared output schema where the SDK supports it. Every result includes:

```json
"context": { "source": "hevy", "syncedAt": "2026-11-15T…", "timeZone": "America/Chicago", "window": { "from": "2025-11-16", "to": "2026-11-15" }, "unit": "kg" }
```

Weights are returned in the requested `unit` (`"kg"` by default; `"lb"` gives whole pounds) as numbers, plus a `text` field using the dashboard's formatting.

*Changed 2026-11-18:* the default unit is now lb (see `docs/lb-default-and-mcp-follow-ups-design.md`).

1. **`find_exercises`** `{ query?, kind?: "weights"|"bodyweight"|"timed"|"distance", sort?: "sessions"|"recent"|"az", limit? = 20 (max 50), unit? }`
   - Returns: `[{ id, title, muscle, group, measure, sessions, lastDone, best: { value, text, date } | null }]` and `total`.
   - Search is a plain case-insensitive substring, like the dashboard.
2. **`exercise_progress`** `{ exercise, range? | from?/to?, unit? }`
   - `exercise` accepts an id or a title: an exact case-insensitive title match first, then a unique substring.
   - An ambiguous name returns an error listing up to 10 candidates, with ids.
   - Returns:
     - `measure`: the label, for example "Est. 1RM";
     - `bestEver { value, text, set, date }`;
     - `latestInWindow`;
     - `changeInWindow { value, text }`;
     - `sessionsInWindow` and `daysCharted`;
     - `prsInWindow: [{ date, value, set }]` (at most 20, the most recent kept);
     - `series`: the best value per ISO week in the window (at most 104 points; longer windows use monthly bests, and the result says which);
     - `breaks`: gaps longer than 28 days, the same rule as the chart.
3. **`main_lifts`** `{ range? | from?/to?, unit? }`
   - Returns the tracklist: `[{ rank, side, title, id, bestSetInWindow, change, latest, sessionsInWindow, prInWindow }]`, using `mainLiftsIn`.
4. **`consistency`** `{ range? | from?/to? }`
   - Returns:
     - `thisMonth` and `monthlyAverage` (as on the overview);
     - `sessionsInWindow` and `trainingDaysInWindow`;
     - `sessionsPerWeek` (the average);
     - `weeksTrained` against `weeksInWindow`;
     - `longestBreak { days, from, to }`.
   - *Changed 2026-11-19:* also `minutesInWindow`, `averageMinutesPerTrainingDay`, and with `series: true` a `series` of minutes and training days per period (see `docs/workout-duration-design.md`).
   - The longest break needs one new pure core function, `longestBreak(days, from, to)`.
5. **`balance`** `{ range? | from?/to? }`
   - Returns `groups: [{ group, setsPerWeek, light }]`, plus the 10 busiest `muscles: [{ muscle, group, setsPerWeek }]`, plus the light rule ("under half the median group").
6. **`recent_workouts`** `{ range? | from?/to?, limit?, unit? }`
   - Returns `[{ date, title, exercises: [{ title, id, topSet, allTimeRecord }] }]`.
   - *Changed 2026-11-19:* each workout also has `durationMinutes` (see `docs/workout-duration-design.md`).
   - Uses the same top-set and fallback rules as Latest entries.
   - **With no window,** it returns the latest `limit` workouts (default 5).
   - **With a window** (`range`, or `from`/`to`), it returns every workout in the window, newest first, plus `totalInWindow`. "What did I do this month?" then gets the whole month.
   - **The cap is 40 either way** (the owner's decision, 2026-11-17: they train 25–30 times a month, so a month must fit). When a window holds more, the result says how many it left out and suggests a shorter window. It never passes a cut-off list as complete.
   - **Size:** about 0.8 KB per workout on the owner's data, so a month is about 20–24 KB. That's above the usual 4 KB on purpose: the question asks for the whole month.

These six cover goals 1 and 2: "Am I getting stronger?" maps to `main_lifts` plus `exercise_progress`, "consistent?" to `consistency`, "balanced?" to `balance`, any exercise to `find_exercises` plus `exercise_progress`, and comparisons to the same tools called twice with `from`/`to`.

Tool descriptions are written for Claude: one line on what the tool answers, the meaning of each measure, and "all figures match the hevy-viz dashboard".

### Errors

Errors are returned as MCP tool errors (`isError: true`), each with one plain sentence naming the problem and the fix:
- no data file;
- an unknown or ambiguous exercise (with candidates);
- an invalid date;
- `from` after `to`;
- an unknown `kind` or `range`.

Arguments are validated with the SDK's schema support (zod).

### Size limits

- Every list is capped, as above.
- A typical result stays under about 4 KB.
- `exercise_progress` downsamples its series rather than returning every session.

### Running it

- **Script:** `npm run mcp` (`tsx mcp/server.ts`).
- **Claude Code:** a committed project `.mcp.json` registers it as `hevy-viz` (the owner's decision, 2026-11-15). Opening Claude Code in this repo offers it, behind Claude Code's one-time approval prompt.
  - **No personal values in the file.** The time zone and data path come from environment variables through `.mcp.json`'s `${VAR}` expansion (`HEVY_VIZ_TZ`, `HEVY_VIZ_DATA`), each with a default, so the committed file is the same for everyone.
  - **It needs `npm install` first,** because it launches through `npx tsx`. The README says so.
  - **Without the project file**, for example from another folder: `claude mcp add hevy-viz -- npx tsx /path/to/hevy-viz/mcp/server.ts`.
- **Claude desktop app:** the README gives a `claude_desktop_config.json` snippet with the absolute path and an optional `HEVY_VIZ_TZ`.
- **README:** a new "Ask Claude about your training" section. It covers setup, the six tools in plain words, the freshness rule ("as current as your last `npm run sync`") and the privacy note from Constraints.

## Testing

- **Unit tests** (`mcp/tools.test.ts`): run each handler against `public/data/sample.json`:
  - Its figures equal the dashboard's for the same inputs. For example, `exercise_progress("squat", "all")` returns the same best, change and PR count as `summarize` over the progress index, and `main_lifts` returns the same order as `mainLiftsIn`.
  - Custom windows compare correctly.
  - Ambiguous names return candidates; an exact title wins over a substring.
  - Units: lb rounding, and "±0".
  - Caps and downsampling hold.
  - A missing file returns the error.
- **Core tests:** `filterBetween`, `longestBreak` and the window variants, written test-first in their core files. The moved `buildTraining` and `mainLiftsIn` tests move with them.
- **One end-to-end test** (`mcp/server.test.ts`): spawn the server with the SDK client over stdio and `HEVY_VIZ_DATA` pointed at the sample. List the tools (6), call `exercise_progress` for squat, and check the result parses and its `context.source` is `"sample"`.
- **Gate:** the existing four commands (`npm test`, lint, build, `test:e2e`) keep passing. `npm test` picks up `mcp/**/*.test.ts`.

## Rollout

1. Move `buildTraining` and `mainLiftsIn` into `src/core/training.ts`. The dashboard keeps working, and its tests pass.
2. Add the window support (`filterBetween`, window variants) and `longestBreak` to the core, test-first.
3. Add `mcp/tools.ts` with its handlers and tests.
4. Add `mcp/server.ts`, the tsconfig, `npm run mcp`, the committed `.mcp.json` (no personal values) and the end-to-end test.
5. Try it against the real data in Claude Code with a handful of the questions from the summary. Fix any tool description that leads Claude astray.
6. Update the README: the new section, plus the roadmap item checked off.

## Risks

- **Stale data.** Answers reflect the last sync. Mitigation: `syncedAt` is in every result, and tool descriptions tell Claude to mention it when the data is more than a few days old.
- **Personal data in chat.** Mitigation: small results, an explicit README note, and nothing raw.
- **Name ambiguity** (488 exercises, many similar titles). Mitigation: exact match first, then candidates with ids.
- **SDK churn.** The MCP TypeScript SDK changes often. Mitigation: pin an exact version at implementation time, and keep handlers SDK-free so only `server.ts` touches it.

## Open questions

1. ~~**Time zone default.**~~ **Decided 2026-11-15 by the owner:** `America/Chicago` when `HEVY_VIZ_TZ` isn't set (see Data, clock and time zone).
2. ~~**A "sync now" tool.**~~ **Decided 2026-11-15 by the owner:** not in v1; kept as a future enhancement (below).
3. ~~**Committed `.mcp.json`.**~~ **Decided 2026-11-15 by the owner: commit it.**
   - **Why:** setup on any machine is just clone, `npm install` and approve. The config also stays in step with the server's code, and it fits the later users named in PRODUCT.md (other Hevy Pro lifters).
   - **Accepted costs:** everyone who clones sees Claude Code's approval prompt. The desktop app ignores the file, so the README snippet is still needed there. The file can hold no personal values (see Running it).

## Future enhancements

- **A "sync now" tool** (the owner wants it later, not in v1). It would pull new workouts from Hevy so answers are current without leaving the conversation.
  - **Prerequisites:** incremental sync (the README roadmap's `/v1/workouts/events` item), so it fetches only what changed instead of the full history.
  - **What it changes:** the server would need `HEVY_API_KEY` in its environment, and it would make network calls, which relaxes the v1 rule "no network, never reads the key".
  - **Design points for then:** the tool should be explicit (never run implicitly by another tool), report what it fetched, and reuse the sync script's retry handling (`scripts/retry.ts`). The reload-on-change rule already picks up the new file.

## Left to the builder

- The exact SDK version and the zod version it requires.
- The downsampling details beyond the stated caps.
- The wording of tool descriptions and errors, within the rules above.
- The internal shape of the window types in the core, as long as the dashboard's `DateRange` callers keep working.
