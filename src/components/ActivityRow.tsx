import { firstDayOf, latestCompleteMonth, monthlyAverages, windowAverage, type MeasureId } from "../core/health";
import type { DayWindow } from "../core/ranges";
import type { HealthDay } from "../core/types";
import { formatHealth, formatMonthShort, type Unit } from "../format";
import { routeHref } from "../hooks/useRoute";
import { monthsIn } from "./ActivityAxis";

const W = 520;
const H = 40;
const PAD = 6;

interface Props {
  measure: { id: MeasureId; label: string };
  days: readonly HealthDay[];
  /** The shared window, so every row's months line up. */
  window: DayWindow;
  unit: Unit;
}

/**
 * One measure on the Activity tab: its label, a line of monthly averages across the shared window
 * with a dashed line at the window's average, and the latest complete month's value on the right.
 * The whole row is one link to the measure's page.
 */
export function ActivityRow({ measure, days, window: w, unit }: Props) {
  const months = monthsIn(w);
  const averages = monthlyAverages(days, measure.id, w);
  const average = windowAverage(days, measure.id, w);
  const latest = latestCompleteMonth(days, measure.id, w.to);
  const first = firstDayOf(days, measure.id);
  const currentYear = w.to.slice(0, 4);

  // x by month across the whole window; a month with no data breaks the line.
  const column = new Map(months.map((m, i) => [m, i]));
  const x = (i: number) => ((i + 0.5) / months.length) * W;
  const values = averages.map((a) => a.value);
  const lo = Math.min(...values);
  const span = Math.max(...values) - lo;
  const y = (v: number) => (span === 0 ? H / 2 : H - PAD - ((v - lo) / span) * (H - 2 * PAD));
  let d = "";
  let previous = -2;
  for (const a of averages) {
    const i = column.get(a.month)!;
    d += `${i === previous + 1 ? "L" : "M"}${x(i).toFixed(1)},${y(a.value).toFixed(1)} `;
    previous = i;
  }
  const point = (month: string) => {
    const a = averages.find((v) => v.month === month);
    return a ? { left: ((column.get(month)! + 0.5) / months.length) * 100, top: (y(a.value) / H) * 100 } : null;
  };
  // A month with no neighbor draws no line segment, so it gets a dot of its own.
  const has = new Set(averages.map((a) => a.month));
  const loneMonths = averages.filter((a) => {
    const i = column.get(a.month)!;
    return !has.has(months[i - 1] ?? "") && !has.has(months[i + 1] ?? "");
  });
  const lones = loneMonths.map((a) => ({ month: a.month, ...point(a.month)! }));
  const mark = latest ? point(latest.month) : null;
  // The dashed average starts where this measure's data does inside the window.
  const averageFrom = averages.length ? (column.get(averages[0].month)! / months.length) * W : 0;

  // "before your Watch": exercise and calories start with the Watch, so the stretch before their first day
  // (or the whole window, when it ends first) is not missing data. It is said under the row's name.
  const beforeWatch = (measure.id === "exercise" || measure.id === "calories") && first != null && w.from < first;
  // Any other measure that starts inside the window says so, so the blank stretch before it is not a mystery.
  const startsLater = !beforeWatch && measure.id !== "exercise" && measure.id !== "calories" && first != null && w.from < first;
  const startsText = startsLater ? `starts ${formatMonthShort(first.slice(0, 7), "")}` : null;

  const latestText = latest ? formatHealth(measure.id, latest.value, unit) : null;
  const latestMonth = latest ? formatMonthShort(latest.month, currentYear) : null;
  const label = [
    measure.label,
    latest ? `${latestMonth}: ${latestText}` : "no complete month yet",
    average == null ? "no data in this range" : `average ${formatHealth(measure.id, average, unit)} in this range`,
    ...(beforeWatch ? ["range starts before your Watch data"] : []),
    ...(startsText ? [`range ${startsText}`] : []),
  ].join(", ");

  return (
    <a className="activity-row" href={routeHref({ view: "activity", measure: measure.id })} aria-label={label}>
      <span className="activity-name">
        <span className="activity-label">{measure.label}</span>
        {beforeWatch && <span className="activity-sub">before your Watch</span>}
        {startsText && <span className="activity-sub">{startsText}</span>}
      </span>
      <span className="activity-chart">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {average != null && (
            <line
              className="activity-average"
              x1={averageFrom}
              x2={W}
              y1={y(average)}
              y2={y(average)}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {d && <path className="activity-line" d={d} vectorEffect="non-scaling-stroke" />}
        </svg>
        {lones.map((l) => (
          <span key={l.month} className="activity-dot" style={{ left: `${l.left}%`, top: `${l.top}%` }} />
        ))}
        {mark && <span className="activity-mark" style={{ left: `${mark.left}%`, top: `${mark.top}%` }} />}
        {average == null && !beforeWatch && <span className="activity-note">No data in this range</span>}
      </span>
      <span className="activity-value">
        {latest ? (
          <>
            <strong>{latestText}</strong>
            <span className="activity-when">{latestMonth}</span>
          </>
        ) : (
          <span className="activity-when">none yet</span>
        )}
      </span>
    </a>
  );
}
