# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: the owner, a long-time Hevy user.** More than four years of logged training (1,432 workouts since August 2022, 488 distinct exercises). Reviews it on a laptop at home and checks it on a phone at the gym, about equally, so both are first-class.
- **Later: other Hevy Pro lifters** who clone the repo and run it on their own data. It should stay usable by them without big changes, but the owner's needs come first.
- **Demo visitors** see the public build with generated sample data (6 barbell lifts, two years).

## Product Purpose

Shows a lifter's full Hevy history, and their activity and sleep from Apple Health, with no 3-month or 1-year limit, so they can answer five questions:

1. **Am I getting stronger?** Progress on specific exercises over time: estimated 1RM, best sets, PRs.
2. **Am I training consistently?** Frequency, gaps, and how one period compares to another.
3. **Is my training balanced?** Volume by muscle group and neglected areas.
4. **What's the history of this exercise?** Find any exercise, whatever its type, and see its history.
5. **How active am I, and how am I sleeping, over the years?** Steps, distance, active calories, exercise minutes and time asleep, from an Apple Health export.

Success: the owner can answer any of these in seconds, on either device, without the dashboard hiding most of their data.

## Positioning

Hevy's own charts are limited by time window and focus on one exercise at a time. This works from the complete exported history, stays on the owner's machine, and treats every exercise type as worth charting.

## Operating Context

- Data comes from `npm run sync` (Hevy public API, needs Hevy Pro) into `data/hevy.json`, read by a local dev server. It is a snapshot, refreshed when the owner runs sync.
- Everyday activity and sleep come from a manual Apple Health export, imported with `npm run health` into `data/health.json`. It is current to the last import, and is read the same way as the Hevy file.
- The public demo uses `public/data/sample.json` and made-up health data in `public/data/sample-health.json`, fixed snapshots ending 2026-11-13.

## Capabilities and Constraints

- **Exercise types in real data:** weight and reps (182 with 1RM estimates, plus 47 always above 12 reps, where Epley estimates are unreliable), reps only/bodyweight (163), duration (54), and distance, carry or cardio types (about 40). Hevy template types: `weight_reps`, `reps_only`, `duration`, `distance_duration`, `short_distance_weight`, `weight_duration`, `bodyweight_assisted`.
- Each exercise template has a primary muscle group and secondary muscle groups.
- **Units:** the data is in kilograms; no unit preference exists yet.
- `src/core` is pure, has no DOM, and is shared with a planned MCP server.
- Personal data never ships in a build.
- **Dates:** days are local to the viewer's time zone, and ranges end today (the sample ends on its last workout). The Activity tab's ranges end on the Apple Health export date when that is earlier (or always, for an imported export beside the Hevy sample).
- **Tests:** Vitest unit tests and Playwright browser tests (`e2e/`) gate changes.
- **Undecided:** whether a personal build is ever deployed, and which time zone scripts use.

## Brand Commitments

- Name in use: "Training Log" (the header wordmark and the browser tab title).
- Visual system: the Training Notebook palette, type and drawn marks are recorded in DESIGN.md.
- American spelling in all UI copy.

## Evidence on Hand

- Real data: `data/hevy.json` (private, git-ignored; never quote individual workouts in public artifacts).
- Demo data: `public/data/sample.json`.
- No testimonials, users, or metrics beyond the owner's own data. Don't invent any.

## Product Principles

1. **All of the history, every exercise.** Nothing the owner logged should be unreachable because of a cap or an exercise type.
2. **Honest numbers.** Estimates are labeled as estimates, unreliable ones aren't shown as fact, and empty periods look empty instead of being papered over.
3. **Answer first, then detail.** Each view leads with the answer to its question and lets you drill into sessions and sets.
4. **Equal on phone and laptop.** Neither is a degraded version of the other.
5. **Private by default.** The owner's data stays on their machine.

## Accessibility & Inclusion

- Charts are keyboard-operable, and each has a table alternative.
- Light and dark mode.
