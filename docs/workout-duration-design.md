# Workout duration in the MCP tools: design

**Status:** implemented in PR #10, merged 2026-11-20. Proposed 2026-11-19.
**Scope:** one small PR. Closes issue #9.
Choices are the author's unless marked as the owner's.

## Why

The owner wants to ask Claude how their training time changes: "am I training longer than last year?", "how much time did I put in this month?" Every workout in `data/hevy.json` has a readable `start_time` and `end_time`, but no MCP tool reports how long anything lasted.

## Goals

- `recent_workouts` gives each workout's length.
- `consistency` gives the window's training time: the total, the average per training day, and, when asked, a series over time.
- Time is counted in `src/core`, so the dashboard could show the same figures later.

## Non-goals

- Showing duration on the dashboard.
- A new tool. There are still six.
- Separating warm-ups from main workouts, or filtering out short workouts.

## Anti-goals

- Counting the same minute twice when two workouts on a day overlap.
- Counting the hours between a morning and an evening workout as training.
- A `consistency` answer that grows for questions that don't need the series.

## Findings that shaped it

- In the synced data, 1,436 workouts: median 49 minutes, 90% under 73, longest 133. None is implausibly long.
- 145 are under 10 minutes. They're real: mostly warm-ups and practice logged as their own workout ("Glute Warm Up", "PullUp Practice", "Yoga Warmup"). The owner used to log warm-ups separately and now logs them inside the main workout. *(Owner.)*
- 255 days have more than one workout. On 37 of them, two workouts overlap in time; on 71, two workouts are more than 3 hours apart.

## Approaches (owner picked A, modified)

- **A. Extend `consistency` (picked).** Add the minutes to `consistency`, with the series behind an opt-in `series: true` argument, so a plain call stays as small as it is now. *(Owner asked for the series to be optional rather than always returned.)*
- **B. A new `training_time` tool.** Questions about time would map to it clearly, but it adds a seventh tool, departs from the issue, and splits "am I training more?" across two tools.

## Design

### 1. Time per training day (core)

- Average **per training day**, not per session. *(Owner.)* A day with a 9-minute warm-up and a 55-minute lift is one 64-minute day, not two 32-minute sessions. This also gives the same answer whether a warm-up was logged separately (the old habit) or inside the main workout (the current one).
- A day's minutes are the **union** of its workouts' `[start_time, end_time]` intervals: overlapping workouts count once, and gaps between workouts don't count.
- A workout belongs to the local day of its `start_time`, as everywhere else. A workout that runs past midnight counts all its minutes on the day it started.
- Add `minutes: number` to `DayLoad`, filled in by `trainingDays` in `src/core/consistency.ts`. *(Author's call: `DayLoad` already holds each day's sessions and sets.)*
- A workout whose `end_time` can't be read, or is before its `start_time`, adds no minutes. A training day whose minutes are 0 for that reason is left out of the average's denominator. *(Author's call. The current data has none.)*

### 2. `consistency`

New fields, always returned:

- `minutesInWindow`: whole minutes.
- `averageMinutesPerTrainingDay`: whole minutes; `null` when the window has no timed training day.

With `series: true`, also:

- `series: { by: "week" | "month", points: [periodStart, minutes, trainingDays][] }`
- Per Monday-first week, or per calendar month when the window covers more than 104 weeks. This is the same rule and the same `MAX_WEEKS` as `exercise_progress`.
- One entry for **every** period the window touches, including periods with no training (`[start, 0, 0]`), so a gap reads as a gap. *(Author's call: `exercise_progress` lists only periods with data, but for time a missing week is information.)*
- The first and last periods can be partial, because the window doesn't have to start on a Monday or the 1st. The tool description says so.
- Training days ride along so Claude can tell "trained longer" from "trained more often".

Put the per-period counting in core next to `windowStats`.

### 3. `recent_workouts`

Each workout gets `durationMinutes`: `end_time − start_time` for that workout alone (not the day's union), in whole minutes. It's `null` when the time can't be read.

### 4. Server

- `consistency` input schema: add `series: z.boolean().optional()`, described as "Add minutes and training days per week (per month past 104 weeks). Use it for questions about change over time."
- Update the `consistency` and `recent_workouts` descriptions to mention training time.

### 5. Tests

- Core: a day with one workout; two overlapping workouts; two workouts hours apart; a workout past midnight; an unreadable `end_time`.
- `consistency`: the new fields with and without `series`; a week with no training appears as zeros; the switch to months past 104 weeks.
- `recent_workouts`: `durationMinutes` on a normal workout and `null` on an unreadable one.

## Left to the builder

- Names of the core helpers.
- Whether to note the change in `docs/mcp-server-design.md`. If so, add a dated note, as the lb change did.
- Commit boundaries.
