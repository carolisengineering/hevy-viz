import "./GroupBars.css";
import type { GroupVolume } from "../core/balance";

/** Working sets per week per muscle group, as scribbled bars. Light groups are drawn in red. */
export function GroupBars({ groups, max, large = false }: { groups: readonly GroupVolume[]; max?: number; large?: boolean }) {
  // A full-width bar is `max` sets per week; by default the busiest group.
  const scale = max ?? Math.max(1, ...groups.map((g) => g.setsPerWeek));
  return (
    <ul className={large ? "group-bars large" : "group-bars"}>
      {groups.map((g) => (
        <li key={g.group} className={g.light ? "light" : undefined}>
          <span className="group">{g.group}</span>
          <svg className="bar" width="100%" height={large ? 26 : 16} aria-hidden="true">
            <rect x="1" y="1" width={`${(g.setsPerWeek / scale) * 96}%`} height={large ? 24 : 14} rx="2" />
          </svg>
          <span className="value">
            {g.setsPerWeek.toFixed(1)}
            {g.light && <span className="visually-hidden"> (light)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
