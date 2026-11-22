// Hash routing for the four views: #/, #/exercises, #/exercises/<id>, #/balance, #/calendar, #/calendar/<day>.
import { useCallback, useSyncExternalStore } from "react";
import { addDays, parseDay } from "../core/dates";

export type Route =
  | { view: "overview" }
  | { view: "exercises"; exerciseId?: string }
  | { view: "balance" }
  | { view: "calendar"; day?: string };

/** A "YYYY-MM-DD" day that exists on the calendar (so not Feb 30). */
const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDay(s).getTime()) && addDays(s, 0) === s;

const decode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // A malformed escape in a hand-edited link: keep the raw text.
  }
};

/** The route for a location hash. Anything unknown is the overview. */
export function parseRoute(hash: string): Route {
  const [view, id] = hash.replace(/^#\/?/, "").split("/");
  if (view === "balance") return { view: "balance" };
  if (view === "calendar") return id && isDay(id) ? { view: "calendar", day: id } : { view: "calendar" };
  if (view === "exercises") return id ? { view: "exercises", exerciseId: decode(id) } : { view: "exercises" };
  return { view: "overview" };
}

export function routeHref(route: Route): string {
  switch (route.view) {
    case "overview":
      return "#/";
    case "balance":
      return "#/balance";
    case "calendar":
      return route.day == null ? "#/calendar" : `#/calendar/${route.day}`;
    case "exercises":
      return route.exerciseId == null ? "#/exercises" : `#/exercises/${encodeURIComponent(route.exerciseId)}`;
  }
}

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const getHash = () => window.location.hash;

/** The current route and a way to go to another. Back and forward work, since the hash is the state. */
export function useRoute(): [Route, (route: Route) => void] {
  const hash = useSyncExternalStore(subscribe, getHash);
  const navigate = useCallback((route: Route) => {
    window.location.hash = routeHref(route);
  }, []);
  return [parseRoute(hash), navigate];
}
