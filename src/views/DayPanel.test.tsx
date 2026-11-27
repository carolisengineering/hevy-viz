import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dayEntries } from "../core/calendar";
import { dataset, template, workout } from "../core/testkit";
import { buildTraining } from "../core/training";
import type { HealthDay } from "../core/types";
import { DayPanel } from "./DayPanel";

const lifts = ["bench", "squat", "row", "ohp", "deadlift", "curl"];
const data = dataset(
  [
    {
      ...workout(
        "a",
        "2026-11-03",
        lifts.map((id) => [id, [{ weight_kg: 50, reps: 5 }]]),
      ),
      start_time: "2026-11-03T15:00:00Z",
      end_time: "2026-11-03T16:00:00Z",
    },
  ],
  lifts.map((id) => template(id, "weight_reps", "chest")),
);
const training = buildTraining(data, "UTC");
const render = (day: string, totals?: HealthDay) =>
  renderToStaticMarkup(<DayPanel day={day} entries={dayEntries(training, day, "UTC")} unit="kg" timeZone="UTC" totals={totals} />);
const html = render("2026-11-03");

describe("DayPanel", () => {
  it("heads the panel with the full date", () => {
    expect(html).toMatch(/<section[^>]*aria-labelledby="day-panel-title"/);
    expect(html).toMatch(/<h3 id="day-panel-title"[^>]*>Tue, Nov 3, 2026<\/h3>/);
  });

  it("lists each workout with its time and length", () => {
    expect(html).toContain("Workout a");
    expect(html).toContain("3:00 PM · 1 h");
  });

  it("lists every exercise's top set", () => {
    for (const id of lifts) expect(html).toContain(`href="#/exercises/${id}"`);
    expect(html).toContain("50 × 5");
    // A first-ever session is an all-time record.
    expect(html).toContain('aria-label="All-time record"');
  });

  it("says rest day", () => {
    expect(render("2026-11-04")).toContain("Rest day.");
  });
});

describe("DayPanel with Health totals", () => {
  it("puts the day's totals above its workouts", () => {
    const withTotals = render("2026-11-03", { date: "2026-11-03", steps: 9300, sleep_min: 440 });
    const line = '<p class="day-totals">9,300 steps · 7h20 sleep</p>';
    expect(withTotals).toContain(line);
    expect(withTotals.indexOf(line)).toBeLessThan(withTotals.indexOf("<article"));
  });

  it("has no totals line without totals", () => {
    expect(html).not.toContain("day-totals");
    expect(render("2026-11-03", { date: "2026-11-03" })).not.toContain("day-totals");
  });

  it("shows a rest day's totals and says rest day", () => {
    const rest = render("2026-11-04", { date: "2026-11-04", steps: 14000 });
    expect(rest).toContain('<p class="day-totals">14,000 steps</p>');
    expect(rest).toContain("Rest day.");
  });
});
