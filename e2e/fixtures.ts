// Shared setup for the browser tests: each test chooses its own data, so your
// synced data/hevy.json (if any) never affects results, and every test fails
// on browser errors, including ResizeObserver loop errors that never reach the console.
import { readFileSync } from "node:fs";
import { expect, test as base, type Page } from "@playwright/test";
import type { HealthDataset, HevyDataset } from "../src/core/types.ts";

export { expect };

const MS_PER_DAY = 86_400_000;

/** The committed sample dataset, as the app loads it. */
export const sample: HevyDataset = JSON.parse(
  readFileSync(new URL("../public/data/sample.json", import.meta.url), "utf8"),
);

/**
 * The sample as if synced from Hevy, moved so its last workout was `daysAgo` days
 * before now. Synced data's ranges end today, so this controls what each range shows.
 */
export function syncedEndingDaysAgo(daysAgo: number): HevyDataset {
  const last = Math.max(...sample.workouts.map((w) => Date.parse(w.start_time)));
  const offset = Date.now() - daysAgo * MS_PER_DAY - last;
  const move = (iso: string) => new Date(Date.parse(iso) + offset).toISOString();
  return {
    ...sample,
    source: "hevy",
    workouts: sample.workouts.map((w) => ({ ...w, start_time: move(w.start_time), end_time: move(w.end_time) })),
  };
}

/**
 * Serves `data` as the synced file. With null, answers like Vite's dev server does
 * when the file is missing (index.html, status 200), so the app falls back to the sample.
 */
export async function serveSynced(page: Page, data: HevyDataset | null): Promise<void> {
  await page.route("**/data/hevy.json", (route) =>
    data
      ? route.fulfill({ contentType: "application/json", body: JSON.stringify(data) })
      : route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
}

/**
 * Serves `data` as the health file. With null, answers like Vite's dev server does when
 * the file is missing (index.html, status 200), so the app falls back to its health sample or empty state.
 */
export async function serveHealth(page: Page, data: HealthDataset | null): Promise<void> {
  await page.route("**/data/health.json", (route) =>
    data
      ? route.fulfill({ contentType: "application/json", body: JSON.stringify(data) })
      : route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
}

declare global {
  interface Window {
    __errors: string[];
  }
}

export const test = base.extend<{ failOnBrowserErrors: void }>({
  // Default to the sample; a test can call serveSynced again to override.
  page: async ({ page }, use) => {
    await serveSynced(page, null);
    await serveHealth(page, null);
    await use(page);
  },
  failOnBrowserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      await page.addInitScript(() => {
        window.__errors = [];
        window.addEventListener("error", (e) => window.__errors.push(e.message));
      });
      await use();
      if (!page.isClosed()) errors.push(...(await page.evaluate(() => window.__errors)));
      expect(errors, "browser errors").toEqual([]);
    },
    { auto: true },
  ],
});
