# hevy-viz cleanup: design doc

2026-11-14 · Carol

## Summary

hevy-viz has a sound structure. This plan fixes two data-privacy gaps and two correctness bugs, then removes duplication and splits two oversized units.

hevy-viz is a React, TypeScript, and D3 dashboard that charts estimated one-rep max (1RM) from a Hevy workout export. It is about 700 lines of source:

- pure metric functions in `src/core`
- one D3 chart in `src/charts/E1rmChart.tsx`
- the app shell in `src/App.tsx`
- two Node scripts, one to sync real data and one to generate sample data

A code review on 2026-11-14 checked the code against four goals: clean code, object-oriented design, DRY, and scalable algorithms. The split between a pure `core` and the UI is the right foundation. The main problems are:

- no `.gitignore` file
- a build that would ship personal data
- dates computed in UTC instead of local time
- a 140-line chart effect
- business logic living in `App.tsx`

Tests, lint, and build were not run because dependencies are not installed.

## Goals and non-goals

**Goals**

- Personal workout data can never be committed or deployed by accident.
- Dates match the day the user actually trained, in their time zone.
- Every business rule (date ranges, PRs, which exercises have 1RM data) lives in `src/core`, is pure, and is unit tested.
- Each formatting rule and date helper is defined once.
- No function or component does more than one job, and the chart's draw logic is split into named steps.
- The 1RM history is computed once per dataset and exercise, not once per consumer.

**Non-goals**

