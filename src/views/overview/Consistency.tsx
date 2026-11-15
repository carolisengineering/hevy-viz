import { useMemo } from "react";
import { dayGrid, monthlySessions } from "../../core/consistency";
import type { DateRange } from "../../core/ranges";
import { formatCount, formatLogDate } from "../../format";
import type { Training } from "../../hooks/useTraining";

/** One grid cell, in svg units. */
const CELL = 12;
/** The largest dot fits inside its cell. */
const MAX_RADIUS = 5.4;
const radius = (sets: number) => Math.min(MAX_RADIUS, 1.3 + sets / 6);

/** Sessions this month against the usual month, and a year of training days as dots. */
export function Consistency({ training, range }: { training: Training; range: DateRange }) {
  const { thisMonth, monthlyAverage } = useMemo(() => monthlySessions(training.days, training.endDay), [training]);
  const weeks = range.id === "90d" ? 13 : 52;
  const grid = useMemo(() => dayGrid(training.days, training.endDay, weeks), [training, weeks]);
  const month = training.endDay.slice(0, 7);
  const trained = grid.reduce((n, w) => n + w.days.filter((d) => d.sets > 0).length, 0);
  // The 13-week grid draws larger so it still fills the box.
  const zoom = weeks <= 13 ? 2.4 : 1;

  return (
    <section className="box consistency" aria-labelledby="consistency-title">
      <div className="box-head">
        <h3 id="consistency-title">Consistency</h3>
        <span className="quiet">dot size = working sets</span>
      </div>
      <div className="figure-pair">
        <p>
          <strong className="display">{formatCount(thisMonth)}</strong>
          <span>sessions this month</span>
        </p>
        <p className="faded">
          <strong className="display">{monthlyAverage == null ? "—" : monthlyAverage.toFixed(1)}</strong>
          <span>monthly average</span>
        </p>
      </div>
      <svg
        className="dot-grid"
        viewBox={`0 0 ${weeks * CELL} ${7 * CELL}`}
        width={weeks * CELL * zoom}
        role="img"
        aria-label={`${formatCount(trained)} training days in the last ${weeks} weeks`}
      >
        {grid.map((week, i) =>
          week.days.map((d, j) =>
            d.sets > 0 ? (
              <circle
                key={d.day}
                cx={i * CELL + CELL / 2}
                cy={j * CELL + CELL / 2}
                r={radius(d.sets)}
                className={d.day.startsWith(month) ? "this-month" : undefined}
              >
                <title>
                  {formatLogDate(d.day)}: {d.sets} {d.sets === 1 ? "set" : "sets"}
                </title>
              </circle>
            ) : null,
          ),
        )}
      </svg>
    </section>
  );
}
