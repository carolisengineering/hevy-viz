import type { E1rmPoint } from "../core/metrics";
import { formatKgPrecise, formatSet } from "../format";

interface Props {
  /** Oldest first; shown newest first. */
  history: E1rmPoint[];
}

export function E1rmTable({ history }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Set</th>
            <th>Est. 1RM</th>
          </tr>
        </thead>
        <tbody>
          {history.toReversed().map((p) => (
            <tr key={p.date}>
              <td>{p.date}</td>
              <td>{formatSet(p)}</td>
              <td>{formatKgPrecise(p.e1rm)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
