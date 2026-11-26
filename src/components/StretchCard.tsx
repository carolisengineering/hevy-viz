import type { RecentStretch } from "../core/health";
import { STRETCH_LABELS, stretchComparison, stretchDates, stretchValue, type Unit } from "../format";

interface Props {
  stretch: RecentStretch;
  unit: Unit;
  /** "2026": a stretch that ended in an earlier year gives its year. */
  currentYear: string;
}

/** The last four weeks against the year before them, one row per measure. The range picker doesn't change it. */
export function StretchCard({ stretch, unit, currentYear }: Props) {
  const dates = stretchDates(stretch, currentYear);
  return (
    <section className="box stretch" aria-labelledby="stretch-title">
      <div className="box-head">
        <h3 id="stretch-title">Last 4 weeks</h3>
        <span className="quiet">{dates}, vs the past 12 months</span>
      </div>
      <table>
        <caption className="visually-hidden">Last 4 weeks, {dates}, against the past 12 months</caption>
        <tbody>
          {stretch.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{STRETCH_LABELS[row.id]}</th>
              <td className="num">{stretchValue(row, unit)}</td>
              <td className="stretch-vs">{stretchComparison(row, unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
