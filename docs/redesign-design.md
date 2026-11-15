# hevy-viz redesign: design doc

2026-11-14 · Carol

## Summary

The dashboard was built around six barbell lifts and one chart. Real Hevy histories are much richer, and the current design hides most of them. This plan does two things together:

1. **Shows every exercise.** It charts each exercise by the measure its type supports, and lets you find any of them.
2. **Gives the dashboard a visual identity:** a hand-lettered training notebook in cerulean and raspberry ink on ivory graph paper.

Product context lives in [`PRODUCT.md`](../PRODUCT.md). The chosen direction and every sketch from the decision rounds are in `.impeccable/`, which is kept locally and not committed to the repo. The built design system is recorded in [`DESIGN.md`](../DESIGN.md).
- the direction contract is `.impeccable/surfaces/src-app-tsx.md`;
- the final reference sketch is `.impeccable/mocks/decision/paper-ivory.html`.

## Background: why so few exercises

The owner's synced data holds 1,432 workouts and 488 distinct exercises since August 2022. The dashboard shows at most 12, for two reasons.

1. **The exercise picker is capped.** `MAX_PICKER_LIFTS = 12` in `src/hooks/useE1rmView.ts`. That's fine for the sample's 6 lifts, but it hides 170 lifts that have data, some done 80 or more times.
2. **The only measure is estimated 1RM,** which needs weight and reps. 306 exercises can't produce one:
   - 163 bodyweight exercises measured in reps only;
   - 54 timed exercises;
   - 47 weighted exercises where every set is above 12 reps, where the Epley estimate isn't reliable;
   - about 40 cardio, distance or carry exercises.

So the fix isn't a bigger picker. Each exercise type needs its own measure, and there needs to be a way to find and browse hundreds of exercises.

## Goals and non-goals

**Goals**
- Every exercise the owner logged is reachable and charted, whatever its type (PRODUCT.md principle 1).
- The first screen answers three questions at a glance: am I getting stronger, am I training consistently, and is my training balanced?
- Any exercise can be found in seconds, by search or by browsing.
- Phone and laptop are equally good.
- A distinct visual identity that avoids the four looks the owner ruled out: gamified, spreadsheet-clinical, flashy tech dark mode and generic SaaS.
- kg/lb toggle, and light and dark mode.

**Non-goals**
- No changes to sync, the data format, or where personal data lives.
- No goal setting, programming, or workout logging. This stays read-only.
- No accounts or hosted deployment. Whether a personal build gets deployed is still open (see the cleanup doc).
- No new chart library. D3 stays.

## Decisions already made

These came out of the design rounds on 2026-11-14 and are recorded in `.impeccable/`.

**Visual direction: the training notebook.** The dashboard looks like the training log lifters kept before apps. It's styled after a hand-lettered mixtape j-card: ballpoint capitals on graph paper, lifts listed like a tracklist, and PRs starred in red. Other directions were explored and rejected, with sketches kept in `.impeccable/mocks/`:
- meet scoresheet
- Munich '72 identity
- gym whiteboard
- competition plate colors
- airport gate board
- team singlet
- the category-standard card dashboard

**Palette (light).** Paper and ink colors go on `:root` as tokens.

| Token | Value | Job |
|---|---|---|
| Paper | `#FCF9F2` ivory | Page ground |
| Grid | `#DCE3EE` | Graph-paper lines |
| Ink | `#0E4F86` deep cerulean | All text, lines, bars and charts |
| Ink, faded | `#5F86AE` | Secondary lines. For small text, use a darker step (about `#4A6F96`) to keep 4.5:1 contrast |
| Accent | `#D81B60` raspberry | PRs, the margin rule, the active tab, dates, below-target and "this month" |
| Selection | `#FFC21A` sunflower | Selected row and focus highlight only |

Each color has one job. Gray is never used for text.

