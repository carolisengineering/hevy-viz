// Every view fits its screen: nothing pushes the page sideways.
import { expect, test } from "./fixtures.ts";

for (const hash of ["#/", "#/exercises", "#/exercises/squat", "#/balance", "#/calendar", "#/activity"]) {
  test(`${hash} never scrolls sideways`, async ({ page }) => {
    await page.goto(`/${hash}`);
    await page.locator("main h2").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

// Small phones (iPhone mini, many Androids) are narrower than the 390px test project.
for (const hash of ["#/", "#/calendar", "#/activity"]) {
  test(`${hash} never scrolls sideways at 360px`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/${hash}`);
    await page.locator("main h2").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
