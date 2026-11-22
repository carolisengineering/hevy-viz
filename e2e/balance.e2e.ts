import { expect, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

test("shows group bars and every muscle, busiest first, for the chosen range", async ({ page }) => {
  await page.goto("/#/balance");
  await expect(page.locator(".group-bars li")).toHaveCount(6);

  const rows = page.locator("table.muscles tbody tr");
  await expect(rows).toHaveCount(6);
  await expect(rows.first().locator("td").first()).toHaveText("Chest");
  await expect(rows.locator("td:first-child", { hasText: "Quadriceps" })).toHaveCount(1);

  const values = async () => (await rows.locator("td.value").allTextContents()).map(Number);
  const allTime = await values();
  expect(allTime).toEqual(allTime.toSorted((a, b) => b - a));

  await page.click('button[role=radio]:has-text("90 days")');
  await expect.poll(values).not.toEqual(allTime);
});

test("shows each group week by week, following the range", async ({ page }) => {
  await page.goto("/#/balance");
  const dots = page.locator(".group-grid circle");
  const columns = async () => (await dots.count()) / 6;

  await page.click('button[role=radio]:has-text("90 days")');
  await expect(page.getByRole("heading", { name: "Week by week" })).toBeVisible();
  await expect.poll(columns).toBeGreaterThanOrEqual(13);
  expect([13, 14]).toContain(await columns());

  await page.click('button[role=radio]:has-text("1 year")');
  await expect.poll(columns).toBeGreaterThanOrEqual(53);
  expect([53, 54]).toContain(await columns());
});

test("draws no grid for a range without sets", async ({ page }) => {
  await serveSynced(page, syncedEndingDaysAgo(200));
  await page.goto("/#/balance");
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(page.getByText("No working sets in this range.")).toBeVisible();
  await expect(page.locator(".group-grid")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Week by week" })).toHaveCount(0);
});

test("keeps group labels readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/balance");
  await page.click('button[role=radio]:has-text("1 year")');
  const labels = page.locator(".group-grid-label");
  await expect(labels).toHaveCount(6);
  const sizes = await labels.evaluateAll((els) => els.map((el) => parseFloat(getComputedStyle(el).fontSize)));
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
  // The dots still get a usable width beside the names.
  const svgWidth = await page.locator(".group-grid svg").first().evaluate((el) => el.getBoundingClientRect().width);
  expect(svgWidth).toBeGreaterThan(200);
  // Month names never run into each other.
  const spans = await page.locator(".group-grid-ticks span").evaluateAll((els) =>
    els.filter((el) => getComputedStyle(el).display !== "none").map((el) => el.getBoundingClientRect()).map((r) => [r.left, r.right]),
  );
  expect(spans.length).toBeGreaterThanOrEqual(3);
  for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThanOrEqual(spans[i - 1][1]);
});

test("shows all time by month on a phone when weeks would be too narrow", async ({ page }) => {
  // The sample spans 104 weeks, past what a phone can show as weeks.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/balance");
  await page.click('button[role=radio]:has-text("All time")');
  await expect(page.getByRole("heading", { name: "Month by month" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Week by week" })).toBeHidden();
  const grid = page.locator(".group-grid").filter({ visible: true });
  await expect(grid).toHaveCount(1);
  const svg = grid.locator("svg").first();
  const columns = await svg.locator("circle").count();
  const width = await svg.evaluate((el) => el.getBoundingClientRect().width);
  expect(width / columns).toBeGreaterThanOrEqual(8);
});

test("keeps all time by week on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#/balance");
  await page.click('button[role=radio]:has-text("All time")');
  await expect(page.getByRole("heading", { name: "Week by week" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Month by month" })).toBeHidden();
});
