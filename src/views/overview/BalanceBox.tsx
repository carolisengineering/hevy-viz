import { useMemo } from "react";
import { setsPerWeekByGroup } from "../../core/balance";
import type { DateRange } from "../../core/ranges";
import { routeHref } from "../../hooks/useRoute";
import { TIME_ZONE, type Training } from "../../hooks/useTraining";

/** Working sets per week for the six main groups, as scribbled bars. Light groups are drawn in red. */
export function BalanceBox({ training, range }: { training: Training; range: DateRange }) {
  const groups = useMemo(() => setsPerWeekByGroup(training.data, TIME_ZONE, range, training.endDay), [training, range]);
  const max = Math.max(1, ...groups.map((g) => g.setsPerWeek));

  return (
    <section className="box balance-box" aria-labelledby="balance-box-title">
      <div className="box-head">
        <h3 id="balance-box-title">Balance</h3>
        <span className="quiet">working sets per week</span>
      </div>
      <ul>
        {groups.map((g) => (
          <li key={g.group} className={g.light ? "light" : undefined}>
            <span className="group">{g.group}</span>
            <svg className="bar" width="100%" height="16" aria-hidden="true">
              <rect x="1" y="1" width={`${(g.setsPerWeek / max) * 96}%`} height="14" rx="2" />
            </svg>
            <span className="value">
              {g.setsPerWeek.toFixed(1)}
              {g.light && <span className="visually-hidden"> (light)</span>}
            </span>
          </li>
        ))}
      </ul>
      <a className="more" href={routeHref({ view: "balance" })}>
        Every muscle
      </a>
    </section>
  );
}
