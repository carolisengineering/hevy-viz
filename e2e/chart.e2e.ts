import { expect, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

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

test("charts a lift with a single session in range without broken coordinates", async ({ page }) => {
  // Bench keeps only its most recent session in the last 95 days, so the 90-day range holds exactly one.
  const data = syncedEndingDaysAgo(1);
  const cutoff = Date.now() - 95 * 86_400_000;
  const recentBench = data.workouts
    .filter((w) => Date.parse(w.start_time) >= cutoff && w.exercises.some((e) => e.exercise_template_id === "bench"))
    .map((w) => w.id);
  const keep = recentBench.at(-1);
  data.workouts = data.workouts.map((w) =>
    recentBench.includes(w.id) && w.id !== keep
      ? { ...w, exercises: w.exercises.filter((e) => e.exercise_template_id !== "bench") }
      : w,
  );
  await serveSynced(page, data);
  await page.goto("/");
  await page.selectOption("select", { label: "Bench Press (Barbell)" });
  await page.click('button[role=radio]:has-text("90 days")');

  // One session: no change over the range, and the chart has redrawn with no curve segments.
  await expect(page.locator(".stat strong").nth(1)).toHaveText("±0");
  await expect(page.locator("path.series-line")).not.toHaveAttribute("d", /C/);
  await expect(page.locator("path.series-line")).toBeVisible();
  await expect(page.locator(".end-label")).not.toHaveText("");
  const broken = await page.locator(".chart-wrap svg").evaluate((svg) =>
    [svg, ...svg.querySelectorAll("*")].flatMap((el) =>
      [...el.attributes].filter((a) => a.value.includes("NaN")).map((a) => `${el.tagName}[${a.name}]`),
    ),
  );
  expect(broken).toEqual([]);
});
