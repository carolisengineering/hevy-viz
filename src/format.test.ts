import { describe, expect, it } from "vitest";
import { formatDate, formatKg, formatKgChange, formatKgPrecise, formatSet } from "./format";

describe("format", () => {
  it("formats whole kilograms", () => {
    expect(formatKg(116.67)).toBe("117 kg");
  });
  it("formats kilograms to one decimal", () => {
    expect(formatKgPrecise(116.666)).toBe("116.7 kg");
  });
  it("formats a signed change", () => {
    expect(formatKgChange(12.4)).toBe("+12 kg");
    expect(formatKgChange(-3.6)).toBe("−4 kg");
    expect(formatKgChange(-0.2)).toBe("0 kg");
  });
  it("formats a set", () => {
    expect(formatSet({ weightKg: 102.5, reps: 5 })).toBe("102.5 kg × 5");
  });
  it("formats a day without shifting it by time zone", () => {
    expect(formatDate("2026-11-14")).toBe("Nov 14, 2026");
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  });
});
