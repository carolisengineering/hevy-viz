import { describe, expect, it } from "vitest";
import { parseRoute, routeHref, type Route } from "./useRoute";

describe("parseRoute", () => {
  it("reads an exercise page, decoding its id", () => {
    expect(parseRoute("#/exercises/abc%20d")).toEqual({ view: "exercises", exerciseId: "abc d" });
  });

  it("reads the exercise list and the balance view", () => {
    expect(parseRoute("#/exercises")).toEqual({ view: "exercises" });
    expect(parseRoute("#/balance")).toEqual({ view: "balance" });
  });

  it("reads the calendar and a day on it", () => {
    expect(parseRoute("#/calendar")).toEqual({ view: "calendar" });
    expect(parseRoute("#/calendar/2026-11-13")).toEqual({ view: "calendar", day: "2026-11-13" });
  });

  it("drops a calendar day that isn't a real date", () => {
    expect(parseRoute("#/calendar/2026-02-30")).toEqual({ view: "calendar" });
    expect(parseRoute("#/calendar/junk")).toEqual({ view: "calendar" });
    expect(parseRoute("#/calendar/2026-13-45")).toEqual({ view: "calendar" });
  });

  it("falls back to the overview for an empty or unknown hash", () => {
    expect(parseRoute("")).toEqual({ view: "overview" });
    expect(parseRoute("#/nonsense")).toEqual({ view: "overview" });
  });

  it("keeps a malformed exercise id instead of throwing", () => {
    expect(parseRoute("#/exercises/%E0%A4%A")).toEqual({ view: "exercises", exerciseId: "%E0%A4%A" });
  });
});

describe("routeHref", () => {
  const routes: [Route, string][] = [
    [{ view: "overview" }, "#/"],
    [{ view: "exercises" }, "#/exercises"],
    [{ view: "exercises", exerciseId: "abc d/e" }, "#/exercises/abc%20d%2Fe"],
    [{ view: "balance" }, "#/balance"],
    [{ view: "calendar" }, "#/calendar"],
    [{ view: "calendar", day: "2026-11-13" }, "#/calendar/2026-11-13"],
  ];

  it.each(routes)("writes %j as %s and reads it back", (route, href) => {
    expect(routeHref(route)).toBe(href);
    expect(parseRoute(href)).toEqual(route);
  });
});
