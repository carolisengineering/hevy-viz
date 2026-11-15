// Light, dark, or whatever the system prefers. Remembered per browser like the unit.
// index.html applies the stored choice before the app loads, so a reload never flashes.
import { useEffect } from "react";
import { usePreference } from "./usePreference";

export type Theme = "auto" | "light" | "dark";
const THEMES: readonly Theme[] = ["auto", "light", "dark"];
export const THEME_KEY = "hevy-viz:theme";

/** The chosen theme. "auto" leaves the colors to `prefers-color-scheme`. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = usePreference(THEME_KEY, THEMES, "auto");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);
  return [theme, setTheme];
}
