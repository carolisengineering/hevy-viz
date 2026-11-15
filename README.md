# Training Log for Hevy

Interactive charts of your full [Hevy](https://www.hevyapp.com/) workout history, with no 3-month or 1-year limit. Built with React, TypeScript and D3.

![Training Log overview, with the sample data](docs/screenshot.png)

## Features

- **Every exercise you've logged,** each charted by the measure its type supports:
  - estimated 1RM (Epley formula, best working set per session) for weight-and-reps lifts;
  - heaviest set for weighted exercises;
  - most reps for bodyweight ones;
  - longest time for timed ones;
  - longest distance for cardio.
- **Overview:**
  - your main lifts as a tracklist, with PRs starred;
  - consistency, as sessions this month against your monthly average, plus a year of training days;
  - balance across muscle groups;
  - your latest workouts.
- **Exercises:** search, filter by kind and sort hundreds of exercises, with a page and progress chart for each.
- **Balance:** working sets per week for every muscle group and muscle, with under-trained groups flagged.
- Date ranges (90 days / 1 year / all time) that apply to every view.
- kg or lb, remembered per browser.
- A crosshair tooltip with keyboard support (focus the chart, then use ←/→), plus a table view of every chart.
- Light and dark mode, and a layout that works on phones.
- Works without an account, using a generated sample dataset.

## Quick start

```bash
npm install
npm run dev
```

The repo includes a generated sample dataset (`public/data/sample.json`), so the dashboard works right away. `npm run sample` regenerates it.

### Use your own data

Requires Hevy Pro. Create an API key at <https://hevy.com/settings?developer>, then:

```bash
HEVY_API_KEY=your-key npm run sync   # → data/hevy.json (git-ignored, never built into dist/)
npm run dev
```

If `hevy.json` exists the dashboard uses it; otherwise it falls back to the sample.

## Architecture

```
src/core/                   Pure logic, no DOM or fetch; unit tested
  types.ts                  Shapes of the Hevy API data
  dataset.ts                Checks on loaded data; the day ranges end on
  dates.ts                  Timestamps → local calendar days (YYYY-MM-DD)
  ranges.ts                 90 days / 1 year / all time, and filtering by them
  progress.ts               Each exercise's measure, best set per day, PRs, range summaries
  consistency.ts            Sessions and sets per day, monthly sessions, the week grid
  balance.ts                Working sets per week by muscle and by muscle group
  muscles.ts                Muscle → group, overview side and label
  metrics.ts                Estimated 1RM (Epley), weekly sets, exercise frequency
src/hooks/                  Load the dataset; build the training model once; routing; remembered settings
src/views/                  Overview (tracklist, consistency, balance, log), Exercises, an exercise page, Balance
src/components/             Header, segmented controls, drawn SVG marks (ink.tsx), bars, table, empty state
src/charts/                 D3 progress chart: React wrapper + draw steps (progressDraw.ts)
src/styles/                 Palette tokens (light and dark) and the notebook base styles
src/format.ts               Unit- and measure-aware formatting (kg/lb, times, distances, dates)
src/App.tsx                 Header, range, unit and the view for the current route
plugins/personal-data.ts    Vite: serves data/hevy.json in dev, blocks it from builds
scripts/sync-hevy.ts        Hevy API → data/hevy.json (paginated)
scripts/retry.ts            When to retry a rate-limited (429) request
scripts/generate-sample.ts  Seeded, realistic demo data
```

**How data flows**

1. `useDataset` loads `data/hevy.json`, or the sample if you haven't synced, and drops any workout whose start time can't be read.
2. `useTraining` builds the progress index for every exercise, the per-day training load and the main lifts, in one pass per dataset.
3. `App.tsx` reads the route from the URL hash (`#/`, `#/exercises`, `#/exercises/<id>`, `#/balance`) and hands the training model, range and unit to that view. Changing the range, unit or view only filters and formats.

**Rules the code follows**

- `src/core` has no browser dependencies, so a future MCP server can reuse it.
- A day is a `YYYY-MM-DD` string in the viewer's time zone. Core functions take the time zone as a parameter instead of assuming one.
- Date ranges end today. The sample is a fixed snapshot, so its ranges end on its last workout day.
- Personal data stays on your machine: `data/` is git-ignored, only the dev server serves it, and `npm run build` fails if a copy turns up in `public/`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run browser tests (Playwright) on desktop, phone-sized and dark-mode Chromium; starts the dev server itself |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Type-check and build to `dist/` |
| `npm run sync` | Pull your Hevy data |
| `npm run sample` | Regenerate sample data |

The browser tests need Playwright's Chromium once: `npx playwright install --only-shell chromium`. Each test serves its own data, so your synced `data/hevy.json` never affects the results.

## Roadmap

- [ ] Weekly sets per muscle group (heatmap)
- [ ] Training calendar
- [ ] Apple Health overlay (body weight, resting HR)
- [ ] Incremental sync via `/v1/workouts/events`
- [ ] MCP server reusing `src/core`
