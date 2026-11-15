import { useMemo } from "react";
import { Sparkline, Star, Stripe } from "../../components/ink";
import { sideOf, type Side } from "../../core/muscles";
import { recordsBy, summarize, type ExerciseProgress } from "../../core/progress";
import type { DateRange } from "../../core/ranges";
import { chartFormat, formatChange, formatShortDate, valueUnit, type Unit } from "../../format";
import { routeHref } from "../../hooks/useRoute";
import { mainLiftsIn, type Training } from "../../hooks/useTraining";

const SIDES: readonly { side: Side; label: string; title: string }[] = [
  { side: "lower", label: "Side A", title: "Lower" },
  { side: "upper", label: "Side B", title: "Upper" },
  { side: "bonus", label: "Bonus tracks", title: "Full body & core" },
];

interface Props {
  training: Training;
  range: DateRange;
  unit: Unit;
}

/** The main lifts as a cassette j-card: Side A lower, Side B upper, ranked by sessions in the range. */
export function MainLifts({ training, range, unit }: Props) {
  const lifts = useMemo(() => mainLiftsIn(training, range), [training, range]);
  const hasAnyLift = training.exercises.some((e) => e.metric === "e1rm");
  const sides = useMemo(
    () =>
      SIDES.map((s) => ({
        ...s,
        rows: lifts.map((m, i) => ({ lift: m.lift, rank: i + 1 })).filter((r) => sideOf(r.lift.muscle) === s.side),
      })).filter((s) => s.rows.length > 0),
    [lifts],
  );

  return (
    <section className="main-lifts" aria-labelledby="main-lifts-title">
      <div className="section-head">
        <h2 id="main-lifts-title" className="display">
          Main lifts
        </h2>
        <p className="tracklist-note quiet">best set · change in range · latest est. 1RM {valueUnit("e1rm", unit)}</p>
      </div>
      {lifts.length === 0 ? (
        <p className="no-lifts">
          {hasAnyLift ? "No weight-and-reps sessions in this range." : "No weight-and-reps sets yet."} Every exercise is
          under <a href={routeHref({ view: "exercises" })}>Exercises</a>.
        </p>
      ) : (
        <table className="tracklist">
          <thead className="visually-hidden">
            <tr>
              <th scope="col">Rank by sessions in range</th>
              <th scope="col">Lift</th>
              <th scope="col">Best set in range</th>
              <th scope="col">Change in range</th>
              <th scope="col">Trend</th>
              <th scope="col">Latest est. 1RM ({unit})</th>
            </tr>
          </thead>
          {sides.map((s) => (
            <tbody key={s.side}>
              <tr className="side">
                <th scope="rowgroup" colSpan={6}>
                  <u>{s.label}</u> — {s.title}
                </th>
              </tr>
              {s.rows.map((r) => (
                <TrackRow key={r.lift.templateId} lift={r.lift} rank={r.rank} range={range} endDay={training.endDay} unit={unit} />
              ))}
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}

interface RowProps {
  lift: ExerciseProgress;
  rank: number;
  range: DateRange;
  endDay: string;
  unit: Unit;
}

function TrackRow({ lift, rank, range, endDay, unit }: RowProps) {
  const s = summarize(lift.points, range, endDay);
  const format = chartFormat(lift.metric, lift.type, unit);
  const bestInRange = recordsBy(s.history).at(-1);
  const lastPr = s.prs.at(-1);
  const change = s.change == null ? null : formatChange(lift.metric, s.change, unit);
  const fell = s.change != null && s.change < 0 && change !== "±0";
  // The last word and the star never part, so a wrapped name keeps its star on the line.
  const split = lift.title.lastIndexOf(" ") + 1;
  const [head, tail] = [lift.title.slice(0, split), lift.title.slice(split)];

  return (
    <tr className={lastPr ? "pr" : undefined}>
      <td className="rank">
        {String(rank).padStart(2, "0")}
        {lastPr && (
          <span className="margin-note note" aria-hidden="true">
            PR {formatShortDate(lastPr.date)}
          </span>
        )}
      </td>
      <td className="name">
        <a href={routeHref({ view: "exercises", exerciseId: lift.templateId })}>
          {head}
          <span className="name-tail">
            {tail}
            {lastPr && <Star size={18} title={`PR on ${formatShortDate(lastPr.date)}`} />}
          </span>
        </a>
        {/* Phones show the best set here; the best-set column is hidden there. */}
        {bestInRange && <span className="best-sub">{format.set(bestInRange)}</span>}
      </td>
      <td className="best-set num">{bestInRange ? format.set(bestInRange) : "—"}</td>
      <td className="change num">{change == null ? "—" : fell ? <s className="regress">{change}</s> : change}</td>
      <td className="spark">
        <Sparkline points={s.history} />
      </td>
      <td className="current num">
        <span className="display">{s.current ? format.value(s.current.value) : "—"}</span>
        {lastPr && <Stripe />}
      </td>
    </tr>
  );
}
