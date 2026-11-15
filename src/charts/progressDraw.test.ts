import { describe, expect, it } from "vitest";
import type { ProgressPoint } from "../core/progress";
import { splitAtGaps } from "./progressDraw";

const p = (date: string): ProgressPoint => ({
  date,
  value: 100,
  workoutId: date,
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
});

describe("splitAtGaps", () => {
  it("keeps a steady run of sessions as one line", () => {
    const points = [p("2026-01-01"), p("2026-01-20"), p("2026-02-10")];
    expect(splitAtGaps(points, 28)).toEqual({ series: points, bridges: [] });
  });

  it("breaks the line across a layoff longer than the limit and bridges it", () => {
    const points = [p("2026-01-01"), p("2026-01-20"), p("2026-04-01"), p("2026-04-08")];
    const { series, bridges } = splitAtGaps(points, 28);
    expect(series).toEqual([points[0], points[1], null, points[2], points[3]]);
    expect(bridges).toEqual([[points[1], points[2]]]);
  });
});