**Typography**
- **Display:** Sue Ellen Francisco in capitals, traced with a stroke of about 0.036em so it reads as a ballpoint pressed hard. It's used for headings, the wordmark and big numbers.
- **Data and UI:** Patrick Hand SC, in block capitals that stay readable at table sizes, with tabular figures.
- **Fonts are self-hosted** through `@fontsource/sue-ellen-francisco` and `@fontsource/patrick-hand-sc` (5.3.0), not loaded from Google Fonts.

**Owner preferences captured along the way**
- First screen: a training overview.
- The consistency dot grid (dot size = working sets) stays in every version.
- Weight units: a kg/lb toggle.

## Information architecture

Three views behind one header. A hash router (`#/`, `#/exercises`, `#/exercises/<templateId>`, `#/balance`) means an exercise page can be bookmarked and the back button works. No router dependency is needed.

**Header (every view)**
- Hand-lettered "Training Log" wordmark.
- Tabs: Overview, Exercises, Balance. They're real links, with `aria-current`.
- Date range (90 days, 1 year, all time). It applies to every view, and ranges end today, as decided in the cleanup work.
- kg/lb toggle, remembered per browser in `localStorage`, with every access guarded.
- Exercise search. Typing jumps to Exercises, filtered.
- A raspberry "1,432 sessions" label styled like a cassette brand label, plus a "Sample data" tag when the data is the sample.

**Overview**

- **Main lifts, as a tracklist.** The six estimated-1RM lifts with the most sessions in the selected range, split into *Side A, Lower* and *Side B, Upper* (and *Bonus tracks* for core and full-body lifts). It's a real `<table>`: each side is a row group, and each lift's name links to its page. Each row shows:
  - track number = rank by sessions in the range;
  - name;
  - best set in range;
  - change over the range;
  - a pen sparkline;
  - the current estimated 1RM, right-aligned and hand-lettered like a track time.

  A PR in range gets a raspberry SVG star, a triple brand stripe, and a margin note ("PR Nov 13") on wide screens.
- **Consistency.**
  - Sessions this month vs the monthly average over the previous 12 complete months.
  - A dot grid of the last 52 weeks (13 for the 90-day range). Monday-first columns, dot radius on a fixed scale by working sets, and this month's dots in raspberry.
  - Each dot has a `<title>`, and the grid has a summary label.
- **Balance.** Working sets per week for six groups (Legs, Back, Chest, Shoulders, Arms, Core). Bars use a diagonal ballpoint scribble fill. Groups trained less than half as much as the median group are drawn in raspberry. A link leads to the Balance view.
- **Latest entries.** The last three workouts, written as log lines: "Fri 11/13 · Lower A · Squat 150 × 5 ★ · …". Each shows the top set per exercise, with stars where the session set an all-time record.

**Exercises**
- **The list.** Every exercise, filtered by search and by kind (All, Weights, Bodyweight, Timed, Distance) and sorted (most sessions, most recent, A–Z). Each row shows:
  - name and muscle;
  - best value with its measure;
  - sessions;
  - last done;
  - a sparkline.

  Show the first 100 rows, with a "Show all 488" control.
- **Exercise page (`#/exercises/<id>`).**
  - Name, muscle and measure.
  - Figures: best ever (with date), latest, change in range, days charted, and PRs in range.
  - The progress chart, with a table toggle and the existing empty state ("No sessions in this range · Last session · Show all time").
