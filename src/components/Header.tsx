import type { ReactNode } from "react";
import "./Header.css";
import { RANGES, type RangeId } from "../core/ranges";
import { formatCount, type Unit } from "../format";
import { routeHref, type Route } from "../hooks/useRoute";
import type { Theme } from "../hooks/useTheme";
import { AutoThemeIcon, MoonIcon, SearchIcon, Stripe, SunIcon } from "./ink";
import { Segmented } from "./Segmented";

const TABS: readonly { view: Route["view"]; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "exercises", label: "Exercises" },
  { view: "balance", label: "Balance" },
  { view: "calendar", label: "Calendar" },
];

const RANGE_OPTIONS = RANGES.map((r) => ({ id: r.id, label: r.label }));
const UNIT_OPTIONS: readonly { id: Unit; label: string }[] = [
  { id: "kg", label: "kg" },
  { id: "lb", label: "lb" },
];
const THEME_OPTIONS: readonly { id: Theme; label: string; icon: ReactNode }[] = [
  { id: "auto", label: "Auto", icon: <AutoThemeIcon /> },
  { id: "light", label: "Light", icon: <SunIcon /> },
  { id: "dark", label: "Dark", icon: <MoonIcon /> },
];

interface Props {
  route: Route;
  rangeId: RangeId;
  onRange: (id: RangeId) => void;
  unit: Unit;
  onUnit: (unit: Unit) => void;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  query: string;
  onQuery: (query: string) => void;
  /** Workouts in the dataset. */
  sessions: number;
  isSample: boolean;
}

/** The header rule: wordmark, view tabs, range, units, theme, search and the session label. */
export function Header({ route, rangeId, onRange, unit, onUnit, theme, onTheme, query, onQuery, sessions, isSample }: Props) {
  return (
    <header className="site-header">
      <h1 className="wordmark display">Training Log</h1>
      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => (
          <a key={t.view} href={routeHref({ view: t.view })} aria-current={route.view === t.view ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      <div className="tools">
        <Segmented label="Date range" options={RANGE_OPTIONS} value={rangeId} onChange={onRange} />
        <Segmented label="Units" options={UNIT_OPTIONS} value={unit} onChange={onUnit} />
        <Segmented label="Theme" options={THEME_OPTIONS} value={theme} onChange={onTheme} />
        <label className="search">
          <SearchIcon />
          <input
            type="search"
            aria-label="Find an exercise"
            placeholder="Find an exercise…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </div>
      <p className="cassette">
        <strong className="display">{formatCount(sessions)}</strong> <span>sessions</span>
        {isSample && (
          <>
            {" "}
            <span className="sample">Sample data</span>
          </>
        )}
        <Stripe />
      </p>
    </header>
  );
}
