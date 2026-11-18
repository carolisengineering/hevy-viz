import { expect, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

const side = (page: import("@playwright/test").Page, label: string) =>
  page.locator("table.tracklist tbody").filter({ has: page.locator("tr.side th", { hasText: label }) });

test("lists the main lifts as a tracklist, lower side first", async ({ page }) => {
  await page.goto("/");
  await expect(side(page, "Side A — Lower").locator("td.name a")).toHaveText(["Deadlift (Barbell)", "Squat (Barbell)"]);
  await expect(side(page, "Side B — Upper").locator("td.name a")).toHaveText([
    "Bench Press (Barbell)",
    "Overhead Press (Barbell)",
    "Bent Over Row (Barbell)",
    "Lat Pulldown (Cable)",
  ]);

  await page.locator("table.tracklist").getByRole("link", { name: "Squat (Barbell)" }).click();
  expect(new URL(page.url()).hash).toBe("#/exercises/squat");
});

test("converts every tracklist figure when switching to pounds", async ({ page }) => {
  await page.goto("/");
  const squat = page.locator("table.tracklist tr").filter({ hasText: "Squat (Barbell)" });
  const cells = ["td.best-set", "td.change", "td.current"];
  const before = await Promise.all(cells.map((c) => squat.locator(c).textContent()));

  await page.getByRole("radio", { name: "lb" }).click();
  for (const [i, c] of cells.entries()) {
    await expect(squat.locator(c)).not.toHaveText(before[i]!);
    await expect(squat.locator(c)).not.toContainText("kg");
  }
  await expect(page.locator(".tracklist-note")).toContainText("lb");
});

test("shows consistency as figures and a dot grid", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("sessions this month")).toBeVisible();
  await expect(page.locator("svg.dot-grid circle").first()).toBeAttached();
  await expect(page.locator("svg.dot-grid circle title").first()).toHaveText(/sets?$/);
});

test("shows balance by group and links to every muscle", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".balance-box li")).toHaveCount(6);
  await page.getByRole("link", { name: "Every muscle" }).click();
  expect(new URL(page.url()).hash).toBe("#/balance");
});

test("writes the latest three workouts as log lines", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".latest-entries li")).toHaveCount(3);
});

test("answers consistency and balance before the log on one-column screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const top = async (selector: string) => (await page.locator(selector).boundingBox())!.y;
  expect(await top(".consistency")).toBeLessThan(await top(".latest-entries"));
  expect(await top(".balance-box")).toBeLessThan(await top(".latest-entries"));
});

test("draws rest days in the dot grid so gaps stay visible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("svg.dot-grid circle.rest").first()).toBeAttached();
});

test("says the hand-lettered number is the latest estimate", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tracklist-note")).toHaveText("best set · change in range · latest est. 1RM kg");
});

test("logs an exercise even when its sets don't give its measure", async ({ page }) => {
  // The latest workout's bench is one set of 15 reps: too many for an estimated 1RM.
  const data = syncedEndingDaysAgo(1);
  const latest = data.workouts.reduce((a, b) => (Date.parse(b.start_time) > Date.parse(a.start_time) ? b : a));
  data.workouts = data.workouts.map((w) =>
    w !== latest
      ? w
      : {
          ...w,
          exercises: w.exercises.map((e) =>
            e.exercise_template_id === "bench" ? { ...e, sets: [{ index: 0, type: "normal" as const, weight_kg: 60, reps: 15 }] } : e,
          ),
        },
  );
  await serveSynced(page, data);
  await page.goto("/");
  await expect(page.locator(".latest-entries li").first()).toContainText("Bench Press (Barbell) 60 × 15");
});

test("keeps a long workout title on one line in the log", async ({ page }) => {
  const data = syncedEndingDaysAgo(1);
  const latest = data.workouts.reduce((a, b) => (Date.parse(b.start_time) > Date.parse(a.start_time) ? b : a));
  latest.title = "BP - SC - BC - 2026-11-11";
  await serveSynced(page, data);
  await page.goto("/");
  const title = page.locator(".latest-entries li").first().locator(".log-title");
  await expect(title).toHaveText(latest.title);
  const lines = await title.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);
});
