import type { Page } from "@playwright/test";
import type { HevyDataset, HevyExerciseTemplate, HevySet } from "../src/core/types.ts";
import { expect, sample, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

const range = (label: string) => `button[role=radio]:has-text("${label}")`;
const rows = (page: Page) => page.locator("table.exercise-list tbody tr");
const search = (page: Page) => page.getByRole("searchbox", { name: "Find an exercise" });

const set = (fields: Partial<HevySet>, index: number): HevySet => ({ index, type: "normal", weight_kg: null, reps: null, ...fields });
const template = (id: string, title: string, type: string, primary: string): HevyExerciseTemplate => ({
  id,
  title,
  type,
  primary_muscle_group: primary,
  secondary_muscle_groups: [],
});

/** The synced sample plus a reps-only pull-up, a timed plank and a warmup-only band drill in the last three workouts. */
function withOtherKinds(): HevyDataset {
  const data = syncedEndingDaysAgo(1);
  const extras = [
    { exercise_template_id: "pull-up", title: "Pull Up", sets: [set({ reps: 8 }, 0), set({ reps: 10 }, 1)] },
    { exercise_template_id: "plank", title: "Plank", sets: [set({ duration_seconds: 60 }, 0), set({ duration_seconds: 75 }, 1)] },
    { exercise_template_id: "band", title: "Band Pull-Apart", sets: [set({ type: "warmup", reps: 15 }, 0)] },
  ];
  const last = data.workouts.length - 3;
  data.workouts = data.workouts.map((w, i) =>
    i < last ? w : { ...w, exercises: [...w.exercises, ...extras.map((e, j) => ({ ...e, index: w.exercises.length + j }))] },
  );
  data.exercise_templates = [
    ...data.exercise_templates,
    template("pull-up", "Pull Up", "reps_only", "lats"),
    template("plank", "Plank", "duration", "abdominals"),
    template("band", "Band Pull-Apart", "reps_only", "shoulders"),
  ];
  return data;
}

test("lists every sample exercise and opens one with its chart", async ({ page }) => {
  await page.goto("/#/exercises");
  await expect(rows(page)).toHaveCount(sample.exercise_templates.length);

  await page.getByRole("link", { name: "Squat (Barbell)" }).click();
  expect(new URL(page.url()).hash).toBe("#/exercises/squat");
  await expect(page.locator("h2")).toHaveText("Squat (Barbell)");
  await expect(page.locator("path.series-line")).toBeVisible();

  // The sample is a fixed snapshot, so its ranges end on its last workout and never go empty.
  await page.click("text=Show table");
  for (const [label, count] of [["90 days", 21], ["1 year", 92], ["All time", 182]] as const) {
    await page.click(range(label));
    await expect(page.locator(range(label))).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".table-wrap tbody tr")).toHaveCount(count);
  }
});

test("finds an exercise of any kind and labels its measure", async ({ page }) => {
  await serveSynced(page, withOtherKinds());
  await page.goto("/#/exercises");
  await search(page).fill("pull up");
  await expect(rows(page).locator("a")).toHaveText(["Pull Up"]);

  await page.getByRole("link", { name: "Pull Up" }).click();
  await expect(page.locator(".exercise-meta")).toContainText("Most reps");
  // Ten reps every session: a flat line, labeled at its end.
  await expect(page.locator(".end-label")).toHaveText("10 reps");
});

test("filters by kind", async ({ page }) => {
  await serveSynced(page, withOtherKinds());
  await page.goto("/#/exercises");
  await page.getByRole("radio", { name: "Timed" }).click();
  await expect(rows(page).locator("a")).toHaveText(["Plank"]);
});

test("treats search text literally, even with regex characters", async ({ page }) => {
  await page.goto("/#/exercises");
  await search(page).fill("(barbell)");
  await expect(rows(page)).toHaveCount(5);

  await search(page).fill("+");
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("No exercises match “+”")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search(page)).toHaveValue("");
  await expect(rows(page)).toHaveCount(sample.exercise_templates.length);
});

