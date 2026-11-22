# Incremental sync: design

**Status:** implemented in PR #15, merged 2026-11-21. Proposed 2026-11-21.
**Scope:** one small PR. Closes the README roadmap item "Incremental sync via `/v1/workouts/events`".
Choices are the author's unless marked as the owner's.

## Why

`npm run sync` downloads the whole history every time. The owner isn't bothered by it; this is a nice incremental improvement *(owner)*. It is also the prerequisite the MCP design names for a future "sync now" tool (`docs/mcp-server-design.md`, Future enhancements), which would run the sync from inside a conversation and so needs it to be quick and light on Hevy's rate limits.

## How it works today

- `scripts/sync-hevy.ts` pages through `/v1/workouts` at 10 per page (1,436 workouts, about 144 requests) and `/v1/exercise_templates` at 100 per page (776 templates, 8 requests), then writes `data/hevy.json` (7.7 MB) in place with `writeFile`.
- Deleted workouts disappear on their own, because the next full download doesn't include them.
- `synced_at` is the local clock when the download finished.
- Readers: the MCP server reloads the file when its mtime changes (`mcp/server.ts`); the dev server reads it on every request (`plugins/personal-data.ts`). Neither depends on the order of `workouts`.
- 429 handling lives in `scripts/retry.ts`, kept apart from `sync-hevy.ts` because that script runs on import.

## Goals

- A normal sync fetches only workouts that changed since the last sync: typically 1–2 requests for workouts instead of about 144.
- The result is the same as a full sync would give: new workouts, edits to old workouts, and deletions all show up.
- Readers never see a half-written file.
- The sync logic is testable without the network, so a "sync now" tool can reuse it later.

## Non-goals

- The "sync now" MCP tool itself.
- Incremental fetching of exercise templates or routines.
- Changing what the dashboard or the MCP server show.

## Anti-goals

- An incremental sync that silently drifts from what a full sync would produce (a missed edit, a deleted workout that lingers).
- A failed sync that leaves `data/hevy.json` damaged or half-updated.
- Making a full sync harder to get when you want one.

## Approaches (owner picked A)

- **A. The events endpoint (picked).** Ask `/v1/workouts/events?since=…` for everything that changed since the last sync, then upsert updated workouts by id and drop deleted ones. Catches edits to old workouts and deletions, so it matches a full sync.
- **B. Newest-first paging that stops at known workouts.** Page `/v1/workouts` until a page holds nothing new. Doesn't depend on the events endpoint, but misses edits to older workouts, and catching deletions would need a count check followed by a full sync anyway. Kept only as the fallback if the events endpoint turns out not to work.
- *Dropped:* keep the full sync and parallelize requests. Hevy's rate limits work against it, and a "sync now" tool would keep running into them.

## Design

### 1. Confirm the events response first

Hevy's API docs (now at <https://developers.hevy.com/docs>) render with JavaScript and couldn't be read while writing this. The design assumes, from memory:

- `GET /v1/workouts/events?page=&pageSize=&since=` with `since` an ISO 8601 timestamp and `pageSize` at most 10.
- Response `{ page, page_count, events: [...] }`, where each event is either `{ type: "updated", workout: <full workout> }` or `{ type: "deleted", id, deleted_at }`.
- No events endpoint for exercise templates.

The first build step is a live check with the owner's key:

