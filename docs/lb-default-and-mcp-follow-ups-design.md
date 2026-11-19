# Default to lb, and MCP follow-ups: design

**Status:** implemented in PR #8, merged 2026-11-19. Proposed 2026-11-18.
**Scope:** one short PR. Closes issue #2 and the four items in `docs/mcp-follow-ups.md`, which this doc replaces.
Choices are the author's unless marked as the owner's.

## Why

- **Issue #2 ("Use lbs as units").** The owner trains in pounds. The issue was filed before the kg/lb toggle existed. The toggle covers most of it now, but anything that doesn't name a unit still falls back to kg: a new browser and every MCP answer.
- **MCP follow-ups.** These are four small issues from the final review of PR #6. Each one makes an answer less clear, or makes it likelier that two pieces of code drift apart.

## Goals

- When no unit is given, the dashboard and the MCP server both use lb. *(Owner's decision.)*
- Every MCP value says what unit it's in, including times and distances.
- MCP error messages say how to recover, not just what went wrong.
- The weeks in a window are counted in exactly one place.

## Non-goals

- Making the default configurable (an environment variable or a build setting). There is one user, and the toggle already exists.
- Changing what the dashboard displays for times and distances.
- Renaming or reshaping any existing MCP result field.

## Anti-goals

- The dashboard and the MCP server defaulting to different units. The MCP design already lists "a number in chat that disagrees with the dashboard" as a failure.
- A browser that has already saved a unit switching without being asked. A saved choice still wins.

## Approaches (owner picked A)

- **A. One shared default (picked).** Export `DEFAULT_UNIT: Unit = "lb"` from `src/format.ts`, which already defines `Unit`. The dashboard and the MCP tools both import it, so they can't drift apart.
- **B. Change the two `"kg"` literals in place.** This is the smallest diff, but nothing keeps the two defaults in step.
- **C. A configurable default** (`HEVY_VIZ_UNIT`, like `HEVY_VIZ_TZ`, plus a dashboard build setting). Rejected: it's extra setup that nobody needs.

## Design

### 1. Default to lb (issue #2)

- `src/format.ts`: add `export const DEFAULT_UNIT: Unit = "lb";`.
- `src/App.tsx:30`: use `DEFAULT_UNIT` as the `usePreference` fallback. The storage key `hevy-viz:unit` doesn't change, so a saved `"kg"` is still respected.
- `mcp/tools.ts:41`: delete the local `DEFAULT_UNIT` and import the shared one.
- `mcp/server.ts:91`: change the schema description to say lb is the default (whole pounds) and kg is the other choice (to 0.1).
- Tests:
  - Unit tests that rely on kg being the default, such as "gives the best in kg to 0.1 by default" in `mcp/tools.test.ts`, either assert lb or pass `unit: "kg"` explicitly. Builder's call, test by test.
  - The e2e tests assume kg on first load. For example, `e2e/dashboard.e2e.ts:25` expects kg to be selected, and `e2e/overview.e2e.ts:68` expects "kg" in the note. Update them so lb is the starting state and kg is the unit you switch to.
- Docs: in `README.md:23`, write "lb by default, or kg; remembered per browser". In `docs/mcp-server-design.md:100`, add a dated note that the default is now lb rather than rewriting the original text.

### 2. Name the unit for timed and distance results (follow-up 1)

`exercise_progress` returns `unit: ""` for duration and distance exercises, although their `value`s are raw seconds and meters (`mcp/tools.ts:193`). In `mcp/tools.ts` only, report `"seconds"` for duration and `"meters"` for distance. `valueUnit` in `src/format.ts` stays as it is, because the dashboard relies on `""` meaning the text carries its own unit ("1:45", "5 km"). A small helper in `tools.ts` that falls back from `valueUnit` is enough. Add a test for one timed exercise and one distance exercise.

### 3. Recovery hint after a failed sync (follow-up 2)

Change `UNREADABLE` at `mcp/server.ts:19` to:
"The data file couldn't be read; if a sync is running, try again in a moment, or run `npm run sync` again."
Update the matching assertion in `mcp/server.test.ts:94`.

### 4. Point to `find_exercises` when nothing matches (follow-up 3)

In `mcp/tools.ts:92`, change the message to `No exercise matches "<query>"; find_exercises lists them.` This matches the wording already used for an empty name at `mcp/tools.ts:84`. Update the assertions at `mcp/tools.test.ts:73`, `mcp/tools.test.ts:318` and `mcp/server.test.ts:55`.

### 5. Count the weeks in a window in one place (follow-up 4)

Add `weeksIn(w: DayWindow): number` to `src/core/ranges.ts`, next to `DayWindow`. It returns the number of Monday-first weeks the window touches, counted in whole days with `weekStart`, the same way `windowStats` counts them today. Then:
- `windowStats` (`src/core/consistency.ts:105`) uses it.
- `mcp/tools.ts:155` deletes its own `weeksIn` and `MS_PER_WEEK` and imports the shared one.

Add unit tests in `ranges.test.ts` for a single day, a window inside one week, a window that crosses a week boundary, and a window that crosses a daylight-saving change. Days are UTC midnights, so DST shouldn't matter, and the test proves it.

## Left to the builder

- The name of the helper for item 2.
- For each kg-default test, whether to flip it to lb or pin it to kg.
- Commit boundaries. One commit per numbered section reads well.

## After it lands

Close issue #2. `docs/mcp-follow-ups.md` is superseded; the owner decides whether to delete it or keep it.
