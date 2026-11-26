import "./Activity.css";
import { ActivityAxis } from "../components/ActivityAxis";
import { ActivityRow } from "../components/ActivityRow";
import { healthEndDay, healthWindow, MEASURES } from "../core/health";
import type { DateRange } from "../core/ranges";
import type { Training } from "../core/training";
import { formatDate, type Unit } from "../format";
import type { HealthState } from "../hooks/useHealth";

interface Props {
  training: Training;
  health: HealthState;
  range: DateRange;
  unit: Unit;
}

/** Five measures from Apple Health, each a row of monthly averages on one shared timeline. */
export function Activity({ training, health, range, unit }: Props) {
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
    const w = healthWindow(range, healthEndDay(training.endDay, data), data.days);
    body = (
      <>
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
