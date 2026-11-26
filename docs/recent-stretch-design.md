# Recent stretch (Apple Health, part 2): design

**Status:** proposed 2026-11-25. Approved 2026-11-25.
**Scope:** one PR. The second of four Apple Health projects (see `docs/activity-history-design.md`, Later projects).
Choices are the author's unless marked as the owner's.

## Why

The owner wants to see where their recent stretch sits against their long-term normal, to understand trends *(owner, 2026-11-25)*. It is not a readiness check for tomorrow's workout. The owner exports from Apple Health now and then, every week or two, so "recent" means the weeks before the last export, and that's fine for this purpose *(owner)*.

The Activity tab already shows the long view (monthly averages, the range's average, the latest complete month), but you have to work out "am I above or below my usual?" yourself. This card says it directly.

## Goals

- One card at the top of the Activity tab: the last four weeks against the past 12 months, for training days and the five Health measures *(owner: Health plus training consistency; past 12 months as "usual", "ok for now"; the card at the top of the Activity tab)*.
- Each row reads as a plain comparison: "12% below", "about the same", "25 min less".
- Honest when the data can't support a comparison: "not enough data", never a made-up number.

## Non-goals

- A readiness or "how hard to push tomorrow" signal *(owner)*. So no heart rate variability, no resting heart rate, no last-night sleep.
- Lifting performance (volume, estimated strength) against the usual *(owner chose training consistency only)*.
- Other baselines (all time, the same weeks last year, two columns). "Past 12 months" may change later *(owner: "ok for now")*.
- Changing the importer or `data/health.json`. The card reads what project 1 writes.
- An MCP tool. Health data stays out of MCP for now, as in project 1. The comparison is a pure function in `src/core`, so a tool can use it later.
- The card on the Overview or on the measure detail pages.

## Anti-goals

- Numbers that look current when they aren't. The card always says which four weeks it covers.
- A comparison against a usual that has too little data behind it (the first months with a Watch, a fresh Hevy account).
- Judging the owner. More exercise or less sleep isn't marked good or bad; the words carry the direction.

## Approaches

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | A pure function in `src/core/health.ts` computes the six rows; a card component on the Activity tab shows them. | Fits how the tab already works. The training row can use the Hevy data the app already has. |
| B | Work out the comparison during `npm run health` and save it in `health.json`. | The importer doesn't read Hevy data, and saved numbers would go stale whenever Hevy is synced. |
| C | An MCP tool ("how's my last month?"). | Project 1 kept health out of MCP. Left for later; A makes it easy. |

Placement was also weighed *(owner chose the card at the top of the Activity tab, on the author's recommendation)*: a box on the Overview would put health numbers up to two weeks old beside current lifting numbers, and folding the comparison into each Activity row would put two different "usuals" on one row (the dashed line is the picked range's average).

## The dates

- **The stretch** is 28 days (four whole weeks, so each weekday appears four times, which matters for steps). It ends on the last complete day: the earlier of `healthEndDay(...)` (project 1's rule) and the day before `export_date`. The export day is cut short by the export itself, so it's left out.
- **The usual** is the 365 days just before the stretch. The stretch is never compared with itself.
- **The training row uses the same 28 days and 365 days** as the Health rows, even when Hevy was synced more recently, so every row describes the same weeks. Lifting since the last export counts once the owner exports again.
- **The range picker doesn't affect the card.** The card's heading says this by naming its dates.

Example, for an export on Nov 21: the stretch is Oct 24 – Nov 20, and the usual is Oct 24 of the previous year – Oct 23.

## The numbers

- **Health measures:** the average per day over the days that have a value, in the stretch and in the usual separately. This is the rule the Activity tab uses (`windowAverage`). A day without the Watch isn't zero calories.
- **Training:** training days per week. A training day is a local day with at least one workout (`training.days`). Stretch: training days ÷ 4. Usual: training days ÷ (days in the usual span ÷ 7).
- **Not enough data:** a Health measure needs at least 14 days with a value in the stretch and 90 in the usual. Training needs Hevy history (from `training.firstDay`) covering the whole stretch and at least 90 days of the usual; the usual is then counted only from `firstDay`. Otherwise the row says "not enough data" in place of the comparison and still shows the recent value if there is one.
- **Hevy not synced through the stretch:** if `synced_at`'s local day is before the stretch's last day (real Hevy data only), the training row says "sync Hevy to include" instead of a comparison, since missing workouts would read as rest days. *(Author's call.)*

## How the difference reads

| Row | Recent value | Comparison |
|---|---|---|
| Training | "2.5 days a week" (one decimal) | "usual 3.4" (one decimal). Small counts look dramatic as percentages. |
| Steps, Distance, Active calories, Exercise | the daily average, formatted as on the Activity tab (`formatHealth`; distance in km or mi) | the percentage difference from the usual, rounded to a whole number: "12% below", "20% above". Under 5% either way: "about the same", since four-week averages wobble that much on their own. |
| Sleep | "7 h 05 m" | the difference in minutes, rounded to the nearest 5: "25 min less", "10 min more". Under 10 minutes: "about the same". |

The percentage is (recent − usual) ÷ usual. The 5% and 10-minute cutoffs apply to the unrounded difference, so 4.9% is "about the same" and 5.0% is "5% above". A usual of zero is "not enough data". *(Author's call: the thresholds are a starting point; they are constants in one place.)*

## The card

```
Last 4 weeks  Oct 24 – Nov 20, vs the past 12 months
Training     2.5 days a week       usual 3.4
Steps        7,900 a day           12% below
Distance     3.6 mi                10% below
Active cal   520 kcal              about the same
Exercise     38 min                20% above
Sleep        7 h 05 m              25 min less
```

- At the top of the Activity tab, above "Apple Health data as of …" and the rows. Shown only when health data has loaded (not in the empty, loading or error states).
- A real table with a caption, so screen readers read each row as name, value, comparison. Rows aren't links. *(Author's call: the rows below already link to each measure.)*
- Drawn in the Training Notebook style from DESIGN.md, the same ink for every row; no red or green.
- On a phone the card spans the width and keeps its three columns; the comparison column may wrap to two lines.
- **Real Health data beside the Hevy sample** (Health imported, Hevy never synced): the training row is left out, so sample workouts never sit beside real health numbers. This follows project 1's rule that sample and real data aren't mixed.
- **The demo** (both samples): the card shows all six rows. The sample health data starts 2024-11-14 with the Watch from 2025-06-02, so every row has enough data.

## Code layout

- `src/core/health.ts`: `recentStretch(...)` returns the stretch and usual dates plus one entry per row: the recent value, the usual value, and a status (`compared`, `not-enough-data`, `not-synced`). Pure, no DOM, no formatting.
- `src/format.ts`: turns an entry into the comparison text above.
- A card component in `src/components/`, rendered by `src/views/Activity.tsx`.
- README and PRODUCT.md: one line each for the card; the README roadmap item "Recent stretch report card" checked.

## Acceptance

- Unit tests for `recentStretch`: the stretch ends the day before the export date; ends earlier when `healthEndDay` is earlier; a missing day isn't counted as zero; 13 days of data in the stretch is "not enough data" and 14 is compared; the same for 89 and 90 days in the usual; training days counted once per day with two workouts; the training usual counted only from `firstDay`; Hevy synced before the stretch's last day gives `not-synced`.
- Unit tests for the text: 4.9% is "about the same", 5% is "5% above"; sleep 9 minutes is "about the same", 12 minutes is "10 min more"; distance in mi and km.
- An end-to-end test on the demo checks the card's dates and six rows on desktop and phone, and that it's absent in the empty state. One test with real-looking Health data beside the Hevy sample checks that the training row is left out.
- A unit test runs `recentStretch` over the two sample files and checks every row is compared, so the demo claim above stays true if the samples change.

## Left to the builder

- The card's exact spacing, type sizes and caption wording, within DESIGN.md.
- Function and component names.
- Whether the comparison text lives in `src/format.ts` or beside the card.
