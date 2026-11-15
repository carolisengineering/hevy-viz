import { useMemo } from "react";
import "./Balance.css";
import { GroupBars } from "../components/GroupBars";
import { setsPerWeekByGroup, setsPerWeekByMuscle } from "../core/balance";
import { muscleGroup, muscleLabel } from "../core/muscles";
import type { DateRange } from "../core/ranges";
import { TIME_ZONE, type Training } from "../hooks/useTraining";

/** Where the training goes: the six groups, then every muscle trained in the range. */
export function Balance({ training, range }: { training: Training; range: DateRange }) {
  const groups = useMemo(() => setsPerWeekByGroup(training.data, TIME_ZONE, range, training.endDay), [training, range]);
  const muscles = useMemo(() => setsPerWeekByMuscle(training.data, TIME_ZONE, range, training.endDay), [training, range]);
  const max = Math.max(1, ...muscles.map((m) => m.setsPerWeek));

  return (
    <section className="balance-view" aria-labelledby="balance-title">
      <div className="view-head">
        <h2 id="balance-title" className="display">
          Balance
        </h2>
        <p className="quiet">working sets per week · {range.label.toLowerCase()}</p>
      </div>

      <GroupBars groups={groups} large />
      <p className="quiet small balance-key">Groups in red get under half the sets of the median group.</p>

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
