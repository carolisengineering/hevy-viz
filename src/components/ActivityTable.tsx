import type { MeasureId, YearAverage } from "../core/health";
import { formatCount, formatHealth, formatYearLabel, type Unit } from "../format";

interface Props {
  /** Oldest first; shown newest first. */
  years: readonly YearAverage[];
  measure: MeasureId;
  unit: Unit;
}

/** The chart's yearly averages as a table: the year (or the part of it the range covers), its average, and the days behind it. */
export function ActivityTable({ years, measure, unit }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th className="num">Daily average</th>
            <th className="num">Days with data</th>
          </tr>
        </thead>
        <tbody>
          {years.toReversed().map((y) => (
            <tr key={y.year}>
              <td>{formatYearLabel(y)}</td>
              <td className="num">{formatHealth(measure, y.value, unit)}</td>
              <td className="num">{formatCount(y.days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
