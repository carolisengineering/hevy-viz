import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GroupPeriod } from "../core/balance";
import { GroupGrid } from "./GroupGrid";

const count = (html: string, s: string) => html.split(s).length - 1;
const zeros = [0, 0, 0, 0, 0, 0];

describe("GroupGrid", () => {
  it("draws a row per group and a dot per cell", () => {
    const periods: GroupPeriod[] = ["2026-10-26", "2026-11-02", "2026-11-09"].map((start) => ({ start, sets: [1, 2, 3, 4, 5, 6] }));
    const html = renderToStaticMarkup(<GroupGrid periods={periods} by="week" />);
    expect(count(html, "<circle")).toBe(18);
    for (const group of ["Legs", "Back", "Chest", "Shoulders", "Arms", "Core"]) expect(html).toContain(`>${group}<`);
    expect(html).toContain('aria-label="Working sets per week for Legs, Back, Chest, Shoulders, Arms and Core, over 3 weeks"');
  });

  it("draws empty cells as rest dots, and the busiest cell full size", () => {
    const html = renderToStaticMarkup(<GroupGrid periods={[{ start: "2026-11-09", sets: [10, 0, 5, 0, 0, 0] }]} by="week" />);
    expect(count(html, 'class="rest"')).toBe(4);
    expect(html).toMatch(/<circle[^>]* r="3.6"[^>]*><title>Legs, week of Nov 9: 10 sets<\/title>/);
  });

  it("names each cell's sets", () => {
    const html = renderToStaticMarkup(<GroupGrid periods={[{ start: "2026-11-09", sets: [0, 0, 0, 0, 1, 0] }]} by="week" />);
    expect(html).toContain("<title>Arms, week of Nov 9: 1 set</title>");
  });

  it("labels the start of each month over the weeks", () => {
    const periods = ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((start) => ({ start, sets: zeros }));
    const html = renderToStaticMarkup(<GroupGrid periods={periods} by="week" />);
    expect(html).toContain(">Oct<");
    expect(html).toContain(">Nov<");
    expect(count(html, ">Oct<")).toBe(1);
  });

  it("skips the first column's label when the next one would crowd it", () => {
    const periods = ["2026-10-26", "2026-11-02", "2026-11-09"].map((start) => ({ start, sets: zeros }));
    const html = renderToStaticMarkup(<GroupGrid periods={periods} by="week" />);
    expect(html).not.toContain(">Oct<");
    expect(html).toContain(">Nov<");
  });

  it("marks off-quarter months in a long week grid, so phones can drop them", () => {
    const weeks = (n: number) => Array.from({ length: n }, (_, i) => ({ start: new Date(Date.UTC(2025, 10, 3 + 7 * i)).toISOString().slice(0, 10), sets: zeros }));
    const long = renderToStaticMarkup(<GroupGrid periods={weeks(53)} by="week" />);
    expect(long).toContain('class="group-grid dense"');
    expect(long).toMatch(/<span class="minor"[^>]*>Dec</);
    expect(long).toMatch(/<span style="[^"]*">Jan</);
    const short = renderToStaticMarkup(<GroupGrid periods={weeks(13)} by="week" />);
    expect(short).toContain('class="group-grid"');
    expect(short).not.toContain('class="minor"');
  });

  it("labels months", () => {
    const periods: GroupPeriod[] = [
      { start: "2025-10-01", sets: zeros },
      { start: "2025-11-01", sets: zeros },
      { start: "2025-12-01", sets: [48, 0, 0, 0, 0, 0] },
      { start: "2026-01-01", sets: [12, 0, 0, 0, 0, 0] },
    ];
    const html = renderToStaticMarkup(<GroupGrid periods={periods} by="month" />);
    expect(html).toContain("<title>Legs, Dec 2025: 48 sets</title>");
    expect(html).toContain("<title>Legs, Jan 2026: 12 sets</title>");
    expect(html).toContain(">2025<");
    expect(html).toContain(">2026<");
    expect(html).toContain("over 4 months");
  });
});
