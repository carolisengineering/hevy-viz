# Training dashboard for Hevy

Interactive charts of your full [Hevy](https://www.hevyapp.com/) workout history, with no 3-month or 1-year limit. Built with React, TypeScript and D3.

![Dashboard screenshot](docs/screenshot.png)

## Features

- **Estimated 1RM trend** per lift (Epley formula, best working set per session), with PRs marked
- Date ranges (90 days / 1 year / all time) and an exercise picker
- Crosshair tooltip with keyboard support (focus the chart, then use ←/→), plus a table view
- Light and dark mode
- Works without an account using a generated sample dataset

## Quick start

```bash
npm install
npm run sample   # generate demo data → public/data/sample.json
npm run dev
```

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
  metrics.ts                Estimated 1RM, PRs, weekly sets, exercise frequency
src/hooks/                  Load the dataset; derive what the 1RM view shows
src/components/             Pickers, stat tiles, table, empty state
src/charts/                 D3 chart: React wrapper + draw steps (e1rmDraw.ts)
src/format.ts               Display formatting shared by table, tiles and chart
src/App.tsx                 Composes the dashboard
plugins/personal-data.ts    Vite: serves data/hevy.json in dev, blocks it from builds
scripts/sync-hevy.ts        Hevy API → data/hevy.json (paginated)
scripts/retry.ts            When to retry a rate-limited (429) request
scripts/generate-sample.ts  Seeded, realistic demo data
```

**How data flows**

1. `useDataset` loads `data/hevy.json`, or the sample if you haven't synced, and drops any workout whose start time can't be read.
2. `useE1rmView` builds every lift's 1RM history in one pass, once per dataset. Changing the lift or range is then a lookup and a filter.
3. `App.tsx` passes the result to the components and the chart.

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
| `npm run lint` | Lint with oxlint |
| `npm run build` | Type-check and build to `dist/` |
| `npm run sync` | Pull your Hevy data |
| `npm run sample` | Regenerate sample data |

## Roadmap

- [ ] Weekly sets per muscle group (heatmap)
- [ ] Training calendar
- [ ] Apple Health overlay (body weight, resting HR)
- [ ] Incremental sync via `/v1/workouts/events`
- [ ] MCP server reusing `src/core`
