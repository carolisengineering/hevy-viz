import { describe, expect, it } from "vitest";
import { filterByRange, rangeById } from "./ranges";

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
