# Day totals on the calendar (Apple Health, part 3a): design

**Status:** proposed 2026-11-26. Approved 2026-11-26.
**Scope:** one small PR. The first half of Apple Health project 3 ("All activity on the calendar"); 3b, Health workouts on the calendar, follows.
Choices are the author's unless marked as the owner's.

## Why

The owner wants Health data on the calendar, and "one big thing is steps and calories burned" *(owner, 2026-11-25)*. They want both a day's totals and each workout's own numbers *(owner)*. The totals are already in `data/health.json` from project 1, so they come first as 3a. Per-workout numbers need a workout import and cross-app duplicate matching, so they're 3b *(owner agreed to the split and order)*.

## Goals

- **Days shaded by steps** on the calendar's month grid *(owner)*, as a light wash over the whole day *(owner chose this over a step bar)*. The lifting dot stays as it is.
- **A totals line in the day panel:** steps, distance, active calories, exercise minutes and the night's sleep, above the day's Hevy workouts *(owner saw it in the mockup)*.
- **Rest days with Health data can be picked,** so a rest day with 14,000 steps isn't a dead end.

## Non-goals

- Health workouts, per-workout calories, and duplicate matching (3b).
- Changing the importer or `data/health.json`.
- Shading by anything other than steps.
- Extending the calendar before the first workout. The calendar's All time still starts at the first Hevy workout, so its sessions-per-week summary keeps meaning the same thing. *(Author's call; the Activity tab already shows the older Health years.)*

## Approaches

There's one sensible way: a small pure function in `src/core` reads each day's figures from the health data the app already loads (`useHealth`), and the calendar draws them. Working out bands in `npm run health` would bake a display choice into the data file. Waiting for 3b would hold back the part the owner called the big thing behind the hardest part.

## The shading

- **Six fixed bands** by the day's steps: under 5,000; 5,000–7,499; 7,500–9,999; 10,000–14,999; 15,000–19,999; 20,000 and up. The first three follow the common published activity levels *(author's call)*; the owner split 10,000 and up into three *(owner, 2026-11-26)*. Fixed bands mean the same thing in every year, where bands relative to the owner's own year would shift as habits change.
- **A day with no step data** gets a faint diagonal hatch, so it can't be mistaken for a low day. That includes days after the export date.
- **Shades are ink at increasing strength,** with the darkest kept light enough that the lifting dot and the day number stay readable (at least 3:1 for the dot, 4.5:1 for the number). Dark mode gets its own values. Exact strengths follow DESIGN.md. Six shades of one ink inside that ceiling sit close together, so the builder checks with a screenshot that neighboring bands are still told apart in both modes; if they aren't, the top bands may also thicken the day's border. *(Author's call.)*
- **A legend under the summary line:** the six swatches with their step ranges, plus "no data".
- **No health data at all** (nothing imported, or a load error): the calendar looks exactly as it does today, with no hatch and no legend.
- **Real Health data beside the Hevy sample** (Health imported, Hevy never synced): no shading and no totals line. Sample lifting is never drawn beside real health figures, following project 1's rule. The demo, with both samples, shows everything.

## The day panel

- **The totals line,** above the day's workouts, lists only the measures the day has, in Activity-tab order and formatting: "9,300 steps · 4.1 mi · 540 kcal · 46 min exercise · 7h20 sleep". Distance follows the km/mi setting. A day with no Health data has no line.
- **Sleep** is the night filed under that day by project 1's rule (the night that ended that morning).
- **A rest day** with Health data can be picked. Its panel shows the totals line and says "Rest day." where the workouts would go, as the panel already does for a rest day. *(Changed 2026-11-26, at planning: was "No workouts".)* The calendar still opens on the latest training day, as now.

## Screen readers

Each day's label gains its steps: "Wednesday, November 19, 2026: 1 session, 18 sets, 9,300 steps". A pickable rest day reads "…: no sessions, 9,300 steps". A day with no data says nothing extra.

## Code layout

- `src/core/health.ts`: `stepBand(steps: number | undefined): 0 | 1 | 2 | 3 | 4 | 5 | 6` (0 is no data) and a by-date lookup of `HealthDay`s.
- `src/views/Calendar.tsx`, `CalendarMonth.tsx`, `DayPanel.tsx`: take the health state, shade cells, make health-only days links, and draw the totals line. `App.tsx` passes `health` to the calendar.
- README: one line on the shading.

## Acceptance

- Unit tests: 4,999, 5,000, 7,499, 7,500, 9,999, 10,000, 14,999, 15,000, 19,999 and 20,000 steps fall in the right bands; no steps is band 0; the panel line leaves out missing measures; sleep and distance use the existing formatting.
- End-to-end on the demo: cells carry their band; a day after the sample's last health day is hatched; the legend shows; picking a health-only rest day shows its totals and "No workouts"; with no health data, no cell is shaded and there's no legend; real Health beside the Hevy sample shows no shading. All on desktop, phone and dark mode.

## Left to the builder

- Shade strengths and hatch spacing, within DESIGN.md and the contrast floors above.
- Where the legend sits on a phone.
- Function and prop names.
