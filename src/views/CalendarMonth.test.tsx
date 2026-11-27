import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calendarMonths } from "../core/calendar";
import type { DayLoad } from "../core/consistency";
import { healthByDay } from "../core/health";
import { CalendarMonth } from "./CalendarMonth";

const load = (sessions: number, sets: number): DayLoad => ({ sessions, sets, minutes: 60 });
const days = new Map([
  ["2026-10-21", load(1, 12)],
  ["2026-11-03", load(2, 20)],
  ["2026-11-20", load(1, 9)], // after the window
]);
const [november, october] = calendarMonths(days, { from: "2026-10-20", to: "2026-11-14" });
const html = renderToStaticMarkup(<CalendarMonth month={november} selected="2026-11-03" />);

/** The markup of the cell for `day`. */
const cellFor = (markup: string, day: string) => markup.match(new RegExp(`<td[^>]*data-day="${day}"[^>]*>.*?</td>`))?.[0] ?? "";

describe("CalendarMonth", () => {
  it("captions the month with its sessions", () => {
    expect(html).toContain("<caption>November 2026 · 2 sessions</caption>");
    expect(renderToStaticMarkup(<CalendarMonth month={october} selected={null} />)).toContain("<caption>October 2026 · 1 session</caption>");
  });

  it("heads the columns Monday first", () => {
    const heads = [...html.matchAll(/<th[^>]*abbr="(\w+)"[^>]*>(\w)<\/th>/g)].map((m) => [m[1], m[2]]);
    expect(heads).toEqual([
      ["Monday", "M"],
      ["Tuesday", "T"],
      ["Wednesday", "W"],
      ["Thursday", "T"],
      ["Friday", "F"],
      ["Saturday", "S"],
      ["Sunday", "S"],
    ]);
  });

  it("links training days", () => {
    const cell = cellFor(html, "2026-11-03");
    expect(cell).toContain('href="#/calendar/2026-11-03"');
    expect(cell).toContain('aria-label="Tue, Nov 3, 2026: 2 sessions, 20 sets"');
    expect(cell).toContain('aria-current="date"');
  });

  it("doesn't link rest days", () => {
    const cell = cellFor(html, "2026-11-04");
    expect(cell).not.toContain("href=");
    expect(cell).toContain(">4<");
    expect(cell).toContain('class="rest"');
  });

  it("fades days outside the window", () => {
    const cell = cellFor(html, "2026-11-15");
    expect(cell).toContain('class="outside"');
    expect(cell).not.toContain("<circle");
    expect(html).not.toContain('href="#/calendar/2026-11-20"');
  });
});

describe("CalendarMonth with Health data", () => {
  const health = healthByDay([
    { date: "2026-11-03", steps: 12000 },
    { date: "2026-11-05", sleep_min: 420 },
  ]);
  const shaded = renderToStaticMarkup(<CalendarMonth month={november} selected="2026-11-03" health={health} />);

  it("shades a training day by its steps and reads them out", () => {
    const cell = cellFor(shaded, "2026-11-03");
    expect(cell).toMatch(/^<td[^>]*class="steps-4"/);
    expect(cell).toContain('aria-label="Tue, Nov 3, 2026: 2 sessions, 20 sets, 12,000 steps"');
  });

  it("links a rest day with Health data, hatched when it has no steps", () => {
    const cell = cellFor(shaded, "2026-11-05");
    expect(cell).toMatch(/^<td[^>]*class="steps-0"/);
    expect(cell).toContain('<a href="#/calendar/2026-11-05"');
    expect(cell).toContain('aria-label="Thu, Nov 5, 2026: no sessions"');
  });

  it("hatches a rest day without Health data and doesn't link it", () => {
    const cell = cellFor(shaded, "2026-11-04");
    expect(cell).toMatch(/^<td[^>]*class="steps-0"/);
    expect(cell).not.toContain("<a");
  });

  it("leaves days outside the window unshaded", () => {
    expect(cellFor(shaded, "2026-11-20")).not.toContain("steps-");
  });

  it("shades nothing without Health data", () => {
    expect(html).not.toContain("steps-");
  });
});
