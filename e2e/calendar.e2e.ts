import type { Page } from "@playwright/test";
import { expect, readHealthSample, sample, serveHealth, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

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
  // Training days only: rest days with Health data become links once it loads.
  const links = page.locator("table.calendar-month").first().locator('a:not([aria-label*="no sessions"])');
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

// Day totals from Apple Health: shades, the legend, and the panel's totals line.

const STEP_FLOORS = [5000, 7500, 10000, 15000, 20000];
const expectedBand = (steps: number | undefined) => (steps === undefined ? 0 : 1 + STEP_FLOORS.filter((f) => steps >= f).length);
const shadedCells = (page: Page) => page.locator('table.calendar-month td[class*="steps-"]');
const pad = (n: number) => String(n).padStart(2, "0");
/** The local calendar day of `date`, as the app works days out in the browser's time zone. */
const localDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const sampleTrainingDays = new Set(sample.workouts.map((w) => localDay(new Date(w.start_time))));
const lastSampleTrainingDay = [...sampleTrainingDays].sort().at(-1)!;

test("shades days by steps on the demo", async ({ page }) => {
  await page.goto("/#/calendar");
  await page.click('button[role=radio]:has-text("90 days")');
  await expect(page.locator(".step-legend li")).toHaveText(["under 5,000", "5,000–7,499", "7,500–9,999", "10,000–14,999", "15,000–19,999", "20,000+", "no data"]);
  const steps = new Map(readHealthSample().days.map((d) => [d.date, d.steps]));
  const cells = await page
    .locator("table.calendar-month td[data-day]:not(.outside)")
    .evaluateAll((tds) => tds.map((td) => [td.getAttribute("data-day")!, [...td.classList].filter((c) => c.startsWith("steps-"))] as const));
  expect(cells.length).toBeGreaterThan(80);
  for (const [day, classes] of cells) expect(classes, day).toEqual([`steps-${expectedBand(steps.get(day))}`]);
});

test("hatches days after the export", async ({ page }) => {
  const today = localDay(new Date());
  const health = readHealthSample();
  // The last Health day is the export day, cut short at the export: hatched too, not a low day.
  const move = Math.round((Date.parse(`${shiftDay(today, -9)}T00:00:00Z`) - Date.parse(`${health.days.at(-1)!.date}T00:00:00Z`)) / 86_400_000);
  health.source = "apple-health";
  health.days = health.days.map((d) => ({ ...d, date: shiftDay(d.date, move) }));
  health.export_date = shiftDay(today, -9);
  await serveSynced(page, syncedEndingDaysAgo(0));
  await serveHealth(page, health);
  await page.goto("/#/calendar");
  await expect(page.locator(`td[data-day="${shiftDay(today, -3)}"]`)).toHaveClass(/(^| )steps-0( |$)/);
  await expect(page.locator(`td[data-day="${shiftDay(today, -9)}"]`)).toHaveClass(/(^| )steps-0( |$)/);
  await expect(page.locator(`td[data-day="${shiftDay(today, -10)}"]`)).toHaveClass(/(^| )steps-[1-6]( |$)/);
});

test("picks a rest day with Health data", async ({ page }) => {
  const restDay = readHealthSample()
    .days.map((d) => d.date)
    .filter((d) => d < lastSampleTrainingDay && !sampleTrainingDays.has(d))
    .at(-1)!;
  await page.goto("/#/calendar");
  await page.locator(`td[data-day="${restDay}"] a`).click();
  expect(new URL(page.url()).hash).toBe(`#/calendar/${restDay}`);
  await expect(page.locator(".day-panel")).toContainText("Rest day.");
  await expect(page.locator(".day-totals")).toContainText("steps");
});

test("shows the day's totals above its workouts", async ({ page }) => {
  await page.goto("/#/calendar");
  await expect(page.locator(".day-totals")).toBeVisible();
  const before = await page
    .locator(".day-totals")
    .evaluate((p) => !!(p.compareDocumentPosition(document.querySelector(".day-workout")!) & Node.DOCUMENT_POSITION_FOLLOWING));
  expect(before).toBe(true);
});

/** Waits for both data files, so an absent shade isn't just health data still loading. */
async function openSettled(page: Page) {
  await page.goto("/#/calendar");
  await expect(page.locator("table.calendar-month").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
}

test("leaves the calendar alone without health data", async ({ page }) => {
  await serveSynced(page, syncedEndingDaysAgo(0));
  await serveHealth(page, null);
  await openSettled(page);
  await expect(shadedCells(page)).toHaveCount(0);
  await expect(page.locator(".step-legend")).toHaveCount(0);
  await expect(page.locator(".day-totals")).toHaveCount(0);
  await expect(page.getByText("dot size = working sets", { exact: true })).toBeVisible();
});

test("leaves the calendar alone beside a real export", async ({ page }) => {
  const health = readHealthSample();
  health.source = "apple-health";
  await serveHealth(page, health);
  await openSettled(page);
  await expect(shadedCells(page)).toHaveCount(0);
  await expect(page.locator(".step-legend")).toHaveCount(0);
  await expect(page.locator(".day-totals")).toHaveCount(0);
});

/** WCAG contrast between two computed `rgb(…)` colors. */
function contrast(a: string, b: string): number {
  const lum = (css: string) => {
    const [r, g, b] = css.match(/[\d.]+/g)!.slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** `top` (an rgba() that may be see-through) laid over the opaque `bottom`, as rgb(). */
function over(top: string, bottom: string): string {
  const [r, g, b, a = 1] = top.match(/[\d.]+/g)!.map(Number);
  const [R, G, B] = bottom.match(/[\d.]+/g)!.map(Number);
  return `rgb(${r! * a + R! * (1 - a)}, ${g! * a + G! * (1 - a)}, ${b! * a + B! * (1 - a)})`;
}

test("keeps the darkest shade readable", async ({ page }) => {
  const health = readHealthSample();
  health.days = health.days.map((d) => (d.date === lastSampleTrainingDay ? { ...d, steps: 25000 } : d));
  await serveHealth(page, health);
  await page.goto("/#/calendar");
  const cell = page.locator(`td[data-day="${lastSampleTrainingDay}"]`);
  await expect(cell).toHaveClass(/(^| )steps-6( |$)/);
  const colors = await cell.evaluate((td) => ({
    background: getComputedStyle(td).backgroundColor,
    number: getComputedStyle(td.querySelector(".day-number")!).color,
    dot: getComputedStyle(td.querySelector(".day-dot circle")!).fill,
  }));
  expect(contrast(colors.number, colors.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.dot, colors.background)).toBeGreaterThanOrEqual(3);

  // Pointing at the day (or a tap's sticky hover) must not dim it below the floors.
  await cell.locator("a").hover();
  const tint = await cell.locator("a").evaluate((a) => getComputedStyle(a).backgroundColor);
  const hovered = over(tint, colors.background);
  expect(contrast(colors.number, hovered)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.dot, hovered)).toBeGreaterThanOrEqual(3);
});

test("fits the legend on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/calendar");
  await expect(page.locator(".step-legend")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
