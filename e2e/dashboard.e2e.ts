// The header on every view: tabs, search, range and units.
import { expect, test } from "./fixtures.ts";

test("switches views with the header tabs", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Views" }).getByRole("link");
  await expect(tabs).toHaveText(["Overview", "Exercises", "Balance", "Calendar", "Activity"]);
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
  await expect(page.getByRole("radio", { name: "lb" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "kg" }).click();
  await page.reload();
  await expect(page.getByRole("radio", { name: "kg" })).toHaveAttribute("aria-checked", "true");
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
  await expect(page.getByRole("radio", { name: "lb" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "kg" }).click();
  await expect(page.getByRole("radio", { name: "kg" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

const paperColor = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const IVORY = "rgb(252, 249, 242)";
const DESK_LAMP = "rgb(18, 26, 38)";

test("the theme follows the system until you choose one, and the choice is remembered", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("radio", { name: "Auto" })).toHaveAttribute("aria-checked", "true");
  expect(await paperColor(page)).toBe(DESK_LAMP);

  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await paperColor(page)).toBe(IVORY);

  await page.reload();
  await expect(page.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  expect(await paperColor(page)).toBe(IVORY);

  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("radio", { name: "Dark" }).click();
  expect(await paperColor(page)).toBe(DESK_LAMP);

  await page.getByRole("radio", { name: "Auto" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme");
  expect(await paperColor(page)).toBe(IVORY);
});

test("applies a remembered theme before the page first draws", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => localStorage.setItem("hevy-viz:theme", "dark"));
  // Read the theme the moment the document exists, before the app's script runs.
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      (window as unknown as { __firstTheme: string | undefined }).__firstTheme = document.documentElement.dataset.theme;
    }),
  );
  await page.goto("/");
  expect(await page.evaluate(() => (window as unknown as { __firstTheme: string | undefined }).__firstTheme)).toBe("dark");
});
