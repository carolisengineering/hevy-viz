import { describe, expect, it } from "vitest";
import { axisLabels, monthsIn } from "./ActivityAxis";

const months = (from: string, to: string) => monthsIn({ from, to });
const texts = (from: string, to: string, width: number) => axisLabels(months(from, to), width).map((l) => l.text);

/** Labels written 9px a character never come closer than 12px, or leave the chart. */
function expectClear(from: string, to: string, width: number) {
  const labels = axisLabels(months(from, to), width);
  labels.forEach((l, i) => {
    const half = (l.text.length * 9) / 2;
    expect(l.center - half).toBeGreaterThanOrEqual(0);
    expect(l.center + half).toBeLessThanOrEqual(width);
    if (i > 0) expect(l.center - half).toBeGreaterThanOrEqual(labels[i - 1].center + (labels[i - 1].text.length * 9) / 2 + 12);
  });
}

describe("monthsIn", () => {
  it("lists every month the window touches", () => {
    expect(monthsIn({ from: "2025-11-20", to: "2026-02-03" })).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("axisLabels", () => {
  it("names every month of a short window, with a short year on the first", () => {
    expect(texts("2026-08-01", "2026-11-13", 600)).toEqual(["Aug ’26", "Sep", "Oct", "Nov"]);
  });

  it("goes every third month on a phone", () => {
    expect(texts("2025-11-01", "2026-11-13", 345)).toEqual(["Nov ’25", "May ’26", "Aug", "Nov"]);
  });

  it("adds the year when it changes", () => {
    expect(texts("2025-11-01", "2026-11-13", 600)).toEqual(["Nov ’25", "Jan ’26", "Mar", "May", "Jul", "Sep", "Nov"]);
  });

  it("centers each label under its month", () => {
    const [first, second] = axisLabels(months("2026-08-01", "2026-11-13"), 600);
    expect(first.center).toBe(75);
    expect(second.center).toBe(225);
  });

  it("clamps a label that would leave the chart", () => {
    const [first] = axisLabels(months("2025-01-01", "2026-12-31"), 345);
    expect(first.center).toBeGreaterThanOrEqual(((first.text.length * 9) / 2));
  });

  it("labels each year of ten on a wide chart and every second year on a phone", () => {
    expect(texts("2016-03-01", "2026-11-13", 610)).toHaveLength(10); // 2017 to 2026
    expect(texts("2016-03-01", "2026-11-13", 345)).toEqual(["2018", "2020", "2022", "2024", "2026"]);
  });

  it("goes by 5 years when the data runs for decades", () => {
    expect(texts("1996-03-01", "2026-11-13", 345)).toEqual(["2000", "2005", "2010", "2015", "2020", "2025"]);
  });

  it.each([
    ["2025-11-01", "2026-11-13", 345],
    ["2024-11-01", "2026-11-13", 345],
    ["2024-11-01", "2026-11-13", 610],
    ["2014-03-01", "2026-11-13", 345],
    ["2014-03-01", "2026-11-13", 610],
    ["2016-03-01", "2026-11-13", 345],
    ["2026-08-01", "2026-11-13", 345],
  ])("keeps labels clear of each other and the edges: %s to %s at %ipx", (from, to, width) => {
    expectClear(from, to, width);
  });
});
