import { useMemo } from "react";
import "./Balance.css";
import { GroupBars } from "../components/GroupBars";
import { groupVolumes, setsByPeriodAndGroup, setsPerWeekByMuscle } from "../core/balance";
import { muscleGroup, muscleLabel } from "../core/muscles";
import { seriesBy, windowFor, type DateRange } from "../core/ranges";
import type { Training } from "../core/training";
import { TIME_ZONE } from "../hooks/useTraining";
import { GroupGrid } from "./GroupGrid";

/** Where the training goes: the six groups, each group week by week, then every muscle trained in the range. */
export function Balance({ training, range }: { training: Training; range: DateRange }) {
  const muscles = useMemo(() => setsPerWeekByMuscle(training.data, TIME_ZONE, range, training.endDay), [training, range]);
  const groups = useMemo(() => groupVolumes(muscles), [muscles]);
  const { periods, by } = useMemo(() => {
    const w = windowFor(range, training.endDay, training.firstDay);
    const by = seriesBy(w);
    return { periods: setsByPeriodAndGroup(training.data, TIME_ZONE, w, by), by };
  }, [training, range]);
  // One scale for every bar on the page, so the same sets per week draw the same length.
  const max = Math.max(1, ...groups.map((g) => g.setsPerWeek), ...muscles.map((m) => m.setsPerWeek));

  return (
    <section className="balance-view" aria-labelledby="balance-title">
      <div className="view-head">
        <h2 id="balance-title" className="display">
          Balance
        </h2>
        <p className="quiet">working sets per week · {range.label.toLowerCase()}</p>
      </div>

      <GroupBars groups={groups} max={max} large />
      <p className="quiet small balance-key">Groups in red get under half the sets of the median group.</p>

      {muscles.length > 0 && (
        <>
          <div className="section-head">
            <h3 className="display">{by === "week" ? "Week by week" : "Month by month"}</h3>
            <p className="quiet">dot size = working sets</p>
          </div>
          <GroupGrid periods={periods} by={by} />
        </>
      )}

      <div className="section-head">
        <h3 className="display">Every muscle</h3>
      </div>
      {muscles.length === 0 ? (
        <p className="no-match">No working sets in this range.</p>
      ) : (
        <table className="muscles">
          <thead>
            <tr>
              <th scope="col">Muscle</th>
              <th scope="col">Group</th>
              <th scope="col" className="num">
                Sets per week
              </th>
              <th scope="col">
                <span className="visually-hidden">Bar</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {muscles.map((m) => (
              <tr key={m.muscle}>
                <td>{muscleLabel(m.muscle)}</td>
                <td className="quiet">{muscleGroup(m.muscle)}</td>
                <td className="num value">{m.setsPerWeek.toFixed(1)}</td>
                <td className="bar-cell">
                  <svg className="bar" width="100%" height="16" aria-hidden="true">
                    <rect x="1" y="1" width={`${(m.setsPerWeek / max) * 96}%`} height="14" rx="2" />
                  </svg>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
