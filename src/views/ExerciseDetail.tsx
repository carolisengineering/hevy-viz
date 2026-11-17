import { useLayoutEffect, useMemo, useState } from "react";
import "./Exercises.css";
import { ProgressChart } from "../charts/ProgressChart";
import { EmptyRange } from "../components/EmptyRange";
import { BackArrow } from "../components/ink";
import { ProgressTable } from "../components/ProgressTable";
import { muscleLabel } from "../core/muscles";
import { METRIC_LABEL, summarize } from "../core/progress";
import type { DateRange } from "../core/ranges";
import { chartFormat, formatChange, formatCount, formatDate, type Unit } from "../format";
import { routeHref } from "../hooks/useRoute";
import type { Training } from "../core/training";

interface Props {
  training: Training;
  exerciseId: string;
  range: DateRange;
  unit: Unit;
  /** Switches the range to all time, from the empty state. */
  onShowAll: () => void;
}

const BackLink = () => (
  <a className="back" href={routeHref({ view: "exercises" })}>
    <BackArrow /> All exercises
  </a>
);

/** One exercise: its figures and its progress chart in the chosen range. */
export function ExerciseDetail({ training, exerciseId, range, unit, onShowAll }: Props) {
  const exercise = training.index.get(exerciseId);
  const [showTable, setShowTable] = useState(false);
  // An exercise page opens at its top, not at the list's scroll position.
  useLayoutEffect(() => window.scrollTo(0, 0), [exerciseId]);
  const summary = useMemo(() => exercise && summarize(exercise.points, range, training.endDay), [exercise, range, training.endDay]);
  const format = useMemo(() => exercise && chartFormat(exercise.metric, exercise.type, unit), [exercise, unit]);

  if (!exercise || !summary || !format) {
    return (
      <section className="exercise-page">
        <BackLink />
        <div className="no-match">
          <p>No exercise with that id</p>
          <p className="quiet">The link may be from another dataset, or the exercise was removed in Hevy.</p>
        </div>
      </section>
    );
  }

  const measure = METRIC_LABEL[exercise.metric];
  const hasSets = exercise.points.length > 0;
  const isEmpty = summary.history.length === 0;
  const figure = (value: string) => (
    <dd>
      <strong>{value}</strong>
      {format.unit && value !== "—" && <span className="unit"> {format.unit}</span>}
    </dd>
  );

  return (
    <section className="exercise-page" aria-labelledby="exercise-title">
      <BackLink />
      <div className="view-head">
        <h2 id="exercise-title" className="display">
          {exercise.title}
        </h2>
        <p className="exercise-meta quiet">
          {muscleLabel(exercise.muscle)} · {measure} · {formatCount(exercise.sessions)} sessions
        </p>
      </div>

      {!hasSets ? (
        <div className="no-match">
          <p>No sets to chart</p>
          <p className="quiet">None of its working sets has a weight, reps, time or distance.</p>
        </div>
      ) : (
        <>
          <dl className="figures">
            <div className="best">
              <dt>Best ever · {formatDate(summary.best!.date)}</dt>
              {figure(format.value(summary.best!.value))}
            </div>
            <div className="latest">
              <dt>Latest in range</dt>
              {figure(summary.current ? format.value(summary.current.value) : "—")}
            </div>
            <div className="change">
              <dt>Change in range</dt>
              {figure(summary.change == null ? "—" : formatChange(exercise.metric, summary.change, unit))}
            </div>
            <div className="sessions">
              <dt>Days charted in range</dt>
              <dd>
                <strong>{formatCount(summary.history.length)}</strong>
              </dd>
            </div>
            <div className="prs">
              <dt>PRs in range</dt>
              <dd>
                <strong>{formatCount(summary.prs.length)}</strong>
              </dd>
            </div>
          </dl>

          <div className="box chart-box">
            <div className="box-head">
              <h3>{measure}</h3>
              {!isEmpty && (
                <button type="button" className="link" onClick={() => setShowTable((v) => !v)}>
                  {showTable ? "Show chart" : "Show table"}
                </button>
              )}
            </div>
            <p className="quiet small">
              {exercise.metric === "e1rm"
                ? "Best working set per session, estimated with the Epley formula. Stars mark PRs."
                : "Best working set per session. Stars mark PRs."}
            </p>
            {isEmpty ? (
              <EmptyRange lastSession={summary.lastSession} onShowAll={onShowAll} />
            ) : showTable ? (
              <ProgressTable points={summary.history} format={format} />
            ) : (
              <ProgressChart points={summary.history} prs={summary.prs} format={format} label={`${exercise.title}: ${measure}`} />
            )}
          </div>
        </>
      )}
    </section>
  );
}
