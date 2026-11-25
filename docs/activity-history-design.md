# Activity history (Apple Health, part 1): design

**Status:** proposed 2026-11-25.
**Scope:** one PR. The first of four Apple Health projects (see Later projects). Replaces the roadmap item "Apple Health overlay (body weight, resting HR)".
Choices are the author's unless marked as the owner's.

## Why

The owner has years of Apple Health data but can only usefully look about a year back in the Health app *(owner, 2026-11-25)*. That is the same problem the Training Log solved for Hevy, whose charts also stop at a year. This extends the dashboard's first principle ("all of the history") from lifting to everyday activity and sleep.

It adds one question to the four in PRODUCT.md: **"How active am I, and how am I sleeping, over the years?"**

## Goals

- `npm run health -- <path to export.zip>` reads an Apple Health export and writes `data/health.json`: one row per day with steps, walking and running distance, active calories, exercise minutes and time asleep.
- A new **Activity** tab, after Calendar, shows those five measures month by month across the whole history *(owner: layout A, with B as the detail page, 2026-11-25)*.
- Tapping a measure opens its detail page: one large month-by-month chart, with each year's average marked, and a table of yearly averages.
- The numbers match what the Health app shows for the same days (see Acceptance).

## Non-goals

- Workouts from Apple Health (project 3), the recent-stretch report card (project 2), and sleep or activity against lifting (project 4).
- Heart rate, body weight, nutrition and every other Health type. The importer is built so a type can be added later, but this PR adds only the five.
- An automatic feed from the phone. The owner chose a manual export to start *(owner, 2026-11-25)*. Data is current to the last import.
- MCP tools for this data.
- "Compare years" (one line per year, January to December). It may become a switch on the detail page later.

## Anti-goals

- **Double counting.** The iPhone and the Watch both record steps, distance and sleep, and the export keeps both. Adding them up would roughly double the figures. A number that disagrees with the Health app is a failure, even if the chart looks fine.
- **Zeros where nothing was recorded.** A day or month with no data is empty, not zero. Exercise minutes before the owner's Watch are missing, not "0 min".
- **Medical or unrelated data leaving the export.** The export also holds clinical records (`ClinicalRecord`, `export_cda.xml`) and many other types. The importer reads only what it needs; nothing else reaches `data/health.json`, logs, or the console.
- **Personal health data in a build or in git.** Same rules as `data/hevy.json`.

## What an export looks like

From a structural look at the owner's export on 2026-11-25 (counts and date ranges only, no values). The repo is public, so this section keeps to the format, not the owner's figures.

- The zip is about 140 MB; `apple_health_export/export.xml` is about 3 GB uncompressed. A streaming read of the whole file takes well under a minute.
- Every record's dates look like `2025-03-04 07:15:00 -0600`: local wall time with its UTC offset.
- **Steps** (`HKQuantityTypeIdentifierStepCount`) and **distance** (`HKQuantityTypeIdentifierDistanceWalkingRunning`) go back years before the Watch, from one or more iPhones, then from the iPhone and the Watch together. Each record's `device` attribute names the model (`model:iPhone`, `model:Watch`). Manual entries and other apps (Strava, for example) may have no device.
- **Daily ring totals** (`ActivitySummary`, one per day) have `activeEnergyBurned`, `activeEnergyBurnedUnit` and `appleExerciseTime`. They start before the Watch did, with iPhone-only figures for that stretch.
- **Sleep** (`HKCategoryTypeIdentifierSleepAnalysis`) comes from the Watch and the iPhone. Values: `AsleepCore`, `AsleepDeep`, `AsleepREM`, `AsleepUnspecified`, `Awake`, `InBed`. Sleep records have no `device` attribute; the source name tells them apart.

## Approaches

The owner picked approach 1 *(owner, 2026-11-25)*.

1. **A command on the Mac, like `npm run sync` (chosen).** It reads the zip and writes a small `data/health.json`, which the dev server serves the way it serves `data/hevy.json`. It fits how the project handles data, the phone and the laptop see the same file, the de-duplication rules can be tested without the real export, and the MCP server could read the file later. Cost: after each export, AirDrop the zip to the Mac and run one command.
2. **Drop the zip onto the dashboard.** No command, but each browser keeps its own copy, a phone browser may not cope with 3 GB, Claude can't reach the data, and it departs from how the rest of the project stores data.
3. **A third-party converter or export app.** Someone else handles Apple's format, but it adds a tool or subscription to depend on and gives up control of de-duplication, which is the part most likely to make the numbers wrong.

## The import

### Command

