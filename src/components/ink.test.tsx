import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProgressPoint } from "../core/progress";
import { ScribbleDefs, Sparkline, Star } from "./ink";

const point = (date: string, value: number): ProgressPoint => ({
  date,
  value,
  workoutId: "w",
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
});

describe("Sparkline", () => {
  it("draws nothing for fewer than two points", () => {
    const html = renderToStaticMarkup(<Sparkline points={[point("2026-11-01", 100)]} />);
    expect(html).toContain("<svg");
    expect(html).not.toContain("<path");
  });

  it("draws one line through every point", () => {
    const html = renderToStaticMarkup(
      <Sparkline points={[point("2026-10-01", 100), point("2026-10-15", 100), point("2026-11-01", 110)]} />,
    );
    const d = html.match(/ d="([^"]+)"/)?.[1] ?? "";
    expect(d.match(/[ML]/g)).toHaveLength(3);
    expect(d).not.toContain("NaN");
  });
});

describe("Star", () => {
  it("is an image named for screen readers", () => {
    const html = renderToStaticMarkup(<Star />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="PR"');
  });
});

describe("ScribbleDefs", () => {
  it("defines the ink and accent scribble fills", () => {
    const html = renderToStaticMarkup(<ScribbleDefs />);
    expect(html).toContain('id="scribble-ink"');
    expect(html).toContain('id="scribble-accent"');
  });
});