test("an unknown exercise link explains itself and links back to the list", async ({ page }) => {
  await page.goto("/#/exercises/nope");
  await expect(page.getByText("No exercise with that id")).toBeVisible();
  await page.getByRole("link", { name: "All exercises" }).click();
  expect(new URL(page.url()).hash).toBe("#/exercises");
});

test("lists an exercise with no measurable sets and says so on its page", async ({ page }) => {
  await serveSynced(page, withOtherKinds());
  await page.goto("/#/exercises");
  await expect(rows(page).filter({ hasText: "Band Pull-Apart" })).toContainText("No sets to chart");
  await page.getByRole("link", { name: "Band Pull-Apart" }).click();
  await expect(page.getByText("No sets to chart")).toBeVisible();
  await expect(page.locator("path.series-line")).toHaveCount(0);
});

test("skips workouts with unreadable start times instead of failing", async ({ page }) => {
  const broken = { ...syncedEndingDaysAgo(1) };
  const template = broken.workouts[5];
  broken.workouts = [
    ...broken.workouts,
    ...(["not a date", null, ""] as const).map((start_time, i) => ({ ...template, id: `bad-${i}`, start_time: start_time as string })),
  ];
  await serveSynced(page, broken);
  await page.goto("/#/exercises/bench");
  await expect(page.locator("path.series-line")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Skipped 3 workouts with an unreadable start time.");
  await expect(page.locator(".cassette")).toContainText(`${sample.workouts.length} sessions`);
});

test("shows an empty state when the range has no sessions", async ({ page }) => {
  await serveSynced(page, syncedEndingDaysAgo(200));
  await page.goto("/#/exercises/bench");
  await page.click(range("90 days"));

  const empty = page.locator(".empty-state");
  await expect(empty).toContainText("No sessions in this range.");
  await expect(empty).toContainText("Last session:");
  await expect(page.getByText("Show table")).toBeHidden();

  await page.click(range("1 year"));
  await expect(page.locator("path.series-line")).toBeVisible();

  await page.click(range("90 days"));
  await page.getByRole("button", { name: "Show all time" }).click();
  await expect(page.locator(range("All time"))).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("path.series-line")).toBeVisible();
});

test("going back from an exercise page keeps the list's choices and place", async ({ page }) => {
  // 150 extra exercises, so the list needs "Show all" and scrolling.
  const data = syncedEndingDaysAgo(1);
  const extra = Array.from({ length: 150 }, (_, i) => `Drill ${String(i).padStart(3, "0")}`);
  const last = data.workouts.at(-1)!;
  data.workouts = [
    ...data.workouts.slice(0, -1),
    {
      ...last,
      exercises: [
        ...last.exercises,
        ...extra.map((title, i) => ({ index: last.exercises.length + i, title, exercise_template_id: title, sets: [set({ reps: 10 }, 0)] })),
      ],
    },
  ];
  data.exercise_templates = [...data.exercise_templates, ...extra.map((title) => template(title, title, "reps_only", "abdominals"))];
  await serveSynced(page, data);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#/exercises");

  await page.getByRole("radio", { name: "A–Z" }).click();
  await page.getByRole("button", { name: /Show all/ }).click();
  const target = page.getByRole("link", { name: "Drill 140" });
  await target.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await target.click();
  await expect(page.locator("h2")).toHaveText("Drill 140");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.goBack();
  await expect(page.getByRole("radio", { name: "A–Z" })).toHaveAttribute("aria-checked", "true");
  await expect(rows(page)).toHaveCount(156);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test("says when the kind filter, not the search, hides the matches", async ({ page }) => {
  await page.goto("/#/exercises");
  await page.getByRole("radio", { name: "Timed" }).click();
  await search(page).fill("bench");
  await expect(page.getByText("No timed exercises match “bench”")).toBeVisible();
  await expect(page.locator("table.exercise-list")).toHaveCount(0);
  await page.getByRole("button", { name: "Show all kinds" }).click();
  await expect(rows(page).locator("a")).toHaveText(["Bench Press (Barbell)"]);
});
