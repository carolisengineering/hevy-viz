import { expect, test } from "./fixtures.ts";

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

test("converts every tracklist figure when switching to pounds", async ({ page }) => {
  await page.goto("/");
  const squat = page.locator("table.tracklist tr").filter({ hasText: "Squat (Barbell)" });
  const cells = ["td.best-set", "td.change", "td.current"];
  const before = await Promise.all(cells.map((c) => squat.locator(c).textContent()));

  await page.getByRole("radio", { name: "lb" }).click();
  for (const [i, c] of cells.entries()) {
    await expect(squat.locator(c)).not.toHaveText(before[i]!);
    await expect(squat.locator(c)).not.toContainText("kg");
  }
  await expect(page.locator(".tracklist-note")).toContainText("lb");
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
  await expect(page.locator(".tracklist-note")).toHaveText("best set · change in range · latest est. 1RM kg");
});
