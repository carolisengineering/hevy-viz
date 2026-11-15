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
scripts/sync-hevy.ts      Hevy API → JSON (paginated, retries on 429)
scripts/generate-sample.ts Seeded, realistic demo data
src/core/metrics.ts       Pure metric functions (no DOM) — unit tested
src/charts/               D3 charts rendered inside React components
src/App.tsx               Filters, stat tiles, chart/table views
```

`src/core` has no browser dependencies, so a future MCP server can reuse the same metrics.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run unit tests (Vitest) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run sync` | Pull your Hevy data |
| `npm run sample` | Regenerate sample data |

## Roadmap

- [ ] Weekly sets per muscle group (heatmap)
- [ ] Training calendar
- [ ] Apple Health overlay (body weight, resting HR)
- [ ] Incremental sync via `/v1/workouts/events`
- [ ] MCP server reusing `src/core`