- A page of events since a recent date, to confirm the shape, the page size limit, and the event order.
- Events since a date before the first workout (2023-07-01), to see how far back Hevy keeps events. If `page_count` × 10 is roughly the workout count or more, events cover the whole history and section 2 stands. If coverage is clearly shorter, add a forced full sync when `synced_at` is older than that window. *(Author's call: section 2 rests on events covering any gap, and a short retention would leave deleted workouts behind after a long break.)*

If the shape differs, adjust the details below. If the endpoint doesn't work at all, stop and come back to the owner before switching to approach B.

*Confirmed 2026-11-21 with the owner's key:*

- The response is `{ page, page_count, events }`. `updated` events are `{ type, workout }`, and the workout has the same fields as a saved one, including `updated_at`.
- `pageSize` is at most 10. 11 returns HTTP 400, "pageSize must be less than or equal to 10".
- Events come newest first. Section 4 doesn't rely on the order.
- Retention: events since 2023-06-01 fill 144 pages (1,431–1,440 events), against 1,436 saved workouts plus 2 logged since the last sync. Events cover the whole history, so section 2 stands: no age limit.
- No `deleted` event appeared in the last 30 days, so its shape is still unconfirmed. The sync therefore checks each event: anything that isn't `updated` with a `workout`, or `deleted` with a string `id`, stops the sync with an error and leaves the file alone. A changed shape then can't silently leave deleted workouts behind. *(Author's call.)*

### 2. When to sync incrementally

- **Incremental** when `data/hevy.json` exists, parses, has `source: "hevy"`, and has a readable `synced_at`.
- **Full**, as today, otherwise (first sync, unreadable or sample file), or when run as `npm run sync -- --full`.
- No age limit that forces a full sync: the events endpoint covers any gap, and `--full` is there when the owner wants a clean copy. *(Author's call.)*

### 3. Where to start from

- Record the time when the sync **starts**, before the first request, and store that as `synced_at`. The data is current at least up to that moment, and anything that changes while the sync runs is picked up next time. *(Author's call. Today `synced_at` is taken at the end, which could let a change made during the sync slip through.)*
- The next incremental sync asks for events since `synced_at` minus 10 minutes. The overlap covers small differences between the local clock and Hevy's. Applying an event twice does no harm: an update replaces the workout with the same content, and deleting a missing id does nothing. *(Author's call.)*
- No new field in `HevyDataset`; `synced_at` serves as the starting point.

### 4. Applying events

Put this in a pure module next to `retry.ts`, for example `scripts/apply-events.ts`, so it can be tested without the network:

- Input: the saved workouts and the list of events. Output: the new workouts plus counts of added, updated and deleted.
- `updated`: replace the workout with the same id, or add it if new.
- `deleted`: remove the workout with that id if present.
- When the same id appears in several events, the latest one wins, by `workout.updated_at` for updates and `deleted_at` for deletions. `HevyWorkout` in `src/core/types.ts` doesn't declare `updated_at` yet, though the saved file has it; add it to the type. Don't rely on the order Hevy returns the events in. *(Author's call: it holds whatever order the live check shows.)*
- Keep `workouts` sorted newest first, as the full sync returns them, so the file looks the same either way. *(Author's call: no reader depends on the order.)* *Changed 2026-11-21:* Hevy's full sync orders by `created_at` descending, not `start_time` (found by comparing an incremental sync with a full one); sort by `created_at` so both produce the same file.

### 5. Exercise templates

Still fetched in full on every sync (8 requests). A new workout can use a newly created custom template, and there's no cheaper way to find those.

### 6. Writing the file

- Write to `data/hevy.json.tmp` in the same folder, then `rename` it over `data/hevy.json`. A rename is atomic on the same filesystem, so the MCP server and the dev server see either the old file or the new one. *Changed 2026-11-21:* the temp file name is unique per run (`hevy.json.<pid>.<time>.tmp`), so two syncs at once can't write into the same temp file.
- Nothing is written until every request has succeeded. A failed sync leaves the old file as it was.
- `/data/` is already git-ignored, so the temp file needs no new entry.

### 7. Output

- Incremental: `Synced since <local time of synced_at>: 3 new, 1 updated, 1 deleted. 1,439 workouts → data/hevy.json`
- No changes: `No workout changes since <time>. 1,436 workouts → data/hevy.json` (the file is still rewritten, to update `synced_at`).
- Full: as today, and say why it ran full ("no saved data", "--full").
- Keep the paging progress line and the rate-limit messages as they are.

### 8. Docs

- README: in "Use your own data", say that later syncs only fetch changes and mention `--full`; tick the roadmap item.
- `docs/mcp-server-design.md`: a dated note under the "sync now" future enhancement saying incremental sync now exists.

### 9. Tests

`apply-events` unit tests:

- A new workout is added; an edited workout is replaced; a deleted workout is removed.
- Deleting an id that isn't saved does nothing.
- Applying the same events twice gives the same result.
- An update followed by a later delete removes the workout, and a delete followed by a later update keeps it, whatever order the events arrive in.
- The result stays sorted newest first.

Choosing full vs incremental (section 2) should also be a small pure function with tests: missing file, unparseable file, sample file, missing `synced_at`, `--full`, normal case.

## Left to the builder

- Module and function names, and how to split `sync-hevy.ts` so its logic can be imported without running it.
- The exact wording of the output lines.
- Whether the live check in section 1 is a throwaway command or a small script; it doesn't need to be committed.
- Commit boundaries.
