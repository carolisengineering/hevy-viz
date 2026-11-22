# Week-by-week muscle groups: design

**Status:** proposed, 2026-11-21.
**Scope:** one small PR. Closes the roadmap item "Weekly sets per muscle group (heatmap)".
Choices are the author's unless marked as the owner's.

## Why

The owner wanted something new, and picked this roadmap item. The Balance page already shows working sets per week for each muscle group, but as an average over the whole range. A grid of groups by weeks adds time to that: it shows gaps, streaks and shifts, such as three weeks without legs or chest creeping up, which an average hides.

## Goals

- The Balance page shows a grid with one row per main muscle group and one column per week, and each cell shows that group's working sets for that week.
- The grid follows the page's range toggle.
- The MCP `balance` tool can return the same numbers, so Claude can answer "when did I stop training shoulders?"
- The counting lives in `src/core`, shared by the app and the MCP server.

## Non-goals

- A row per muscle. The "Every muscle" table already covers muscles.
- A new view or tab.
- Guideline bands such as "10–20 sets per week". This is still an open question from the redesign.
- Flagging light weeks in the grid. The group bars above it already flag light groups.

## Anti-goals

- A grid you can't read on a phone, or one that scrolls the page sideways.
- A scale where a group that's always light, such as core, looks as busy as legs.

## Approaches (owner picked 1)

1. **Six groups on the Balance page (picked).** The rows match the group bars right above it, and 52 columns stay readable. The counting is close to what the code already does.
2. **Every muscle, about 17 rows.** It shows more detail, such as upper back versus lats, but most rows would be mostly blank, and on a phone it becomes a wall of tiny cells.
3. **A separate tab.** It gives the grid room, and it could later take in the "Training calendar" roadmap item, but it's a new view for one chart, and it splits up balance data that belongs together.

## Design

### 1. Counting (core)

- A new function in `src/core/balance.ts` takes the dataset, a time zone, a `DayWindow` and a `Period` (`"week"` or `"month"`). For every period the window touches, oldest first, it returns the period's start day and the working sets for each of the six `MAIN_GROUPS`.
- Periods with no training are included, with zeros.
- Only days inside the window count, so the first and last periods can be partial. This is the same rule `timeByPeriod` in `consistency.ts` uses.
- Working sets exclude warmups, as everywhere else.
- Each exercise goes to its group through the template's `primary_muscle_group` and `muscleGroup()`. Full body, cardio, and exercises without a template don't appear, as in the group bars.
- **The grouping rule moves to core.** Weeks are used up to 104 weeks, and months past that. `seriesBy` in `mcp/tools.ts` holds this rule today, and the app needs the same one.
- **Author's call:** `weeklySetsByMuscle` in `src/core/metrics.ts` has never been used outside its tests, and the new function replaces it. Delete it and its tests.

### 2. The grid (Balance page)

```
Week by week                      dot size = working sets
               Sep          Oct           Nov
Legs        ● ● • ● ● ● · • ● ● ● ● ●
Back        ● ● ● ● ● ● ● ● ● ● ● ● ●
Chest       • ● ● ● • ● ● ● ● ● ● ● ●
Shoulders   · · • ● · · ● · • ● · · •
Arms        ● ● ● ● ● ● ● ● ● ● ● ● ●
Core        · · · • · · · · · • · · ·
```

- **Where:** a "Week by week" section on the Balance page, between the group bars and the "Every muscle" table. When the range is All time and the data runs past 104 weeks, the heading is "Month by month".
- **Columns:** 90 days gives about 13 weeks and 1 year about 53. All time uses weeks or months, by the rule above.
- **Cells: author's call, dots and not shading.** I showed shaded squares when we talked. This design uses dots sized by sets instead, because that is how the Overview's Consistency grid already draws volume, with the same ink color and the faint dot for an empty cell. The two grids then read the same way, with no new colors. Revisit this if you'd rather have shading.
- **Scale:** one scale for the whole grid. The dot area grows with sets, and the busiest cell in the grid gets the full-size dot. With one scale, weekly and monthly grids both fill their cells, and core is never stretched to look like legs.
- **Labels:** the group names are to the left of the rows, in the same order as the group bars. Month names are above the week columns, and years above the month columns.
- **Accessibility:** the grid is one image with a summary label. Each dot has a title such as "Legs, week of Nov 9: 14 sets".
- **Width:** the grid scales to the page width as the Consistency grid does, and never scrolls sideways.
- **Empty range:** when the range has no working sets, the page's existing "No working sets in this range." covers it, and the grid isn't drawn.

### 3. MCP `balance`

- A new optional `series: true` adds `series: { by, groups, points }`.
  - `groups` lists the six groups in order.
  - Each point is `[period start, legs, back, chest, shoulders, arms, core]`.
- This uses the same compact tuple style as the `series` option of `consistency`.
- The tool and argument descriptions in `mcp/server.ts` say what the series is, that its first and last periods can be partial, and that it's for questions about change over time.
- Without `series`, the output is unchanged.

### 4. Docs

- **README:** the Balance feature line, the `balance` row of the MCP table, the `balance.ts` line in the code map, and the roadmap item ticked.

### 5. Tests

- **Core:**
  - empty periods are included as zeros;
  - partial first and last periods count only days inside the window;
  - warmups are excluded;
  - a workout near midnight lands in the right week in a non-UTC time zone;
  - an exercise without a template, or a full-body or cardio exercise, isn't counted;
  - months are used past 104 weeks.
- **MCP:** with no `series`, the output is unchanged; with it, each point's values line up with `groups`.
- **View:** the grid renders a row per group and a column per period, and isn't drawn for an empty range. Follow whatever pattern the existing component tests use.

## Left to the builder

- The new function's name and return shape.
- Where the period helpers live once `timeByPeriod` and the new function both use them.
- The exact dot sizes, gaps and label positions.
- The component and CSS file names.
