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
- lb by default, or kg; remembered per browser.
- A crosshair tooltip with keyboard support (focus the chart, then use ←/→), plus a table view of every chart.
- Light and dark mode: follow the system, or pick one in the header (remembered per browser).
- A layout that works on phones.
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

`npm run sync` exits with a code that says why it failed. Kingdom Keys (a home server) runs it nightly, discards the output and reads only this code, so keep the values stable:

| Exit code | Meaning |
|---|---|
| 0 | Synced |
| 1 | Anything else (including no `HEVY_API_KEY` set) |
| 20 | Hevy rejected the key (401 or 403) |
| 21 | Still rate-limited after retrying, or Hevy asked for a long wait |
| 22 | Couldn't reach Hevy (offline, DNS or connection failure) |
| 23 | Hevy answered with some other error |
| 24 | Couldn't write `data/hevy.json` |

## Ask Claude about your training

A small local [MCP](https://modelcontextprotocol.io) server lets Claude answer questions like "is my squat still going up?", "what have I neglected this month?" or "how does this year's bench compare with last year's?". It reads your synced `data/hevy.json` and computes every figure with the same `src/core` code as the dashboard, so an answer in chat matches what the dashboard shows.

### Setup

**Claude Code:**
1. Run `npm install`, then `npm run sync` (see [Use your own data](#use-your-own-data)).
2. Open Claude Code in this folder.
3. Approve the `hevy-viz` server when asked. The committed `.mcp.json` registers it.

**From another folder:**

```bash
claude mcp add hevy-viz -- /absolute/path/to/hevy-viz/node_modules/.bin/tsx /absolute/path/to/hevy-viz/mcp/server.ts
```

**Claude desktop app:** add the server to `claude_desktop_config.json` and restart the app:

```json
{
  "mcpServers": {
    "hevy-viz": {
      "command": "/absolute/path/to/hevy-viz/node_modules/.bin/tsx",
      "args": ["/absolute/path/to/hevy-viz/mcp/server.ts"],
      "env": { "HEVY_VIZ_TZ": "America/Chicago" }
    }
  }
}
```

Use the repo's own `tsx`, as above, rather than `npx tsx`. Outside this folder, `npx` can't find it and may try to download it.

### What it can answer

| Tool | Answers |
|---|---|
| `find_exercises` | Which exercises you've logged, searched by name, with sessions, last done and all-time best |
| `exercise_progress` | How one exercise is going: best ever, latest, change, PRs, weekly or monthly bests and long breaks |
| `main_lifts` | Your main lifts, as on the overview: best set, change, latest estimated 1RM and PRs |
| `consistency` | Sessions this month against your average, sessions per week, weeks trained and your longest break, and training time (total and per training day, optionally week by week) |
| `balance` | Working sets per week for each muscle group (light ones flagged) and your busiest muscles |
| `recent_workouts` | Your training log: the latest workouts, or every workout in a date range (up to 40), with each workout's length and each exercise's top set |

Every tool that looks at a period takes `90d`, `1y` (the default) or `all`, or your own `from` and `to` dates, so Claude can compare this year with last.

### Good to know

- **Freshness:** answers are as current as your last `npm run sync`. Every answer carries the sync time, and Claude mentions it when the data is more than a few days old. A sync while a conversation is open is picked up on the next question.
- **Time zone:** days are counted in `America/Chicago` unless you set `HEVY_VIZ_TZ` to an [IANA time zone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), for example `export HEVY_VIZ_TZ=Europe/Berlin` before starting Claude Code. A mistyped zone stops the server with a message saying so. The dashboard uses your browser's time zone, so the two agree when both are the same zone.
- **Other data:** `HEVY_VIZ_DATA` points the server at another file. For example, `HEVY_VIZ_DATA=public/data/sample.json` tries it on the sample. The server never falls back to the sample on its own.
- **Read-only:** it never changes anything in Hevy and never reads `HEVY_API_KEY`.
- **Privacy:** the server runs on your machine and makes no network calls, but whatever it returns becomes part of your conversation with Claude and is sent to Anthropic like anything else you type. Answers are kept small, with summaries and short lists rather than raw workouts, but asking for a month of workouts sends a month of workouts.

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
  training.ts               The training model, main lifts, the log, and the Exercises list's search
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
mcp/tools.ts                MCP tool handlers over src/core: no SDK, no I/O
mcp/server.ts               MCP server: stdio, tool registration, loading and reloading data/hevy.json
```

**How data flows**

1. `useDataset` loads `data/hevy.json`, or the sample if you haven't synced, and drops any workout whose start time can't be read.
2. `useTraining` builds the training model (`src/core/training.ts`) once per dataset: the progress index for every exercise and the per-day training load.
3. `App.tsx` reads the route from the URL hash (`#/`, `#/exercises`, `#/exercises/<id>`, `#/balance`) and hands the training model, range and unit to that view. Changing the range, unit or view only filters and formats.

**Rules the code follows**

- `src/core` has no browser or Node dependencies, so the dashboard and the MCP server share it.
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
| `npm run mcp` | Start the MCP server by hand, to check it starts (Claude Code starts it itself) |

The browser tests need Playwright's Chromium once: `npx playwright install --only-shell chromium`. Each test serves its own data, so your synced `data/hevy.json` never affects the results.

## Roadmap

- [ ] Weekly sets per muscle group (heatmap)
- [ ] Training calendar
- [ ] Apple Health overlay (body weight, resting HR)
- [ ] Incremental sync via `/v1/workouts/events`
- [x] MCP server reusing `src/core`
