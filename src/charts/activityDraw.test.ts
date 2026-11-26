import { describe, expect, it } from "vitest";
import { lineSegments, yearMarks } from "./activityDraw";

const m = (month: string, value = 1) => ({ month, value, days: 20 });

describe("lineSegments", () => {
  it("keeps consecutive months in one run, across a year change", () => {
    expect(lineSegments([m("2025-11"), m("2025-12"), m("2026-01")])).toEqual([[m("2025-11"), m("2025-12"), m("2026-01")]]);
  });

  it("splits at a missing month and never bridges it", () => {
    const runs = lineSegments([m("2026-01"), m("2026-02"), m("2026-04"), m("2026-05"), m("2026-08")]);
    expect(runs.map((r) => r.map((a) => a.month))).toEqual([["2026-01", "2026-02"], ["2026-04", "2026-05"], ["2026-08"]]);
  });

  it("is empty without months", () => {
    expect(lineSegments([])).toEqual([]);
  });
});

describe("yearMarks", () => {
  const years = [
    { year: "2025", value: 100, days: 60 },
    { year: "2026", value: 200, days: 30, partialTo: "2026-11-13" },
  ];

  it("spans each year's consecutive months at the year's average", () => {
    const marks = yearMarks([m("2025-11"), m("2025-12"), m("2026-01"), m("2026-02")], years);
    expect(marks).toEqual([
      { year: "2025", from: "2025-11", to: "2025-12", value: 100 },
      { year: "2026", from: "2026-01", to: "2026-02", value: 200 },
    ]);
  });

  it("splits a year's mark at a month with no data", () => {
    const marks = yearMarks([m("2026-01"), m("2026-03"), m("2026-04")], years);
    expect(marks).toEqual([
      { year: "2026", from: "2026-01", to: "2026-01", value: 200 },
      { year: "2026", from: "2026-03", to: "2026-04", value: 200 },
    ]);
  });

  it("leaves out a year with no months", () => {
    expect(yearMarks([m("2026-01")], years).map((k) => k.year)).toEqual(["2026"]);
  });
});