- **Exercises with no measurable sets** (15 in the owner's data) still appear and are labeled "No sets to chart".

**Balance**
- Group bars, same as the overview but larger.
- A table of every muscle trained in the range: muscle, group, sets per week and a bar.
- A possible later addition: a weekly strip per muscle, to show neglected weeks.

## Proposed design: data (`src/core`, pure and tested)

All new logic stays in `src/core`, free of DOM code, so the planned MCP server can reuse it. The functions below were prototyped and run against the real data before this doc was written. That code was reverted, but the numbers below come from it.

### `core/muscles.ts`
- `muscleGroup(muscle)` folds Hevy's 20 primary muscles into display groups: Legs, Back, Chest, Shoulders, Arms, Core, Full body, Cardio, Other.
- `MAIN_GROUPS` lists the six groups balance is judged on.
- `sideOf(muscle)` returns `lower` (legs and lower back), `upper` (chest, back, shoulders, arms) or `bonus` (everything else).
- `muscleLabel("upper_back")` returns "Upper back".

### `core/progress.ts`
This replaces the e1RM-only index with one that covers every exercise:

| Measure (`MetricId`) | Hevy template types | Value |
|---|---|---|
| `e1rm`, "Est. 1RM" | `weight_reps` when any working set is 12 reps or fewer | Epley estimate |
| `weight`, "Heaviest set" | `weight_reps` with no estimable set, `bodyweight_weighted`, `short_distance_weight`, `weight_duration` | `weight_kg` |
| `reps`, "Most reps" | `reps_only`, `bodyweight_assisted` | `reps` |
| `duration`, "Longest" | `duration`, `floors_duration`, `steps_duration` | `duration_seconds` |
| `distance`, "Longest distance" | `distance_duration` | `distance_meters` |

- **`progressIndex(data, timeZone)`** works in one pass over every working set. It returns `Map<templateId, ExerciseProgress>`, where each entry has:
  - title, type and muscle;
  - its measure;
  - its best set per local day (`ProgressPoint`: date, value, workout and the set's weight, reps, duration and distance);
  - session count;
  - the last day it was performed.

  Exercises without a template get a type inferred from their sets. On the real data it indexed all 488 exercises in about 23 ms:

  | Measure | Exercises |
  |---|---|
  | Estimated 1RM | 173 |
  | Most reps | 168 |
  | Heaviest set | 83 |
  | Longest | 54 |
  | Longest distance | 10 |

- **`recordsBy(points)`** and **`summarize(points, range, endDay)`** generalize `personalRecords` and `e1rmSummary` to any measure. `summarize` returns the history in range, PRs in range (judged against all time), current, change, all-time best and last session.
- **Remove after migration:** `e1rmIndex`, `e1rmHistory`, `e1rmSummary`, `personalRecords` and `liftsByFrequency`. Move the existing "matches an independent reference scan" test over to `progressIndex`, so the one-pass index stays checked against a naive scan.

### `core/consistency.ts`
- `trainingDays(workouts, tz)` returns sessions and working sets per local day.
- `monthlySessions(days, endDay)` returns this month's count and the average over the previous complete months: at most 12, and never counting months before the first month trained. On the real data that's 12 this month against an average of 25.3.
- `dayGrid(days, endDay, weeks)` returns Monday-first week columns ending with `endDay`'s week.

### `core/balance.ts`
- `setsPerWeekByMuscle(data, tz, range, endDay)` covers every muscle trained in the range, busiest first. Weeks run from the range start (or the first workout, for all time) to `endDay`.
- `setsPerWeekByGroup(...)` covers the six main groups, each flagged `light` when below half the median group. This relative signal avoids inventing guideline numbers. On the real data over 90 days: Legs 20.6, Back 9.7, Chest 8.5, Shoulders 9.7, Arms 5.5, Core 9.1, so nothing is flagged.

### `format.ts`
Replace the kg-only helpers with unit- and measure-aware ones:

| Function | Example output |
|---|---|
| `formatWeight(kg, unit)` | "172.5" in kg; "380" in lb (whole pounds) |
| `formatDuration` | "1:45" |
| `formatDistance` | "5 km" |
| `formatValue(metric, value, unit)` | the value in its measure's format |
| `valueUnit(metric, unit)` | "kg", "lb", "reps" or "" |
| `formatChange(metric, delta, unit)` | "+6.5", "−2.5", "±0" |
| `formatPointSet(point, type, unit)` | "150 × 5", "+30 × 5", "12 reps", "5 km in 25:00" |
| Dates | `formatShortDate` "Nov 14", `formatLogDate` "Fri 11/13", `formatCount` "1,432" |

## Proposed design: UI

**Hooks**
- `useTraining(data)` builds everything derived from one dataset, once: the index, exercises sorted by sessions, training days and `endDay`. `mainLiftsIn(training, range)` then picks the main lifts for the selected range.
- `useRoute()` handles the hash routing.
- `usePreference(key, allowed, fallback)` remembers the unit.
- The existing `useDataset` stays. `useE1rmView` goes away.

**Components**
- `Header`
- `Overview`: `MainLifts`, `Consistency`, `BalanceBox`, `LatestEntries`
- `Exercises`: list and detail
- `Balance`
- `EmptyRange` (restyled)
- `ink.tsx`: authored SVG for the `Star`, the triple `Stripe`, `ScribbleDefs` (pattern fills), `Sparkline`, and the search and back icons. No Unicode glyphs stand in for icons.

**Chart.** `E1rmChart` and `e1rmDraw` become `ProgressChart` and `progressDraw`, generic over `ProgressPoint`. A small `ChartFormat` object (`value`, `unit`, `set`) keeps the chart unaware of measures and units. Keep everything the cleanup established:
- the ResizeObserver-only drawing with the SVG height set up front;
- keyboard stepping;
- restoring focus and tooltip after a resize;
- text-only tooltips.

Restyle it in ink:
- a 2.4px cerulean line;
- PRs as raspberry stars;
- a hand-lettered end label;
- a dashed raspberry crosshair;
- a sunflower focus ring;
- axes in Patrick Hand SC.

**States**
- Loading and error keep their current messages, restyled.
- The skipped-workouts notice stays (`role="status"`).
- Empty range, as today.
- No main lifts: point to Exercises.
- An exercise with no measurable sets.
- A search with no matches, which offers to clear the search.

## Visual system details

- **Drawn marks.** Boxes are drawn in ballpoint: a 2px ink border with a 4–6px radius. Bars use the diagonal scribble pattern, ink for normal and raspberry for flagged. PRs get a star plus the triple stripe. Regressions are struck through in raspberry, never hidden.
- **Refused patterns.**
  - No thick colored left borders on rows.
  - No card grids or hero-metric templates.
  - No eyebrow labels above headings.
  - Track numbers are allowed only because they carry the rank.
- **Browser surfaces** take their styling from the palette: `::selection` (sunflower), the caret (raspberry), `scrollbar-color`, `:focus-visible` (a dashed raspberry outline with an offset), underline offset and tabular figures.
- **Motion.** One authored moment: the chart line draws itself in like a pen stroke (`pathLength` plus `stroke-dashoffset`), once per data change, never on resize, and not at all under `prefers-reduced-motion`.
- **Dark mode: "the notebook under a desk lamp."** Deep blue-black paper, light cerulean ink, and brighter raspberry and sunflower. Starting values to tune: paper `#121A26`, grid `#1F2A3A`, ink `#CFE2F7`, faded `#9DB7D6`, accent `#FF5C93`, selection `#FFC21A`. The tokens are redefined under `prefers-color-scheme: dark`, and under `data-theme` when the header's theme control (Auto, Light, Dark) forces one.
- **Phone layout (about 390px).**
  - The header becomes rows: the wordmark with the session label, then tabs, then controls with a full-width search.
  - Tracklist rows keep rank, name (with the best set beneath), change and the 1RM, and drop the sparkline.
  - Margin notes are hidden; the star still marks PRs.
  - The dot grid scales through its `viewBox`.
  - Everything stacks into one column.

## Accessibility

- Keep keyboard support in the chart. Every chart has a table alternative.
- The tracklist is a real table. Tabs are links with `aria-current`. The range and unit controls are radio groups.
- Every SVG chart carries a role and label. Decorative ink is `aria-hidden`.
- Contrast: 4.5:1 for body and small text (hence the darker faded ink for small text) and 3:1 for large display text. Check both themes.

## Performance and scalability

- `progressIndex` is about 23 ms for 488 exercises and 1,432 workouts, built once per dataset in `useTraining`. Range, unit and route changes only filter and format.
- The exercise list renders 100 rows by default. Each sparkline is a single path. Virtualization isn't needed at this size; revisit past about 2,000 exercises.
- The 52-week dot grid is at most 364 circles.

## Testing plan

**Unit tests (Vitest), written before each module**
- `muscles`: grouping, unknown muscles, sides.
- `progress`:
  - the measure per type;
  - best working set per day, with warmups ignored;
  - reps, duration and distance values;
  - the heaviest-set fallback;
  - sessions and last day;
  - type inference;
  - `recordsBy` and `summarize`, including an empty range.
- `consistency`:
  - per-day counts;
  - the monthly average window;
  - Monday-first grid weeks. Note that 2026-11-14 is a Saturday.
- `balance`: per-week averages, the light flag, and the all-time span.
- `format`: every function above, kg and lb.
- Port the reference-scan test from `metrics.test.ts` to `progressIndex`.

**Browser tests (Playwright)** need deliberate updates, because the selectors and copy change:
- Overview tracklist sides and links.
- The kg/lb toggle changes values and persists across a reload.
- Search finds a non-1RM exercise (a reps-only or timed one) and opens its page.
- An exercise page for each measure.
- Empty range.
- Skipped-workouts notice.
- Chart keyboard, focus and resize, as today.
- No browser errors, as today.
- Run at 1440px and 390px, in light and dark.

**Visual checks.** Screenshots at desktop and phone widths, in both themes, compared against `paper-ivory.html`. Then the design detector and an independent finish review, per the impeccable workflow, and finally `DESIGN.md` documenting the built system.

## Rollout plan

Each step leaves the app working and the tests green.

1. **Core:** `muscles`, `progress`, `consistency` and `balance`, with tests. The app is unchanged.
2. **Formatting:** unit- and measure-aware `format.ts`, with tests. Old helpers stay until their callers move.
3. **Visual foundation:** tokens (light and dark), self-hosted fonts, browser surfaces and the `ink.tsx` marks, applied to the existing single page.
4. **Header and routing:** tabs, range, units and search; the current page becomes the Exercises page for estimated-1RM lifts.
5. **Chart:** `ProgressChart` generalized and restyled, with pen draw-in; e2e chart tests pass unchanged except for selectors.
6. **Exercises view:** every exercise, filters, sort and detail pages. This is where the "only 12 exercises" problem gets fixed.
7. **Overview:** tracklist, consistency, balance box and latest entries, as the default route.
8. **Balance view.**
9. **Cleanup:** remove `e1rmIndex` and related functions, `useE1rmView` and `ExercisePicker`; port the reference-scan test.
10. **Polish:** phone layout, dark-mode tuning, a contrast pass, e2e updates, the finish review and `DESIGN.md`.

## Risks

- **Costume risk.** Handwriting and graph paper can tip into novelty. Mitigation: the display face only on headings and big numbers; tables stay real tables in a readable face; data stays aligned and tabular.
- **Two inks carry everything.** If cerulean and raspberry aren't used at full strength, the page reads as a pale sketch.
- **Handwriting legibility on phones** at small sizes. Check Patrick Hand SC at 14–16px on a real device.
- **The meaning of the balance flag.** "Under half the median" is relative, so a uniformly undertrained week flags nothing. That's honest, but it might surprise.

## Open questions

1. **Main lifts selection.** Should the overview always show the top six estimated-1RM lifts by sessions, or should the owner be able to pin which lifts appear? *Decided 2026-11-15: the top six by sessions in the selected range; no pinning for now.*
2. **Balance reference.** Keep the relative flag, or add an optional sets-per-week guideline band (for example 10–20 per muscle) clearly labeled as a guideline?
3. **Dark mode.** The values above are a starting point and haven't been through a design round. Do we want one before building?
4. **Bonus tracks.** Is "Bonus tracks" the right name for core and full-body lifts, or should they simply join a side?
5. **Pounds rounding.** Whole pounds everywhere, or 0.5 lb for estimated 1RM?
6. **Favorites.** One rejected direction suggested circling favorite exercises in pen. Worth adding to the Exercises view later?
7. **Overlap with the cleanup doc.** It still has two open questions: whether a personal build is deployed, and which time zone the scripts use.
