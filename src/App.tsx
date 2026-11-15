import { useState } from "react";
import "./App.css";
import { E1rmChart } from "./charts/E1rmChart";
import { E1rmTable } from "./components/E1rmTable";
import { EmptyRange } from "./components/EmptyRange";
import { ExercisePicker } from "./components/ExercisePicker";
import { Header } from "./components/Header";
import { StatTile } from "./components/StatTile";
import type { RangeId } from "./core/ranges";
import type { HevyDataset } from "./core/types";
import { formatChange, formatValue, type Unit } from "./format";
import { useDataset } from "./hooks/useDataset";
import { useE1rmView } from "./hooks/useE1rmView";
import { usePreference } from "./hooks/usePreference";
import { useRoute } from "./hooks/useRoute";

const UNITS: readonly Unit[] = ["kg", "lb"];

export default function App() {
  const dataset = useDataset();
  if (dataset.status === "error") return <main className="viz-root"><p className="notice">{dataset.message}</p></main>;
  if (dataset.status === "loading") return <main className="viz-root"><p className="muted">Loading…</p></main>;
  return <Dashboard data={dataset.data} skipped={dataset.skipped} />;
}

function Dashboard({ data, skipped }: { data: HevyDataset; skipped: number }) {
  const [templateId, setTemplateId] = useState("");
  const [rangeId, setRangeId] = useState<RangeId>("all");
  const [unit, setUnit] = usePreference("hevy-viz:unit", UNITS, "kg");
  const [route, navigate] = useRoute();
  const [query, setQuery] = useState("");
  const [showTable, setShowTable] = useState(false);
  const view = useE1rmView(data, templateId, rangeId);
  const isEmpty = view.history.length === 0;

  const onQuery = (q: string) => {
    setQuery(q);
    if (route.view !== "exercises" || route.exerciseId != null) navigate({ view: "exercises" });
  };

  return (
    <>
      <Header
        route={route}
        rangeId={rangeId}
        onRange={setRangeId}
        unit={unit}
        onUnit={setUnit}
        query={query}
        onQuery={onQuery}
        sessions={data.workouts.length}
        isSample={data.source === "sample"}
      />
      <main className="viz-root">
        {skipped > 0 && (
          <p className="notice small" role="status">
            Skipped {skipped} {skipped === 1 ? "workout" : "workouts"} with an unreadable start time.
          </p>
        )}

        <div className="filters">
          <ExercisePicker exercises={view.lifts} value={view.selected?.templateId ?? ""} onChange={setTemplateId} />
        </div>

        <section className="stats">
          <StatTile
            label="Current est. 1RM"
            value={view.current ? formatValue("e1rm", view.current.e1rm, unit) : "—"}
            unit={view.current ? unit : undefined}
          />
          <StatTile
            label="Change in range"
            value={view.change == null ? "—" : formatChange("e1rm", view.change, unit)}
            unit={view.change == null ? undefined : unit}
          />
          <StatTile label="PRs in range" value={String(view.prs.length)} />
        </section>

        <section className="card">
          <div className="card-head">
            <h2>{view.selected ? `${view.selected.title}: estimated 1RM` : "Estimated 1RM"}</h2>
            {!isEmpty && (
              <button className="link" onClick={() => setShowTable((v) => !v)}>
                {showTable ? "Show chart" : "Show table"}
              </button>
            )}
          </div>
          <p className="muted small">Best working set per session (Epley formula). Dots mark PRs.</p>
          {isEmpty ? (
            <EmptyRange lastSession={view.lastSession} onShowAll={() => setRangeId("all")} />
          ) : showTable ? (
            <E1rmTable history={view.history} />
          ) : (
            <E1rmChart history={view.history} prs={view.prs} />
          )}
        </section>
      </main>
    </>
  );
}
