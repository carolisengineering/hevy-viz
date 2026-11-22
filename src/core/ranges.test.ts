import { describe, expect, it } from "vitest";
import { filterBetween, filterByRange, periodsIn, rangeById, seriesBy, weeksIn, windowFor } from "./ranges";

const pts = (...dates: string[]) => dates.map((date) => ({ date }));

describe("filterByRange", () => {
  const history = pts("2025-11-01", "2026-08-15", "2026-08-16", "2026-11-14");

  it("keeps points within `days` before the anchor, inclusive", () => {
    expect(filterByRange(history, rangeById("90d"), "2026-11-14")).toEqual(pts("2026-08-16", "2026-11-14"));
  });
  it("keeps everything for all time", () => {
    expect(filterByRange(history, rangeById("all"), "2026-11-14")).toEqual(history);
  });
  it("drops points after the anchor", () => {
    expect(filterByRange(history, rangeById("1y"), "2026-08-16")).toEqual(pts("2025-11-01", "2026-08-15", "2026-08-16"));
  });
  it("handles empty and single-point histories", () => {
    expect(filterByRange([], rangeById("90d"), "2026-11-14")).toEqual([]);
    expect(filterByRange(pts("2026-11-14"), rangeById("90d"), "2026-11-14")).toEqual(pts("2026-11-14"));
  });
});

describe("rangeById", () => {
  it("finds a range or throws", () => {
    expect(rangeById("1y").days).toBe(365);
    expect(() => rangeById("2y" as never)).toThrow();
  });
});

describe("windowFor", () => {
  it("counts a range's days back from the end day", () => {
    expect(windowFor(rangeById("90d"), "2026-11-14")).toEqual({ from: "2026-08-16", to: "2026-11-14" });
  });
  it("starts all time at the first day", () => {
    expect(windowFor(rangeById("all"), "2026-11-14", "2022-08-01")).toEqual({ from: "2022-08-01", to: "2026-11-14" });
  });
});

describe("filterBetween", () => {
  const history = pts("2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01");

  it("keeps both endpoints", () => {
    expect(filterBetween(history, { from: "2026-02-01", to: "2026-03-01" })).toEqual(pts("2026-02-01", "2026-03-01"));
  });
  it("returns nothing for a window outside the points", () => {
    expect(filterBetween(history, { from: "2030-01-01", to: "2030-02-01" })).toEqual([]);
  });
});

describe("weeksIn", () => {
  it("counts a single day as one week", () => {
    expect(weeksIn({ from: "2026-11-18", to: "2026-11-18" })).toBe(1);
  });
  it("counts Monday to Sunday as one week", () => {
    expect(weeksIn({ from: "2026-11-16", to: "2026-11-22" })).toBe(1);
  });
  it("counts Sunday to Monday as two weeks", () => {
    expect(weeksIn({ from: "2026-11-22", to: "2026-11-23" })).toBe(2);
  });
  it("counts whole weeks across a daylight-saving change", () => {
    expect(weeksIn({ from: "2026-10-19", to: "2026-11-09" })).toBe(4);
  });
  it("counts the 53 weeks a year from Thursday to Thursday touches", () => {
    expect(weeksIn({ from: "2026-01-01", to: "2026-12-31" })).toBe(53);
  });
});

describe("periodsIn", () => {
  it("lists every Monday a window touches", () => {
    expect(periodsIn({ from: "2026-11-04", to: "2026-11-16" }, "week")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
  });

  it("lists every month a window touches, across a year", () => {
    expect(periodsIn({ from: "2025-11-20", to: "2026-01-03" }, "month")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
  });
});

describe("seriesBy", () => {
  it("goes by week up to 104 weeks and by month past that", () => {
    expect(seriesBy({ from: "2024-11-18", to: "2026-11-09" })).toBe("week"); // 104 weeks
    expect(seriesBy({ from: "2024-11-18", to: "2026-11-16" })).toBe("month"); // 105 weeks
  });
});
