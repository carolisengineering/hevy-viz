import { useState } from "react";
import "./App.css";
import { Header } from "./components/Header";
import { ScribbleDefs } from "./components/ink";
import { rangeById, type RangeId } from "./core/ranges";
import type { HevyDataset } from "./core/types";
import type { Unit } from "./format";
import { useDataset } from "./hooks/useDataset";
import { usePreference } from "./hooks/usePreference";
import { useRoute } from "./hooks/useRoute";
import { useTraining } from "./hooks/useTraining";
import { Balance } from "./views/Balance";
import { ExerciseDetail } from "./views/ExerciseDetail";
import { Exercises } from "./views/Exercises";
import { Overview } from "./views/Overview";

const UNITS: readonly Unit[] = ["kg", "lb"];

export default function App() {
  const dataset = useDataset();
  if (dataset.status === "error") return <main className="viz-root"><p className="notice">{dataset.message}</p></main>;
  if (dataset.status === "loading") return <main className="viz-root"><p className="quiet">Loading…</p></main>;
  return <Dashboard data={dataset.data} skipped={dataset.skipped} />;
}

function Dashboard({ data, skipped }: { data: HevyDataset; skipped: number }) {
  const training = useTraining(data);
  const [rangeId, setRangeId] = useState<RangeId>("all");
  const [unit, setUnit] = usePreference("hevy-viz:unit", UNITS, "kg");
  const [route, navigate] = useRoute();
  const [query, setQuery] = useState("");
  const range = rangeById(rangeId);

  const onQuery = (q: string) => {
    setQuery(q);
    if (route.view !== "exercises" || route.exerciseId != null) navigate({ view: "exercises" });
  };

  return (
    <>
      <ScribbleDefs />
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
        {route.view === "exercises" && route.exerciseId != null ? (
          <ExerciseDetail
            training={training}
            exerciseId={route.exerciseId}
            range={range}
            unit={unit}
            onShowAll={() => setRangeId("all")}
          />
        ) : route.view === "exercises" ? (
          <Exercises training={training} range={range} unit={unit} query={query} onQuery={setQuery} />
        ) : route.view === "overview" ? (
          <Overview training={training} range={range} unit={unit} />
        ) : (
          <Balance training={training} range={range} />
        )}
      </main>
    </>
  );
}
