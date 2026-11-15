import type { ChartFormat } from "../charts/progressDraw";
import type { ProgressPoint } from "../core/progress";
import { formatDate } from "../format";

interface Props {
  /** Oldest first; shown newest first. */
  points: readonly ProgressPoint[];
  format: ChartFormat;
}

/** The chart's data as a table: date, the set, and the measure. */
export function ProgressTable({ points, format }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Set</th>
            <th className="num">{format.unit ? `${format.measure} (${format.unit})` : format.measure}</th>
          </tr>
        </thead>
        <tbody>
          {points.toReversed().map((p) => (
            <tr key={p.date}>
              <td>{formatDate(p.date)}</td>
              <td>{format.set(p)}</td>
              <td className="num">{format.value(p.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
