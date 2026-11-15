import { expect, sample, serveSynced, syncedEndingDaysAgo, test } from "./fixtures.ts";

const range = (label: string) => `button[role=radio]:has-text("${label}")`;

test("shows the sample with a chart, only lifts in the picker, and data in every range", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("path.series-line")).toBeVisible();
  await expect(page.locator(".badge")).toHaveText("Sample data");
  await expect(page.locator("select option")).toHaveText([
    "Bench Press (Barbell)",
    "Overhead Press (Barbell)",
    "Squat (Barbell)",
    "Deadlift (Barbell)",
    "Bent Over Row (Barbell)",
    "Lat Pulldown (Cable)",
  ]);

  // The sample is a fixed snapshot, so its ranges end on its last workout and never go empty.
  await page.click("text=Show table");
  for (const [label, rows] of [["90 days", 22], ["1 year", 93], ["All time", 183]] as const) {
    await page.click(range(label));
    await expect(page.locator(range(label))).toHaveAttribute("aria-checked", "true");
    await expect(page.locator("tbody tr")).toHaveCount(rows);
  }
});

test("switching lifts redraws the chart for that lift", async ({ page }) => {
  await page.goto("/");
  const endLabel = page.locator(".end-label");
  const benchLabel = await endLabel.textContent();
  await page.selectOption("select", { label: "Squat (Barbell)" });
  await expect(page.locator("h2")).toHaveText("Squat (Barbell): estimated 1RM");
  await expect(endLabel).not.toHaveText(benchLabel!);
});

test("skips workouts with unreadable start times instead of failing", async ({ page }) => {
  const broken = { ...syncedEndingDaysAgo(1) };
  const template = broken.workouts[5];
  broken.workouts = [
    ...broken.workouts,
    ...(["not a date", null, ""] as const).map((start_time, i) => ({ ...template, id: `bad-${i}`, start_time: start_time as string })),
  ];
  await serveSynced(page, broken);
  await page.goto("/");
  await expect(page.locator("path.series-line")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Skipped 3 workouts with an unreadable start time.");
  await expect(page.locator("header p.muted")).toContainText(`${sample.workouts.length} workouts`);
});

test("shows an empty state when the range has no sessions", async ({ page }) => {
  await serveSynced(page, syncedEndingDaysAgo(200));
  await page.goto("/");
  await page.click(range("90 days"));

  const empty = page.locator(".empty-state");
  await expect(empty).toContainText("No sessions in this range.");
  await expect(empty).toContainText("Last session:");
  await expect(page.locator(".stat strong")).toHaveText(["—", "—", "0"]);
  await expect(page.getByText("Show table")).toBeHidden();

  await page.click(range("1 year"));
  await expect(page.locator("path.series-line")).toBeVisible();

  await page.click(range("90 days"));
  await page.getByRole("button", { name: "Show all time" }).click();
  await expect(page.locator(range("All time"))).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("path.series-line")).toBeVisible();
});
