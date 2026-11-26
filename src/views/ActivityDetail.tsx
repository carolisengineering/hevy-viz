import { useLayoutEffect, useMemo, useState } from "react";
import "./Activity.css";
import { ActivityChart } from "../charts/ActivityChart";
import { ActivityMonthTable } from "../components/ActivityMonthTable";
import { ActivityTable } from "../components/ActivityTable";
import { BackArrow } from "../components/ink";
import { firstDayOf, healthEndDay, healthWindow, MEASURES, monthlyAverages, yearlyAverages, type MeasureId } from "../core/health";
import type { DateRange } from "../core/ranges";
import type { Training } from "../core/training";
import { formatMonth, healthFormat, type Unit } from "../format";
import type { HealthState } from "../hooks/useHealth";
import { routeHref } from "../hooks/useRoute";

interface Props {
  training: Training;
  health: HealthState;
  measure: MeasureId;
  range: DateRange;
  unit: Unit;
  /** Switches the range to all time, from the empty state. */
  onShowAll: () => void;
}

const BackLink = () => (
  <a className="back" href={routeHref({ view: "activity" })}>
    <BackArrow /> Activity
  </a>
);

/** One measure's page: its monthly averages over the range, a mark per year, and a table of the years. */
export function ActivityDetail({ training, health, measure, range, unit, onShowAll }: Props) {
  const [showTable, setShowTable] = useState(false);
  // A detail page opens at its top, not at the list's scroll position.
  useLayoutEffect(() => window.scrollTo(0, 0), [measure]);
  const days = health.status === "ready" ? health.data.days : undefined;
  const endDay = health.status === "ready" ? healthEndDay(training.endDay, health.data) : "";
  const w = useMemo(() => days && healthWindow(range, endDay, days), [days, range, endDay]);
  const months = useMemo(() => (days && w ? monthlyAverages(days, measure, w) : []), [days, w, measure]);
  const years = useMemo(() => (days && w ? yearlyAverages(days, measure, w) : []), [days, w, measure]);
  const format = useMemo(() => healthFormat(measure, unit), [measure, unit]);
  const info = MEASURES.find((m) => m.id === measure)!;

  let body;
  if (health.status === "loading") {
    body = <p className="quiet">Loading…</p>;
  } else if (health.status === "error") {
    body = <p className="notice">{health.message}</p>;
  } else if (health.status === "none") {
    body = <p>No Apple Health data yet.</p>;
  } else if (months.length === 0) {
    body = (
      <div className="empty-state">
        <p>No data in this range.</p>
        <button className="link" onClick={onShowAll}>
          Show all time
        </button>
      </div>
    );
  } else {
    body = showTable ? (
      <ActivityMonthTable months={months} measure={measure} unit={unit} />
    ) : (
      <ActivityChart months={months} years={years} format={format} label={info.label} />
    );
  }

  // Exercise and calories start with the Watch; the chart simply starts at the first month with data.
  const first = days ? firstDayOf(days, measure) : null;
  const watchStart = (measure === "exercise" || measure === "calories") && first != null && w != null && w.from < first;

  return (
    <section className="activity-detail" aria-labelledby="activity-detail-title">
      <BackLink />
      <div className="view-head">
        <h2 id="activity-detail-title" className="display">
          {info.label}
        </h2>
        <p className="quiet">Daily averages, by month and by year</p>
      </div>
      {watchStart && <p className="activity-asof">Apple Watch data starts {formatMonth(first.slice(0, 7))}</p>}
      <div className="box chart-box">
        <div className="box-head">
          <h3>Month by month</h3>
          {months.length > 0 && (
            <button type="button" className="link" onClick={() => setShowTable((v) => !v)}>
              {showTable ? "Show chart" : "Show table"}
            </button>
          )}
        </div>
        <p className="quiet small">
          {showTable
            ? "Average over days with data, by month, newest first."
            : "Average over days with data, by month. A raspberry mark shows each year's average; a month with no data leaves a break."}
        </p>
        {body}
      </div>
      {months.length > 0 && (
        <div className="box">
          <div className="box-head">
            <h3>Year by year</h3>
          </div>
          <ActivityTable years={years} measure={measure} unit={unit} />
        </div>
      )}
    </section>
  );
}
