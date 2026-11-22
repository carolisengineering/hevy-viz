import { expect, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

const captions = (page: import("@playwright/test").Page) => page.locator("table.calendar-month caption");

test("opens on the newest month and reaches back to the first", async ({ page }) => {
  await page.goto("/#/calendar");
  await expect(captions(page).first()).toContainText("November 2026");
  await expect(captions(page).last()).toContainText("November 2024");
  await expect(captions(page)).toHaveCount(25);
});

test("follows the range", async ({ page }) => {
  await page.goto("/#/calendar");
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(captions(page)).toHaveCount(4);
  await expect(captions(page).last()).toContainText("August 2026");
});

test("shows the empty state for a range without sessions", async ({ page }) => {
  await serveSynced(page, syncedEndingDaysAgo(200));
  await page.goto("/#/calendar");
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(page.getByText("No sessions in this range.")).toBeVisible();
  await expect(page.locator("table.calendar-month")).toHaveCount(0);
});

test("fits four tabs on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/calendar");
  await expect(page.locator(".tabs a")).toHaveCount(4);
  await page.evaluate(() => document.fonts.ready);
  const rights = await page.locator(".tabs a").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
  expect(rights).toHaveLength(4);
  for (const right of rights) expect(right).toBeLessThanOrEqual(390);
});
