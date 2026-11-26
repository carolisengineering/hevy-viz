import type { MeasureId, MonthAverage } from "../core/health";
import { formatCount, formatHealth, formatMonthShort, type Unit } from "../format";

interface Props {
  /** Oldest first; shown newest first. */
  months: readonly MonthAverage[];
  measure: MeasureId;
  unit: Unit;
}

/** The chart's own data as a table: each month, its daily average, and the days behind it. */
export function ActivityMonthTable({ months, measure, unit }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th className="num">Daily average</th>
            <th className="num">Days with data</th>
          </tr>
        </thead>
        <tbody>
          {months.toReversed().map((m) => (
            <tr key={m.month}>
              <td>{formatMonthShort(m.month, "")}</td>
              <td className="num">{formatHealth(measure, m.value, unit)}</td>
              <td className="num">{formatCount(m.days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
