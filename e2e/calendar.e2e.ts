import { expect, sample, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

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

test("fits five tabs on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/calendar");
  await expect(page.locator(".tabs a")).toHaveCount(5);
  await page.evaluate(() => document.fonts.ready);
  const rights = await page.locator(".tabs a").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().right));
  expect(rights).toHaveLength(5);
  for (const right of rights) expect(right).toBeLessThanOrEqual(390);
});

const panelHeading = (page: import("@playwright/test").Page) => page.locator(".day-panel h3");
/** "Tue, Nov 3, 2026" from a day link's label "Tue, Nov 3, 2026: 1 session, 12 sets". */
const dateOf = async (link: import("@playwright/test").Locator) => (await link.getAttribute("aria-label"))!.split(":")[0];

test("shows the latest training day by default", async ({ page }) => {
  await page.goto("/#/calendar");
  const latest = page.locator("table.calendar-month").first().locator("a").last();
  await expect(latest).toHaveAttribute("aria-current", "date");
  await expect(panelHeading(page)).toHaveText(await dateOf(latest));
  expect(new URL(page.url()).hash).toBe("#/calendar");
});

test("picks a day and goes back", async ({ page }) => {
  await page.goto("/#/calendar");
  const links = page.locator("table.calendar-month").first().locator("a");
  await links.nth(0).click();
  expect(new URL(page.url()).hash).toMatch(/^#\/calendar\/2026-11-\d\d$/);
  await expect(links.nth(0)).toHaveAttribute("aria-current", "date");
  await expect(panelHeading(page)).toHaveText(await dateOf(links.nth(0)));

  await links.nth(1).click();
  await expect(panelHeading(page)).toHaveText(await dateOf(links.nth(1)));
  await page.goBack();
  await expect(links.nth(0)).toHaveAttribute("aria-current", "date");
  await expect(panelHeading(page)).toHaveText(await dateOf(links.nth(0)));
});

test("opens a bookmarked day", async ({ page }) => {
  await page.goto("/#/calendar/2024-11-18");
  await expect(panelHeading(page)).toHaveText("Mon, Nov 18, 2024");
  await expect(page.locator(".day-workout h4").first()).toHaveText("Upper A");
});

test("places the panel under its month on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/calendar");
  const second = page.locator(".calendar-month-block").nth(1);
  await second.locator("a").first().click();
  await expect(second.locator(".day-panel")).toBeVisible();
  await expect(page.locator(".day-panel")).toHaveCount(1);
});

test("keeps the tapped day in view on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/calendar");
  // Safari has no scroll anchoring, so the page jumps when the panel leaves a month above.
  await page.addStyleTag({ content: "* { overflow-anchor: none !important; }" });
  await expect(page.locator(".calendar-month-block").first().locator(".day-panel")).toBeVisible();
  const link = page.locator(".calendar-month-block").nth(2).locator("a").first();
  // Near the top but fully on screen, so the click itself doesn't scroll.
  await link.evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -10);
  });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "date");
  await expect(link).toBeInViewport();
});

test("keeps the panel in view on a laptop", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/calendar");
  await expect(page.locator(".day-panel")).toBeVisible();
  await page.locator("table.calendar-month").last().scrollIntoViewIfNeeded();
  await expect(page.locator(".day-panel")).toBeInViewport();
});

/** The sample with its last workout repeating its exercises `times` times, as Hevy allows. */
function withLongLastDay(times: number) {
  const workouts = sample.workouts.toSorted((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const last = workouts.at(-1)!;
  const exercises = Array.from({ length: times }, () => last.exercises).flat().map((ex, index) => ({ ...ex, index }));
  return { ...sample, workouts: [...workouts.slice(0, -1), { ...last, exercises }] };
}

test("opens a bookmarked day in view on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/calendar/2025-06-10");
  const picked = page.locator('table.calendar-month a[aria-current="date"]');
  await expect(picked).toHaveCount(1);
  await expect(picked).toBeInViewport();
});

test("lists a day that repeats an exercise", async ({ page }) => {
  await serveSynced(page, withLongLastDay(2));
  await page.goto("/#/calendar");
  await expect(page.locator(".day-workout li")).toHaveCount(withLongLastDay(2).workouts.at(-1)!.exercises.length);
});

test("keeps the end of a long day reachable on a laptop", async ({ page }) => {
  await serveSynced(page, withLongLastDay(10));
  await page.setViewportSize({ width: 1280, height: 680 });
  await page.goto("/#/calendar");
  const last = page.locator(".day-workout li").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await expect(page.locator("table.calendar-month").first()).toBeInViewport();
});
