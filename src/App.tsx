import { useState } from "react";
import { E1rmChart } from "./charts/E1rmChart";
import { E1rmTable } from "./components/E1rmTable";
import { ExercisePicker } from "./components/ExercisePicker";
import { RangePicker } from "./components/RangePicker";
import { StatTile } from "./components/StatTile";
import type { RangeId } from "./core/ranges";
import type { HevyDataset } from "./core/types";
import { formatKg, formatKgChange } from "./format";
import { useDataset } from "./hooks/useDataset";
import { useE1rmView } from "./hooks/useE1rmView";

export default function App() {
  const dataset = useDataset();
  if (dataset.status === "error") return <main className="viz-root"><p className="notice">{dataset.message}</p></main>;
  if (dataset.status === "loading") return <main className="viz-root"><p className="muted">Loading…</p></main>;
  return <Dashboard data={dataset.data} skipped={dataset.skipped} />;
}

function Dashboard({ data, skipped }: { data: HevyDataset; skipped: number }) {
  const [templateId, setTemplateId] = useState("");
  const [rangeId, setRangeId] = useState<RangeId>("all");
  const [showTable, setShowTable] = useState(false);
  const view = useE1rmView(data, templateId, rangeId);

  return (
    <main className="viz-root">
      <header>
        <h1>Training dashboard</h1>
        <p className="muted">
          {data.workouts.length} workouts
          {data.source === "sample" && <span className="badge">Sample data</span>}
        </p>
        {skipped > 0 && (
          <p className="notice small" role="status">
            Skipped {skipped} {skipped === 1 ? "workout" : "workouts"} with an unreadable start time.
          </p>
        )}
      </header>

      <div className="filters" role="toolbar" aria-label="Filters">
        <RangePicker value={rangeId} onChange={setRangeId} />
        <ExercisePicker exercises={view.lifts} value={view.selected?.templateId ?? ""} onChange={setTemplateId} />
      </div>

      <section className="stats">
        <StatTile label="Current est. 1RM" value={view.current ? formatKg(view.current.e1rm) : "—"} />
        <StatTile label="Change in range" value={view.change == null ? "—" : formatKgChange(view.change)} />
        <StatTile label="PRs in range" value={String(view.prs.length)} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{view.selected ? `${view.selected.title}: estimated 1RM` : "Estimated 1RM"}</h2>
          <button className="link" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "Show chart" : "Show table"}
          </button>
        </div>
        <p className="muted small">Best working set per session (Epley formula). Dots mark PRs.</p>
        {showTable ? <E1rmTable history={view.history} /> : <E1rmChart history={view.history} prs={view.prs} />}
      </section>
    </main>
  );
}
