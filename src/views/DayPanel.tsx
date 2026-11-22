import { Star } from "../components/ink";
import { workoutMinutes } from "../core/consistency";
import type { LatestEntry } from "../core/training";
import { formatClock, formatFullDate, formatMinutes, formatPointSet, type Unit } from "../format";
import { routeHref } from "../hooks/useRoute";

interface Props {
  day: string;
  /** The day's workouts, oldest first. */
  entries: LatestEntry[];
  unit: Unit;
  timeZone: string;
}

/** A picked day's workouts: each one's title, start and length, and every exercise's top set. */
export function DayPanel({ day, entries, unit, timeZone }: Props) {
  return (
    <section className="box day-panel" aria-labelledby="day-panel-title">
      <div className="box-head">
        <h3 id="day-panel-title">{formatFullDate(day)}</h3>
      </div>
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
                {sets.map(({ exercise, top, record }) => (
                  <li key={exercise.templateId}>
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
