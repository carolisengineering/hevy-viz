// Hash routing for the three views: #/, #/exercises, #/exercises/<id>, #/balance.
import { useCallback, useSyncExternalStore } from "react";

export type Route = { view: "overview" } | { view: "exercises"; exerciseId?: string } | { view: "balance" };

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
  if (view === "exercises") return id ? { view: "exercises", exerciseId: decode(id) } : { view: "exercises" };
  return { view: "overview" };
}

export function routeHref(route: Route): string {
  switch (route.view) {
    case "overview":
      return "#/";
    case "balance":
      return "#/balance";
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
