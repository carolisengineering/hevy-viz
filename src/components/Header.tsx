import "./Header.css";
import { RANGES, type RangeId } from "../core/ranges";
import { formatCount, type Unit } from "../format";
import { routeHref, type Route } from "../hooks/useRoute";
import { SearchIcon, Stripe } from "./ink";
import { Segmented } from "./Segmented";

const TABS: readonly { view: Route["view"]; label: string }[] = [
  { view: "overview", label: "Overview" },
  { view: "exercises", label: "Exercises" },
  { view: "balance", label: "Balance" },
];

const RANGE_OPTIONS = RANGES.map((r) => ({ id: r.id, label: r.label }));
const UNIT_OPTIONS: readonly { id: Unit; label: string }[] = [
  { id: "kg", label: "kg" },
  { id: "lb", label: "lb" },
];

interface Props {
  route: Route;
  rangeId: RangeId;
  onRange: (id: RangeId) => void;
  unit: Unit;
  onUnit: (unit: Unit) => void;
  query: string;
  onQuery: (query: string) => void;
  /** Workouts in the dataset. */
  sessions: number;
  isSample: boolean;
}

/** The header rule: wordmark, view tabs, range, units, search and the session label. */
export function Header({ route, rangeId, onRange, unit, onUnit, query, onQuery, sessions, isSample }: Props) {
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
