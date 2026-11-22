# Training calendar: design

**Status:** proposed, 2026-11-22.
**Scope:** one PR. Closes the roadmap item "Training calendar".
Choices are the author's unless marked as the owner's. The owner picked this roadmap item and asked the author to make the calls *(owner, 2026-11-22: "dive in")*.

## Why

The roadmap item was written on 2026-11-14, before the redesign added the Consistency dot grid to the Overview. That grid already shows a year of days, so it covers part of what a calendar would. It leaves three gaps:

- It stops at 52 weeks, even when the range is All time. Most of the owner's four years can't be seen day by day.
- It shows how much was done on a day, but not what. Answering "what did I do on the Tuesday before my trip?" means going to Hevy.
- It's laid out as weeks in a strip, not as months, so "how did October go?" takes counting.

The calendar answers PRODUCT.md question 2 ("Am I training consistently?") across the whole history, and makes any past day one tap away.

## Goals

- A **Calendar** tab shows the selected range as month calendars, one per month, newest first. All time reaches back to the first workout.
- Each day shows at a glance whether you trained and how much, drawn the same way as the Consistency grid.
- Picking a day shows what happened: each workout's title, start time and length, and every exercise's top set, with record stars and links to the exercise pages.
- A selected day has its own link (`#/calendar/2026-11-13`), so it can be bookmarked and the back button works.
- A summary line for the range: sessions, sessions per week, weeks trained, and the longest break.

## Non-goals

- MCP changes. `recent_workouts` with `from` and `to` already answers "what did I do on that day?"
- Replacing or changing the Overview's Consistency box.
- Coloring days by muscle group or workout type.
- Anything that writes data. The dashboard stays read-only.

## Anti-goals

- A page that scrolls sideways on a phone, or day cells too small to tap.
- Tapping a day on a phone and losing your place in the calendar.
- New colors. The two inks carry it, as everywhere else.

## Approaches (author picked 1)

1. **A Calendar tab with month grids and a day panel (picked).** Month grids are the shape people already read, every day is big enough to tap, and the day panel has room to show whole workouts. It costs a fourth tab.
2. **Extend the Overview's Consistency grid** to cover the range and open a day on click. No new tab, but the side column is 380 to 440px wide, so All time (about 220 weeks) would shrink each day to under 2px, and the Overview is meant for a glance, not for reading old workouts.
3. **Year strips on a tab**, GitHub style, one row of 52 weeks per year. Compact, and four years fit on one screen on a laptop, but on a 390px phone each day is under 7px: too small to tap, and the page still doesn't read as months.

## Design

### 1. Counting (core)

- A new `src/core/calendar.ts`, pure like the rest of core.
- **Months:** a function takes the per-day loads (`Training.days`) and a `DayWindow`, and returns every month the window touches, newest first. Each month has its sessions and training days (counting only days inside the window) and its weeks as rows of seven Monday-first cells. A cell is either empty padding or a day with its working sets, sessions, and whether it's inside the window.
- **A day's workouts:** a function takes the training, a day and a time zone, and returns that day's workouts oldest first, each with its start time, its length in minutes (`workoutMinutes`), and every exercise's top set and record flag.
  - `latestEntries` in `training.ts` already works out each exercise's top set, the fallback measure and the record flag. Move that into a shared helper so both use it, rather than copying it.
- The summary line reuses `windowStats` and `longestBreak` from `consistency.ts`.

### 2. Route and tab

- New route `{ view: "calendar"; day?: string }`, written `#/calendar` and `#/calendar/YYYY-MM-DD`. A malformed day is treated as no day.
- "Calendar" is the fourth tab, after Balance, so the existing tabs don't move. All four tabs must fit on the phone header's single row (the layout e2e test checks for no sideways scroll).

### 3. The page

```
CALENDAR                                                  dot size = working sets
48 sessions · 3.7 a week · 13 of 13 weeks trained · longest break 4 days, Oct 2–5

NOVEMBER 2026 · 9 sessions         OCTOBER 2026 · 14 sessions       ┌─────────────────────────────┐
 M   T   W   T   F   S   S          M   T   W   T   F   S   S       │ FRI, NOV 13, 2026           │
                         1 ·                1●  2   3●  4   5●      │ Lower A · 6:42 pm · 58 min  │
 2●  3   4●  5   6●  7   8          6●  7   8●  9  10● 11  12       │ Squat 150 × 5 ★             │
 9● 10  11● 12 (13●) 14  15        ...                              │ Romanian Deadlift 120 × 8   │
16● 17  18● 19  20  21  22                                          │ Leg Press 200 × 10          │
23  24  25  26  27  28  29                                          │ …every exercise             │
30                                                                  └─────────────────────────────┘
```

- **Months newest first**, so the current month is at the top, where the owner looks at the gym. Each month is headed with its name, year and sessions.
- **Day cells:** the date number in the data hand, and a dot sized by working sets on the same scale as the Consistency grid (share its radius function rather than copying it). Rest days show only the number. Days outside the window, and days after the range's end day, show a faded number and no dot.
- **Selected day:** ringed in raspberry, the "current place" pen. Until a day is picked, the latest training day in the window is shown, without changing the link.
- **Wide screens** (from 1000px): months flow in columns of about 300px on the left, and the day panel sits in a right-hand column about 400px wide that stays in view while the months scroll. It's a ballpoint box like the Consistency box, with no shadow.
- **Narrow screens:** one month per row, and the day panel appears directly under the month that holds the selected day, so a tap never moves you away from where you were.
- **Day panel:** the full date with its year. For each workout: its title, start time, length, and every exercise's top set (not cut off at four, as Latest entries is), with record stars and links to the exercise pages. If the day has no workouts, it says "Rest day."
- **A linked day outside the range** falls back to the default selection. The range starts as All time on every load, so a bookmarked day always works.
- **Empty range:** "No sessions in this range." in the existing empty-state style.

### 4. Accessibility

- Each month is a `<table>` with a caption and weekday column headers.
- Each training day is a link to its `#/calendar/<day>` route, labeled like "Fri, Nov 13: 1 session, 22 sets". Rest days aren't links. The selected day has `aria-current="date"`.
- The day panel is a labeled region. Picking a day doesn't move focus, so keyboard users stay in the grid, but on narrow screens the panel's new position must not push the focused day out of view.

### 5. Docs

- README: a Calendar line in the features, the new core file in the code map, and the roadmap item ticked.
- DESIGN.md: a component entry for the calendar month and the day panel, and the fourth tab in the header description.

### 6. Tests

- **Core:**
  - months come newest first, with Monday-first padding (2026-11-01 is a Sunday);
  - partial first and last months count only days inside the window;
  - a month with no training is still listed;
  - a workout near midnight lands on the right day in a non-UTC time zone;
  - a day's workouts come oldest first, with top sets and record flags matching what `latestEntries` gives for the same workout;
  - a day with no workouts returns an empty list.
- **Route:** `#/calendar`, `#/calendar/2026-11-13`, and a malformed day.
- **Browser (Playwright, sample data):**
  - the tab opens the calendar, newest month first;
  - picking a day shows its workouts and updates the link, and Back returns to the previous day;
  - at phone width there's no sideways scroll and the panel appears under the selected day's month;
  - a range with no sessions shows the empty state.

## Left to the builder

- Function, component and CSS file names, and the exact return shapes.
- Exact cell sizes, dot scale tuning for bigger cells, gaps and the breakpoint (about 1000px).
- How the panel is placed under its month on narrow screens (for example, a media-query hook that picks where it renders).
- The wording of labels, within the American-spelling rule.
