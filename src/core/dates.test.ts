import { describe, expect, it } from "vitest";
import { addDays, MS_PER_DAY, parseDay, toLocalDay, weekStart } from "./dates";

describe("toLocalDay", () => {
  it("puts an evening workout west of UTC on the local day", () => {
    // 03:30 UTC on the 14th is 19:30 on the 13th in California.
    expect(toLocalDay("2026-11-14T03:30:00Z", "America/Los_Angeles")).toBe("2026-11-13");
  });
  it("puts a late workout east of UTC on the next local day", () => {
    expect(toLocalDay("2026-11-14T16:00:00Z", "Asia/Tokyo")).toBe("2026-11-15");
  });
  it("matches the UTC date when the zone is UTC", () => {
    expect(toLocalDay("2026-11-14T03:30:00Z", "UTC")).toBe("2026-11-14");
  });
  it("handles both sides of a daylight saving change", () => {
    // US DST starts 2026-03-08: 23:30 local is 07:30Z before, 06:30Z after.
    expect(toLocalDay("2026-03-08T07:30:00Z", "America/Los_Angeles")).toBe("2026-03-07");
    expect(toLocalDay("2026-03-09T06:30:00Z", "America/Los_Angeles")).toBe("2026-03-08");
    // US DST ends 2026-11-01.
    expect(toLocalDay("2026-11-02T07:30:00Z", "America/Los_Angeles")).toBe("2026-11-01");
  });
});

describe("parseDay", () => {
  it("returns UTC midnight of the day", () => {
    expect(parseDay("2026-11-14").toISOString()).toBe("2026-11-14T00:00:00.000Z");
  });
});

describe("addDays", () => {
  it("moves forward and back across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-11-14", -90)).toBe("2026-08-16");
  });
});

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-11-14")).toBe("2026-11-09"); // Saturday
    expect(weekStart("2026-11-09")).toBe("2026-11-09"); // Monday
    expect(weekStart("2026-11-15")).toBe("2026-11-09"); // Sunday
  });
});

describe("MS_PER_DAY", () => {
  it("is 24 hours", () => {
    expect(MS_PER_DAY).toBe(24 * 60 * 60 * 1000);
  });
});