- Rewriting the domain model as classes (see [Design principles](#design-principles)).
- Performance work beyond removing duplicate scans. A personal history is a few thousand workouts.
- New features from the README roadmap, except where a change here makes them easier.
- Visual redesign of the dashboard.

## Fix first

These four issues come before any refactoring. The first two can leak personal data, and the last two show wrong or empty results.

### 1. No `.gitignore`

The README says `public/data/hevy.json` is git-ignored, but the repo has no `.gitignore`. The first `git add .` would commit the user's real workout history, `node_modules`, and `.DS_Store`.

**Change:** add a `.gitignore` covering `node_modules/`, `dist/`, `.DS_Store`, `*.tsbuildinfo`, and the synced data file.

### 2. The build ships synced data

`scripts/sync-hevy.ts` writes to `public/data/hevy.json`, and Vite copies everything in `public/` into `dist/`. Deploying `dist/` as a public demo would publish the user's workouts.

**Change:** sync to `data/hevy.json` at the repo root, which is outside `public/` and git-ignored. Add a small dev-only middleware in `vite.config.ts` that serves `/data/hevy.json` from that file. `public/data/sample.json` stays where it is, so a production build contains only the sample.

### 3. Dates are UTC, not local

`toDay` (`src/core/metrics.ts:17`) takes the first 10 characters of a UTC timestamp. A 7 p.m. workout in California is 03:00 UTC the next day, so it gets the wrong date. This affects the chart, the table, PR dates, and the weekly buckets in `weeklySetsByMuscle`.

**Change:** add a new `src/core/dates.ts` with `toLocalDay(iso, timeZone)`. It uses a cached `Intl.DateTimeFormat("en-CA", { timeZone })`, which formats as `YYYY-MM-DD`. Core functions take the time zone as a parameter, so they stay pure and an MCP server can pass its own. The dashboard passes the browser's time zone.

### 4. The default exercise can have no chart

`exercisesByFrequency` ranks every exercise, including cardio, bodyweight, and timed holds. If the most frequent exercise has no weight and reps, the dashboard opens on an empty chart with "—" in every stat tile (`App.tsx:32-33`).

**Change:** the exercise picker lists only exercises that have at least one 1RM estimate. Filtering by template type `weight_reps` alone would miss weighted bodyweight exercises, so the check uses the computed history.

## Proposed design

### Target layout

```
src/
  core/                    pure, no DOM, shared with a future MCP server
    types.ts               unchanged
    dates.ts         NEW   toLocalDay, parseDay, addDays, weekStart, MS_PER_DAY
    ranges.ts        NEW   DateRange, RANGES, filterByRange
    metrics.ts             estimateOneRepMax(set), e1rmIndex, personalRecords, ...
  format.ts          NEW   formatKg, formatKgPrecise, formatSet, formatDate
  hooks/
    useDataset.ts    NEW   loading, errors, abort on unmount
    useE1rmView.ts   NEW   selected exercise + range -> history, prs, stats
  components/
    RangePicker.tsx  NEW
    ExercisePicker.tsx NEW
    StatTile.tsx     NEW
    E1rmTable.tsx    NEW
  charts/
    E1rmChart.tsx          React shell: refs, resize, effect wiring
    e1rmDraw.ts      NEW   drawGrid, drawAxes, drawSeries, drawPrMarkers, attachInteraction
  App.tsx                  composition only
```

Dependencies point one way: components, hooks, and charts import from `core` and `format.ts`. `core` imports nothing outside itself.

### `core/dates.ts`

This module is the single home for date handling. Today the same logic is spread across several files:

- turning a date string into a Date by appending `"T00:00:00Z"`: `metrics.ts:21` and `E1rmChart.tsx:13`
- `.toISOString().slice(0, 10)`: `metrics.ts:24` and `App.tsx:40`
- the magic number `864e5` (milliseconds per day): `App.tsx:40` and `generate-sample.ts:41`

It also holds the time zone fix from item 3. Day strings stay `YYYY-MM-DD`, so the existing sorting and comparison of strings keeps working.

### `core/ranges.ts`

Move the date-range filter out of `App.tsx:35-42` into a pure, tested `filterByRange(history, range, anchor)`. The `anchor` parameter makes the current behavior explicit. Today a range ends at the lift's last session, not at today; see [Open questions](#open-questions).

### `core/metrics.ts`

- `estimateOneRepMax` takes a `HevySet` and returns the estimate together with the weight and reps it used. That removes the `!` assertions at `metrics.ts:47`.
- A new `e1rmIndex(workouts, timeZone): Map<templateId, E1rmPoint[]>` builds every exercise's history in one pass. `e1rmHistory` becomes a lookup into it.
- `exercisesByFrequency` takes the index and skips exercises with an empty history (item 4).
- Rename the magic number `12` (the picker limit) to a named constant.

### `format.ts`

There is one function per display rule, used by both the table and the chart tooltip:

| Function | Output | Replaces |
|---|---|---|
| `formatKg(x)` | `117 kg` | `App.tsx:92`, `E1rmChart.tsx:101` |
| `formatKgPrecise(x)` | `116.7 kg` | `App.tsx:123`, `E1rmChart.tsx:122` |
| `formatSet(p)` | `100 kg × 5` | `App.tsx:122`, `E1rmChart.tsx:124` |
| `formatDate(day)` | `Nov 14, 2026` | `E1rmChart.tsx:12` |

### Hooks and components

- `App.tsx` currently loads data, holds filter state, derives stats, and renders four kinds of UI. After the split it only composes hooks and components.
- `useDataset()` wraps `loadDataset` and aborts the fetch on unmount. Add a comment explaining the content-type check: Vite's dev server returns `index.html` with status 200 for missing files.
- `useE1rmView(data, templateId, rangeId)` computes the index once per dataset with `useMemo`. It then derives the range-filtered history, PRs, and the "current" and "change" stats. This removes the duplicate `e1rmHistory` call at `App.tsx:37` and `App.tsx:48`.
- `StatTile` replaces the three copied stat blocks at `App.tsx:90-101`.

### Chart

`E1rmChart`'s single `useEffect` (`E1rmChart.tsx:21-166`) becomes a short React shell that calls named draw steps in `e1rmDraw.ts`. Each step takes the selection, the scales, and the data. This split also fixes three bugs:

- **Keyboard position resets on resize:** `kbIndex` moves out of `draw` and into a ref that survives redraws.
- **Stale tooltip after resize:** `draw` hides the tooltip before it redraws.
- **Double draw on mount:** drop the explicit first `draw()` call, because `ResizeObserver` already fires once when it starts observing.

The comment at `E1rmChart.tsx:43` mentions a baseline that isn't drawn, and the `.baseline` CSS class is unused. Either draw the baseline or remove both.

### Scripts and CSS

- **`generate-sample.ts`:** put each lift's starting weight and yearly gain inside its template definition. Derive an `ExerciseId` union so a typo in the day plans fails type-checking.
- **`sync-hevy.ts`:** type `paginate` by its response key instead of casting `Record<string, unknown>`. Honor the `Retry-After` header on 429 responses.
- **`index.css`:** the `html` background at lines 43-44 should use `var(--surface-0)` instead of repeating the hex values.

## Design principles

The design stays a functional core with React components, not classes. This is a deliberate choice, not a gap.

The data is plain JSON from the Hevy API. It flows into pure functions, then into React, which expects data it can treat as immutable. A future MCP server would send it out again as JSON. Classes like `Workout` or `ExerciseSet` would have to be built from that JSON at load time and turned back into it on the way out, and their mutable state would conflict with React's model.

The object-oriented principles that matter here still apply:

- **Single responsibility:** split `App.tsx` and the chart effect.
- **Encapsulation:** business rules live in `core` behind small function interfaces, and the UI only calls them.
- **Cohesion:** keep sample template data in one place.
- **Dependency direction:** `core` depends on nothing.

An interface is worth adding when the second chart arrives (for example, the weekly-sets heatmap on the roadmap). At that point, extract a shared chart frame for margins, axes, the resize observer, and the tooltip. Doing that now would mean designing an abstraction around a single chart.

## Performance and scalability

The current algorithms are already linear in the number of sets, plus an O(n log n) sort. That is fine for a personal history. The changes are:

| Area | Today | After |
|---|---|---|
| 1RM history per view | 2 full scans of every set on each exercise or range change | 1 scan per dataset, building an index for all exercises; then a lookup |
| Exercise switch | Full rescan | Map lookup |
| Sync | Re-downloads the whole history, one page of 10 workouts at a time | Unchanged here; incremental sync via `/v1/workouts/events` (roadmap) is the real fix |

Not worth changing at this size:

- the array allocated by `sets.filter` for each exercise
- `toDay` running inside the innermost loop
- the date parsing inside the bisector
- `templates.find` inside the sample generator's loop

Revisit these if a profile shows them.

## Testing plan

The first step is to install dependencies and record a passing baseline for `npm test`, `npm run lint`, and `npm run build`.

New unit tests in `src/core`:

- `toLocalDay`: an evening workout west of UTC lands on the local day, and a time zone with daylight saving time is handled on both sides of the switch.
- `weekStart` with local days, including a Sunday-night workout.
- `filterByRange`: each range, an empty history, and a single point.
- `e1rmIndex`: matches `e1rmHistory` for every exercise in the sample dataset.
- `exercisesByFrequency`: excludes an exercise that has only cardio or bodyweight sets.
- `estimateOneRepMax` with a set object, including the null cases that exist today.

UI changes are checked by running the dev server against the sample data:

- chart, table, and keyboard navigation
- a resize while the tooltip is showing
- a production build that contains no `hevy.json`

## Rollout plan

Each step is one small commit, and tests pass after every step.

1. Install dependencies and record the baseline.
2. Add `.gitignore` and move synced data out of `public/`.
3. Add `core/dates.ts` and fix the time zone bug (with tests).
4. Add `core/ranges.ts`, `e1rmIndex`, and the 1RM-only exercise filter (with tests).
5. Add `format.ts` and replace the duplicated formatting.
6. Extract `useDataset`, `useE1rmView`, and the four components, leaving `App.tsx` as composition.
7. Split the chart draw function and fix the three resize bugs.
8. Clean up the scripts and CSS.

## Open questions

- **Where should a date range end?** Today "90 days" means the 90 days before the lift's last session, so a lift unused for six months shows old data. Should it end today instead?
- **Which time zone should the sync script and MCP server use?** The browser has one, but a script does not. Options are a `TZ` setting or a time zone stored in the dataset at sync time.
- **Will a personal build ever be deployed?** If yes, it needs a separate build mode that includes `hevy.json` behind some access control.
- **Should the README architecture section** be updated as part of this work or after it?
