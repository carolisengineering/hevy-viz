import { useMemo } from "react";
import { Star } from "../../components/ink";
import { toLocalDay } from "../../core/dates";
import { bestSet, recordsBy } from "../../core/progress";
import { formatLogDate, formatPointSet, type Unit } from "../../format";
import { routeHref } from "../../hooks/useRoute";
import { TIME_ZONE, type Training } from "../../hooks/useTraining";

const ENTRIES = 3;
const SETS_PER_ENTRY = 4;

/** The last three workouts as log lines: date, title, and each exercise's top set. */
export function LatestEntries({ training, unit }: { training: Training; unit: Unit }) {
  const entries = useMemo(() => {
    const latest = training.data.workouts.toSorted((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time)).slice(0, ENTRIES);
    return latest.map((w) => {
      const day = toLocalDay(w.start_time, TIME_ZONE);
      const sets = w.exercises.flatMap((ex) => {
        const exercise = training.index.get(ex.exercise_template_id);
        const top = exercise && bestSet(ex.sets, exercise.metric, day, w.id);
        if (!exercise || !top) return [];
        // An all-time record set in this workout.
        const record = recordsBy(exercise.points).some((r) => r.date === day && r.workoutId === w.id && r.value === top.value);
        return [{ exercise, top, record }];
      });
      return { workout: w, day, sets };
    });
  }, [training]);

  return (
    <section className="latest-entries" aria-labelledby="latest-title">
      <div className="section-head">
        <h2 id="latest-title" className="display">
          Latest entries
        </h2>
        <p className="quiet">top set per exercise</p>
      </div>
      <ol>
        {entries.map(({ workout, day, sets }) => (
          <li key={workout.id}>
            <span className="log-date">{formatLogDate(day)}</span>
            <span className="log-title">{workout.title}</span>
            <span className="log-sets">
              {sets.slice(0, SETS_PER_ENTRY).map(({ exercise, top, record }) => (
                <span key={exercise.templateId} className="log-set">
                  <a href={routeHref({ view: "exercises", exerciseId: exercise.templateId })}>{exercise.title}</a>{" "}
                  {formatPointSet(top, exercise.type, unit)}
                  {record && <Star size={15} title="All-time record" />}
                </span>
              ))}
              {sets.length > SETS_PER_ENTRY && <span className="log-set quiet">+{sets.length - SETS_PER_ENTRY} more</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
