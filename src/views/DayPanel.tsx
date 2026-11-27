import { Star } from "../components/ink";
import { workoutMinutes } from "../core/consistency";
import type { LatestEntry } from "../core/training";
import type { HealthDay } from "../core/types";
import { formatClock, formatDayTotals, formatFullDate, formatMinutes, formatPointSet, type Unit } from "../format";
import { routeHref } from "../hooks/useRoute";

interface Props {
  day: string;
  /** The day's workouts, oldest first. */
  entries: LatestEntry[];
  unit: Unit;
  timeZone: string;
  /** The day's Apple Health figures, when the calendar shows them. */
  totals?: HealthDay;
}

/** A picked day's Health totals, then its workouts: each one's title, start and length, and every exercise's top set. */
export function DayPanel({ day, entries, unit, timeZone, totals }: Props) {
  const totalsLine = totals ? formatDayTotals(totals, unit) : "";
  return (
    <section className="box day-panel" aria-labelledby="day-panel-title">
      <div className="box-head">
        <h3 id="day-panel-title">{formatFullDate(day)}</h3>
      </div>
      {totalsLine && <p className="day-totals">{totalsLine}</p>}
      {entries.length === 0 ? (
        <p className="quiet">Rest day.</p>
      ) : (
        entries.map(({ workout, sets }) => {
          const minutes = workoutMinutes(workout);
          return (
            <article key={workout.id} className="day-workout">
              <h4>{workout.title}</h4>
              <p className="quiet">
                {formatClock(workout.start_time, timeZone)}
                {minutes != null && ` · ${formatMinutes(minutes)}`}
              </p>
              <ul>
                {/* Hevy lets a workout list the same exercise twice, so the id alone isn't a unique key. */}
                {sets.map(({ exercise, top, record }, i) => (
                  <li key={`${exercise.templateId}-${i}`}>
                    <a href={routeHref({ view: "exercises", exerciseId: exercise.templateId })}>{exercise.title}</a>{" "}
                    <span className="day-set">{formatPointSet(top, exercise.type, unit)}</span>
                    {record && <Star size={15} title="All-time record" />}
                  </li>
                ))}
              </ul>
            </article>
          );
        })
      )}
    </section>
  );
}