- `npm run health -- ~/Downloads/export.zip`. With no path, print a usage line and exit 1.
- Read `apple_health_export/export.xml` straight from the zip as a stream. Don't unpack the zip to disk, and don't hold the whole file in memory.
- Read only top-level `Record` elements of the four types below and `ActivitySummary` elements. Skip everything else without inspecting it. Never open `export_cda.xml` or the `clinical-records` folder.
- Print progress (the record count, every few seconds) and a summary at the end: days written, first and last day, and the date range of each measure. Never print measured values or source names.
- Write the file atomically (a temp file then rename, like `writeDatasetAtomically` in `scripts/sync.ts`), so the dev server never sees half a file.
- Each import replaces `data/health.json` entirely. The export always holds the full history, so there is nothing to merge.

### Days

- A record belongs to the local day of its own timestamp (the wall time in the export, ignoring the offset). That is how the Health app counts it, and travel doesn't shift days.
- A record that spans midnight is split between the days in proportion to the time on each side.

### Steps and distance (de-duplication)

- Group records by source (`sourceName`), then for each source total each local hour. A record spanning several hours is split in proportion to the time in each.
- **For each hour, keep the largest source total, not the sum.** When the phone and the Watch are both carried they count the same steps, so the larger of the two is the honest figure. When only one is carried, it's the only one.
- A day's steps or distance is the sum of its hours. A day with no records has no value (not zero).
- Distance is stored in kilometers. Convert from each record's `unit` (`km` or `mi`).

### Active calories and exercise minutes

- Take them from `ActivitySummary` (`activeEnergyBurned`, `appleExerciseTime`). Apple has already de-duplicated these; they are the ring figures the owner sees.
- **Only on days the Watch was worn.** A day gets calories and exercise minutes only if it has at least one step or distance record whose `device` names `model:Watch`. On other days the ring total is 0 exercise minutes and a rough iPhone calorie estimate, which would read as "did nothing" and drag the averages down; those days have no value instead *(owner, 2026-11-25: "your pick", over keeping them to match the Health app on every day)*. This also leaves out everything before the Watch. (The brainstorm mockup drew a faint dotted line for pre-Watch calories; that was illustration, and this rule wins.)
- "Before your Watch" on the Activity tab means before the first day the Watch was worn.
- Convert energy to kilocalories from `activeEnergyBurnedUnit` if it isn't already.

### Time asleep

- Use only the asleep values (`AsleepCore`, `AsleepDeep`, `AsleepREM`, `AsleepUnspecified`). Ignore `InBed` and `Awake`.
- Merge overlapping intervals across all sources (a union), so the Watch and the phone recording the same night count it once.
- A night belongs to the day you wake up: an interval counts toward day D if it ends between 18:00 on D−1 and 18:00 on D. An afternoon nap therefore counts toward that same day. *(Author's call: it matches how the Health app files a night under the morning.)*
- A day's sleep is the total merged asleep time, in minutes. A day with no asleep intervals has no value.

### File shape

`data/health.json` lives outside `public/`, is git-ignored, and is served in development only, exactly like `data/hevy.json` (extend `plugins/personal-data.ts`):

```json
{
  "source": "apple-health",
  "imported_at": "2026-11-25T20:14:00.000Z",
  "export_date": "2026-11-25",
  "days": [
    { "date": "2026-11-24", "steps": 8412, "distance_km": 5.9, "active_kcal": 512, "exercise_min": 41, "sleep_min": 418 }
  ]
}
```

- Days are sorted by date, ascending. A missing measure is left out of the row (not `null`, not `0`). Days with no measures at all are left out.
- Round steps, calories, exercise minutes and sleep minutes to whole numbers, and kilometers to two decimals.
- `export_date` comes from the export's `ExportDate` element. The dashboard shows it as "Apple Health data as of …".
- The `source` field allows a generated sample (`"sample"`), as with `HevyDataset`.

## The Activity tab

### Main screen (layout A)

- A tab labeled **Activity** after Calendar, at `#/activity`.
- Five rows, in this order: Steps per day, Distance per day, Exercise per day, Active calories per day, Sleep per night.
- All rows share one time axis: monthly averages over the selected range. The tab follows the header's range control like the other views; All time reaches back to the first day of health data.
- **A monthly average is the average over the days that have a value**, not over calendar days. A month with no values is a gap in the line, not a dip to zero. Where a measure hasn't started yet (exercise minutes before the Watch), the row says so in words, as in the mockup ("before your Watch").
- Each row shows a dashed line at the average over the selected range and, on the right, the latest complete month's average.
- The row label and line are a link to the measure's detail page.
- If there is no `data/health.json` and the Hevy data is real, the tab shows an empty state explaining `npm run health` and how to export from the Health app (see Sample data).
- A line under the heading says when the data is from: "Apple Health data as of Nov 25, 2026".

### Detail page (layout B)

- `#/activity/steps` (also `distance`, `exercise`, `calories`, `sleep`), with a back link to the main screen.
- One large chart of monthly averages over the selected range, with a short horizontal mark per calendar year at that year's average (in the accent color, as in the mockup).
- Below it, a table: one row per year with the yearly average and the number of days with data. A partial year is labeled as such ("2026, to Nov 25").
- Like every chart in the dashboard: keyboard-operable with a crosshair tooltip (month and value), and a table view.

### Units and formatting

- Distance follows the header's unit switch: kg means kilometers, lb means miles.
- Steps as whole numbers with thousands separators; calories as whole kcal; exercise in minutes; sleep in hours and minutes ("7h05").
- The visual language is the existing one: DESIGN.md's palette, type and drawn marks; the mockup in the brainstorm used it.

### Sample data

The public demo has no Apple Health data. `npm run sample` also writes `public/data/sample-health.json`: two years of plausible daily values ending on the sample's last day (2026-11-13), with a Watch start partway through so the "before your Watch" state shows. *(Author's call: PRODUCT.md names demo visitors as users, and an empty tab would hide the feature from them.)*

