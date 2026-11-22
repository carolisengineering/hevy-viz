import { useMemo } from "react";
import "./Calendar.css";
import { calendarMonths, latestTrainingDay } from "../core/calendar";
import { longestBreak, windowStats } from "../core/consistency";
import { windowFor, type DateRange, type DayWindow } from "../core/ranges";
import type { Training } from "../core/training";
import { formatCount, formatShortDate } from "../format";
import { CalendarMonth } from "./CalendarMonth";

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** "48 sessions · 3.7 a week · 13 of 14 weeks trained · longest break 4 days, Oct 2–Oct 5" */
function summary(training: Training, w: DayWindow): string {
  const stats = windowStats(training.days, w);
  const parts = [
    plural(stats.sessions, "session", "sessions"),
    `${stats.sessionsPerWeek} a week`,
    `${formatCount(stats.weeksTrained)} of ${plural(stats.weeks, "week", "weeks")} trained`,
  ];
  const rest = longestBreak(training.days, w);
  if (rest) {
    const when = rest.days === 1 ? formatShortDate(rest.from) : `${formatShortDate(rest.from)}–${formatShortDate(rest.to)}`;
    parts.push(`longest break ${plural(rest.days, "day", "days")}, ${when}`);
  }
  return parts.join(" · ");
}

/** The range as month calendars, newest first, with a dot for each training day. */
export function Calendar({ training, range, day }: { training: Training; range: DateRange; day?: string }) {
  const w = useMemo(() => windowFor(range, training.endDay, training.firstDay), [range, training]);
  const months = useMemo(() => calendarMonths(training.days, w), [training, w]);
  const sessions = months.reduce((n, m) => n + m.sessions, 0);
  const selected = day != null && day >= w.from && day <= w.to ? day : latestTrainingDay(training.days, w);

  return (
    <section className="calendar-view" aria-labelledby="calendar-title">
      <div className="calendar-main">
        <div className="view-head">
          <h2 id="calendar-title" className="display">
            Calendar
          </h2>
          <p className="quiet">dot size = working sets</p>
        </div>
        {sessions === 0 ? (
          <p className="quiet">No sessions in this range.</p>
        ) : (
          <>
            <p className="calendar-summary">{summary(training, w)}</p>
            <div className="calendar-months">
              {months.map((m) => (
                <CalendarMonth key={m.month} month={m} selected={selected} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
