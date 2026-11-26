import "./Activity.css";
import { useMemo } from "react";
import { ActivityAxis } from "../components/ActivityAxis";
import { ActivityRow } from "../components/ActivityRow";
import { StretchCard } from "../components/StretchCard";
import { healthEndDay, healthWindow, MEASURES, recentStretch } from "../core/health";
import type { DateRange } from "../core/ranges";
import type { Training } from "../core/training";
import { formatDate, type Unit } from "../format";
import type { HealthState } from "../hooks/useHealth";
import { TIME_ZONE } from "../hooks/useTraining";

interface Props {
  training: Training;
  health: HealthState;
  range: DateRange;
  unit: Unit;
  /** Whether the Hevy data is the sample, whose end day says nothing about a real health export. */
  hevyIsSample: boolean;
}

/** Five measures from Apple Health, each a row of monthly averages on one shared timeline. */
export function Activity({ training, health, range, unit, hevyIsSample }: Props) {
  // The card ignores the range picker, so it doesn't recompute when the range changes.
  const stretch = useMemo(() => (health.status === "ready" ? recentStretch(health.data, training, TIME_ZONE) : null), [health, training]);
  let body;
  if (health.status === "loading") {
    body = <p className="quiet">Loading…</p>;
  } else if (health.status === "error") {
    body = <p className="notice">{health.message}</p>;
  } else if (health.status === "none") {
    body = (
      <div className="activity-empty">
        <p>No Apple Health data yet.</p>
        <p className="quiet">
          On your iPhone, open Health, tap your profile, then Export All Health Data, and send the zip to this computer. Then run{" "}
          <code>npm run health -- &lt;path to export.zip&gt;</code>.
        </p>
      </div>
    );
  } else {
    const { data } = health;
    const w = healthWindow(range, healthEndDay(training.endDay, data, hevyIsSample), data.days);
    body = (
      <>
        {stretch && <StretchCard stretch={stretch} unit={unit} />}
        <p className="activity-asof">Apple Health data as of {formatDate(data.export_date)}</p>
        <div className="activity-rows">
          {MEASURES.map((m) => (
            <ActivityRow key={m.id} measure={m} days={data.days} window={w} unit={unit} />
          ))}
          <ActivityAxis window={w} />
        </div>
      </>
    );
  }

  return (
    <section className="activity-view" aria-labelledby="activity-title">
      <div className="view-head">
        <h2 id="activity-title" className="display">
          Activity
        </h2>
        <p className="quiet">Daily averages, month by month</p>
      </div>
      {body}
    </section>
  );
}