- **The health sample is used only when the Hevy data is the sample too** (the demo, or a fresh clone). With real Hevy data and no `data/health.json`, the tab shows the empty state, never invented health figures next to real lifting. *(Author's call, from the builder check.)*
- Ranges end the way `rangeEndDay` already decides for the Hevy data: today for real data, the sample's last day for the sample. The header's existing "Sample data" label then covers both.

## Code layout

- `scripts/health/`: the importer. The streaming read and the per-type aggregation are separate, so the aggregation (de-duplication, days, nights, summaries) is pure and tested with small hand-written XML or record lists, never the real export.
- `src/core/health.ts`: pure functions shared by the views (monthly averages over days with values, yearly averages, range filtering). No DOM, like the rest of `src/core`, so a later MCP tool can use them.
- `src/views/Activity.tsx` and `src/views/ActivityDetail.tsx`, with the route added to `useRoute`.
- A loader hook alongside `useDataset`, so Hevy data and health data load independently; a missing health file never breaks the other tabs.

## Acceptance

- Unit tests cover: an hour where the phone and the Watch both have steps (the larger wins, no sum); a record spanning two hours and one spanning midnight; distance in miles converted to km; ring totals before the first Watch day, on a Watch day, and on a later day with no Watch record (no value); overlapping Watch and phone sleep (counted once); a nap; `InBed` and `Awake` ignored; a day with no data left out; atomic write; a non-zip or a zip without `export.xml` exits 1 with a plain message.
- An end-to-end test drives the Activity tab and a detail page on the sample.
- **A checkpoint with the owner, after the importer and before any of the tab is built.** The owner runs `npm run health` on the real export. Claude, locally and without committing anything, prints that day's figures for five days spread over the years, and the owner compares them with the Health app: steps and distance within 3%, exercise minutes and active calories exact on days the Watch was worn, sleep within 10 minutes. The PR records only whether each check passed and by how much it was off.
- If a check misses, the de-duplication rules may change (a finer bucket than an hour, or preferring the Watch over the phone), so keep each rule in one small pure function that's easy to swap. *(Author's call, from the builder check: the "largest source per hour" and "union of asleep time" rules approximate what Apple does, and only the real data can show how closely.)*
- `npm run health` on the real export finishes in under two minutes on the owner's laptop, measured at the same checkpoint.

## Later projects

In order *(owner, 2026-11-25)*:

2. **Recent stretch:** a report card of the last four weeks against the owner's usual.
3. **All activity on the calendar:** every Health workout on the Training calendar, de-duplicated across apps and against Hevy.
4. **Sleep and activity against lifting:** only if the data can support honest conclusions.

The README roadmap item "Apple Health overlay (body weight, resting HR)" is replaced by these. Body weight and resting heart rate are in the export too and can join a later project.

## Left to the builder

- How the zip is read as a stream (a small library or the system `unzip -p`), as long as nothing is unpacked to disk and it works on macOS.
- The streaming XML parser, as long as it is small and maintained.
- How progress is printed.
- Chart details within DESIGN.md: line weights, tooltip text, how the "before your Watch" note is drawn.
- The sample generator's curves.
