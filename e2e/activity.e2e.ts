import type { HealthDataset } from "../src/core/types.ts";
import { expect, readHealthSample, serveHealth, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

const rows = (page: import("@playwright/test").Page) => page.locator(".activity-row");

test("shows five measures in order, each a link to its page", async ({ page }) => {
  await page.goto("/#/activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByText("Apple Health data as of Nov 13, 2026")).toBeVisible();
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page).locator(".activity-label")).toHaveText([
    "Steps per day",
    "Distance per day",
    "Exercise per day",
    "Active calories per day",
    "Sleep per night",
  ]);
  const hrefs = await rows(page).evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toEqual(["steps", "distance", "exercise", "calories", "sleep"].map((m) => `#/activity/${m}`));
  await expect(rows(page).first()).toHaveAttribute("aria-label", /Steps per day.*average/);
});

test("says where the Watch data starts", async ({ page }) => {
  await page.goto("/#/activity");
  await expect(rows(page).nth(2)).toContainText("before your Watch");
  await expect(rows(page).nth(0)).not.toContainText("before your Watch");
});

test("says so when a measure has no data in the range", async ({ page }) => {
  const health = readHealthSample();
  const cut = health.days.at(-120)!.date;
  health.days = health.days.map((d) => {
    if (d.date < cut) return d;
    const { sleep_min: _sleep, ...rest } = d;
    return rest;
  });
  await serveHealth(page, health);
  await page.goto("/#/activity");
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(rows(page).nth(4)).toContainText("No data in this range");
  await expect(rows(page).nth(0)).not.toContainText("No data in this range");
});

test("explains how to import when there is no health data", async ({ page }) => {
  await serveSynced(page, syncedEndingDaysAgo(0));
  await serveHealth(page, null);
  await page.goto("/#/activity");
  await expect(page.getByText("npm run health")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
});

test("ends on the export date when the export is older than today", async ({ page }) => {
  const health = readHealthSample();
  health.export_date = "2026-08-20";
  health.days = health.days.filter((d) => d.date <= health.export_date);
  await serveSynced(page, syncedEndingDaysAgo(0));
  await serveHealth(page, health);
  await page.goto("/#/activity");
  await expect(page.getByText("Apple Health data as of Aug 20, 2026")).toBeVisible();
  // July is the last complete month before the export; today's end day would name a later one.
  await expect(rows(page).first().locator(".activity-when")).toHaveText("Jul");
  await expect(page.locator(".activity-tick").last()).not.toHaveText(/Sep|Oct|Nov|Dec/);
});

test("marks the month of the latest figure and labels the timeline", async ({ page }) => {
  await page.goto("/#/activity");
  await expect(page.locator(".activity-mark")).toHaveCount(5);
  await expect(page.locator(".activity-tick").first()).toBeVisible();
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(page.locator(".activity-tick").last()).toHaveText("Nov");
});

test("keeps the Watch note clear of the line", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/activity");
  const note = rows(page).nth(2).locator(".activity-sub");
  await expect(note).toHaveText("before your Watch");
  const [n, chart] = await Promise.all([note.boundingBox(), rows(page).nth(2).locator(".activity-chart").boundingBox()]);
  expect(n!.y + n!.height <= chart!.y + 1 || n!.x + n!.width <= chart!.x + 1).toBe(true);
});

test("says nothing about the Watch in a window that has it", async ({ page }) => {
  await page.goto("/#/activity");
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(rows(page).nth(2)).not.toContainText("before your Watch");
});

/** Ten years of steps and nothing else, 2016-03-01 to 2026-11-13. */
function decade(): HealthDataset {
  const days = [];
  for (let t = Date.UTC(2016, 2, 1); t <= Date.UTC(2026, 10, 13); t += 86_400_000) {
    days.push({ date: new Date(t).toISOString().slice(0, 10), steps: 6000 + (t / 86_400_000) % 2000 });
  }
  return { source: "apple-health", imported_at: "2026-11-13T12:00:00Z", export_date: "2026-11-13", days };
}

for (const width of [390, 1280]) {
  test(`keeps the axis labels apart on ten years at ${width}px`, async ({ page }) => {
    await serveHealth(page, decade());
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/#/activity");
    await page.evaluate(() => document.fonts.ready);
    const ticks = page.locator(".activity-tick");
    await expect(ticks.last()).toHaveText("2026");
    const boxes = await ticks.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.left, r.right]));
    expect(boxes.length).toBeGreaterThan(3);
    for (let i = 1; i < boxes.length; i++) expect(boxes[i][0]).toBeGreaterThan(boxes[i - 1][1]);
    expect(boxes[0][0]).toBeGreaterThanOrEqual(0);
    expect(boxes.at(-1)![1]).toBeLessThanOrEqual(width);
  });
}

test("keeps the axis labels apart on the whole sample at 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/activity");
  await page.evaluate(() => document.fonts.ready);
  const boxes = await page.locator(".activity-tick").evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.left, r.right]));
  for (let i = 1; i < boxes.length; i++) expect(boxes[i][0]).toBeGreaterThan(boxes[i - 1][1]);
});
