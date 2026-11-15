// The header on every view: tabs, search, range and units.
import { expect, test } from "./fixtures.ts";

test("switches views with the header tabs", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Views" }).getByRole("link");
  await expect(tabs).toHaveText(["Overview", "Exercises", "Balance"]);
  await expect(tabs.first()).toHaveAttribute("aria-current", "page");

  await tabs.filter({ hasText: "Exercises" }).click();
  await expect(tabs.filter({ hasText: "Exercises" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.filter({ hasText: "Overview" })).not.toHaveAttribute("aria-current");
  expect(new URL(page.url()).hash).toBe("#/exercises");
});

test("searching goes to the exercise list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "Find an exercise" }).fill("squat");
  expect(new URL(page.url()).hash).toBe("#/exercises");
  await expect(page.getByRole("searchbox", { name: "Find an exercise" })).toBeFocused();
});

test("remembers the unit across reloads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "kg" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "lb" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "lb" })).toHaveAttribute("aria-checked", "true");
});

test("works when the browser blocks storage", async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await page.goto("/#/exercises/bench");
  await expect(page.locator("path.series-line")).toBeVisible();
  await page.getByRole("radio", { name: "lb" }).click();
  await expect(page.getByRole("radio", { name: "lb" })).toHaveAttribute("aria-checked", "true");
});
