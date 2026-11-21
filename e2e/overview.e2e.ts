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

test("converts every tracklist figure when switching to kilograms", async ({ page }) => {
  await page.goto("/");
  const squat = page.locator("table.tracklist tr").filter({ hasText: "Squat (Barbell)" });
  const cells = ["td.best-set", "td.change", "td.current"];
  const before = await Promise.all(cells.map((c) => squat.locator(c).textContent()));

  await page.getByRole("radio", { name: "kg" }).click();
  for (const [i, c] of cells.entries()) {
    await expect(squat.locator(c)).not.toHaveText(before[i]!);
    await expect(squat.locator(c)).not.toContainText("lb");
  }
  await expect(page.locator(".tracklist thead th.current")).toHaveText("latest est. 1RM kg");
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
  await expect(page.locator(".tracklist thead th.current")).toHaveText("latest est. 1RM lb");
});

test("lines up each figure's column header with its figures", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tracklist thead th.current")).toBeVisible(); // the data has loaded
  await page.evaluate(() => document.fonts.ready);
  const rightOfText = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().right;
  };
  const row = page.locator("table.tracklist tbody tr:not(.side)").first();
  for (const [column, figure] of [
    ["best-set", "td.best-set"],
    ["change", "td.change"],
    ["current", "td.current .display"],
  ] as const) {
    if (!(await row.locator(figure).isVisible())) continue; // phones drop the best-set column
    const header = page.locator(`.tracklist thead th.${column}`);
    await expect(header).toBeVisible();
    const [headerRight, figureRight] = [await header.evaluate(rightOfText), await row.locator(figure).evaluate(rightOfText)];
    expect(Math.abs(headerRight - figureRight), column).toBeLessThanOrEqual(2);
  }
});

test("wraps a long column label instead of widening its column", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".tracklist thead th.current")).toBeVisible(); // the data has loaded
  await page.evaluate(() => document.fonts.ready);
  const columnWidths = () =>
    page.locator(".tracklist thead th").evaluateAll((ths) => ths.map((th) => th.getBoundingClientRect().width));
  const before = await columnWidths();
  // Words shorter than any in the labels make a label longer but not its longest word, so no column should move.
  await page.locator(".tracklist .col-label").evaluateAll((labels) => {
    for (const label of labels) label.textContent += " in a set in a set in a set";
  });
  const after = await columnWidths();
  after.forEach((width, i) => expect(Math.abs(width - before[i]!), `column ${i + 1}`).toBeLessThanOrEqual(0.5));
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
  await expect(page.locator(".latest-entries li").first()).toContainText("Bench Press (Barbell) 132 × 15"); // 60 kg, shown in the default lb
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
