import { expect, test } from "./fixtures.ts";

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
