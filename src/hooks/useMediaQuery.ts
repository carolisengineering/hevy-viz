// Whether a CSS media query matches, following changes (a resize or rotation).
import { useCallback, useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  // Rendering without a window (tests) counts as not matching.
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
