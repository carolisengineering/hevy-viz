import { expect, test } from "./fixtures.ts";

const tooltip = (page: import("@playwright/test").Page) => page.locator(".tooltip");

test("arrow keys step through sessions, and focus and position survive a resize", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/");
  const hit = page.locator("rect.hit");

  await hit.focus();
  await expect(tooltip(page)).toHaveCSS("opacity", "1");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft");
  const session = (await tooltip(page).textContent())!;

  const svg = page.locator(".chart-wrap svg");
  const width = await svg.getAttribute("width");
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(svg).not.toHaveAttribute("width", width!);

  await expect(hit).toBeFocused();
  await expect(tooltip(page)).toHaveCSS("opacity", "1");
  await expect(tooltip(page)).toHaveText(session);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);

  await page.keyboard.press("ArrowLeft");
  await expect(tooltip(page)).not.toHaveText(session);
});

test("a resize while hovering doesn't move focus to the chart", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto("/");
  const svg = page.locator(".chart-wrap svg");
  await page.locator("rect.hit").hover();
  const width = await svg.getAttribute("width");
  await page.setViewportSize({ width: 640, height: 900 });
  await expect(svg).not.toHaveAttribute("width", width!);
  await expect(page.locator("rect.hit")).not.toBeFocused();
});

// Errors, including ResizeObserver loop errors, fail the test via the failOnBrowserErrors fixture.
test("remounting the chart raises no browser errors", async ({ page }) => {
  await page.goto("/");
  for (let i = 0; i < 2; i++) {
    await page.click("text=Show table");
    await page.click("text=Show chart");
    await expect(page.locator("path.series-line")).toBeVisible();
  }
});
