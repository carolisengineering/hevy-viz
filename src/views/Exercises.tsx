import { useEffect, useLayoutEffect, useMemo, type RefObject } from "react";
import "./Exercises.css";
import { Segmented } from "../components/Segmented";
import { Sparkline } from "../components/ink";
import { muscleLabel } from "../core/muscles";
import { filterByRange, type DateRange } from "../core/ranges";
import { METRIC_LABEL, recordsBy, type ExerciseProgress, type MetricId } from "../core/progress";
import { formatCount, formatDate, formatShortDate, formatValue, valueUnit, type Unit } from "../format";
import { routeHref } from "../hooks/useRoute";
import type { Training } from "../hooks/useTraining";

type Kind = "all" | "weights" | "bodyweight" | "timed" | "distance";
const KINDS: readonly { id: Kind; label: string }[] = [
  { id: "all", label: "All" },
  { id: "weights", label: "Weights" },
  { id: "bodyweight", label: "Bodyweight" },
  { id: "timed", label: "Timed" },
  { id: "distance", label: "Distance" },
];
/** A kind as one word inside a sentence: "No timed exercises". */
const KIND_WORD: Record<Exclude<Kind, "all">, string> = { weights: "weight", bodyweight: "bodyweight", timed: "timed", distance: "distance" };
const KIND_OF: Record<MetricId, Kind> = { e1rm: "weights", weight: "weights", reps: "bodyweight", duration: "timed", distance: "distance" };

type Sort = "sessions" | "recent" | "az";
const SORTS: readonly { id: Sort; label: string }[] = [
  { id: "sessions", label: "Most sessions" },
  { id: "recent", label: "Most recent" },
  { id: "az", label: "A–Z" },
];

/** Rows shown before "Show all". */
const FIRST_ROWS = 100;

/** The list's choices. They live in the app, so opening an exercise and going back keeps them. */
export interface ListView {
  kind: Kind;
  sort: Sort;
  showAll: boolean;
}
export const INITIAL_LIST_VIEW: ListView = { kind: "all", sort: "sessions", showAll: false };

interface Props {
  training: Training;
  range: DateRange;
  unit: Unit;
  query: string;
  onQuery: (query: string) => void;
  view: ListView;
  onView: (view: ListView) => void;
  /** The list's last scroll position, kept while an exercise page is open. */
  scrollMemory: RefObject<number>;
  /** True when coming back from an exercise page: return to `scrollMemory`. */
  restoreScroll: boolean;
}

/** Every exercise, searchable, filterable by kind and sortable. */
export function Exercises({ training, range, unit, query, onQuery, view, onView, scrollMemory, restoreScroll }: Props) {
  const { kind, sort, showAll } = view;
  const setKind = (k: Kind) => onView({ ...view, kind: k });
  const setSort = (s: Sort) => onView({ ...view, sort: s });
  const setShowAll = (v: boolean) => onView({ ...view, showAll: v });

  // Back from an exercise page returns to the same place in the list; the rows are already rendered.
  useLayoutEffect(() => {
    if (restoreScroll) window.scrollTo(0, scrollMemory.current);
    // Only on arrival: later renders must not pull the reader back.
  }, []);
  useEffect(() => {
    const remember = () => {
      scrollMemory.current = window.scrollY;
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, [scrollMemory]);

  const matches = useMemo(() => {
    // A plain substring, so "(Barbell)" or "+" mean themselves.
    const needle = query.trim().toLowerCase();
    const found = training.exercises.filter(
      (e) => (kind === "all" || KIND_OF[e.metric] === kind) && e.title.toLowerCase().includes(needle),
    );
    if (sort === "recent") return found.toSorted((a, b) => b.lastDay.localeCompare(a.lastDay) || a.title.localeCompare(b.title));
    if (sort === "az") return found.toSorted((a, b) => a.title.localeCompare(b.title));
    return found; // Already most sessions first.
  }, [training.exercises, query, kind, sort]);

  const shown = showAll ? matches : matches.slice(0, FIRST_ROWS);

  return (
    <section className="exercises" aria-labelledby="exercises-title">
      <div className="view-head">
        <h2 id="exercises-title" className="display">
          Exercises
        </h2>
        <p className="quiet">
          {matches.length === training.exercises.length
            ? `${formatCount(matches.length)} exercises`
            : `${formatCount(matches.length)} of ${formatCount(training.exercises.length)} exercises`}
        </p>
      </div>
      <div className="list-controls">
        <Segmented label="Kind" options={KINDS} value={kind} onChange={setKind} />
        <Segmented label="Sort" options={SORTS} value={sort} onChange={setSort} />
      </div>

      {matches.length === 0 ? (
        <div className="no-match">
          <p>
            {kind === "all" ? "No exercises" : `No ${KIND_WORD[kind]} exercises`}
            {query.trim() ? <> match “{query.trim()}”</> : " yet."}
          </p>
          <div className="no-match-actions">
            {kind !== "all" && (
              <button type="button" className="link" onClick={() => setKind("all")}>
                Show all kinds
              </button>
            )}
            {query.trim() && (
              <button type="button" className="link" onClick={() => onQuery("")}>
                Clear search
              </button>
            )}
          </div>
        </div>
      ) : (
        <table className="exercise-list">
          <thead>
            <tr>
              <th>Exercise</th>
              <th className="num">Best</th>
              <th className="num">Sessions</th>
              <th className="num">Last done</th>
              <th>
                <span className="visually-hidden">Trend in range</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <ExerciseRow key={e.templateId} exercise={e} range={range} endDay={training.endDay} unit={unit} />
            ))}
          </tbody>
        </table>
      )}

      {!showAll && matches.length > FIRST_ROWS && (
        <button type="button" className="show-all" onClick={() => setShowAll(true)}>
          Show all {formatCount(matches.length)}
        </button>
      )}
    </section>
  );
}

function ExerciseRow({ exercise: e, range, endDay, unit }: { exercise: ExerciseProgress; range: DateRange; endDay: string; unit: Unit }) {
  const best = recordsBy(e.points).at(-1);
  const inRange = filterByRange(e.points, range, endDay);
  const measureUnit = valueUnit(e.metric, unit);
  return (
    <tr>
      <td>
        <a href={routeHref({ view: "exercises", exerciseId: e.templateId })}>{e.title}</a>
        <span className="row-sub quiet">{muscleLabel(e.muscle)}</span>
      </td>
      <td className="num">
        {best ? (
          <>
            <span className="best">{formatValue(e.metric, best.value, unit)}</span>
            {measureUnit && <span className="unit"> {measureUnit}</span>}
            <span className="row-sub quiet">{METRIC_LABEL[e.metric]}</span>
          </>
        ) : (
          <span className="quiet">No sets to chart</span>
        )}
      </td>
      <td className="num">{formatCount(e.sessions)}</td>
      <td className="num">{e.lastDay.slice(0, 4) === endDay.slice(0, 4) ? formatShortDate(e.lastDay) : formatDate(e.lastDay)}</td>
      <td className="spark">
        <Sparkline points={inRange} width={110} height={26} />
      </td>
    </tr>
  );
}
