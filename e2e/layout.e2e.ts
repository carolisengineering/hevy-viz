// Every view fits its screen: nothing pushes the page sideways.
import { expect, test } from "./fixtures.ts";

for (const hash of ["#/", "#/exercises", "#/exercises/squat", "#/balance", "#/calendar"]) {
  test(`${hash} never scrolls sideways`, async ({ page }) => {
    await page.goto(`/${hash}`);
    await page.locator("main h2").first().waitFor();
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
