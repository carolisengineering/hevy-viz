import type { ReactNode } from "react";
import type { CalendarDay, CalendarMonth as Month } from "../core/calendar";
import { dayDotRadius, REST_DOT_RADIUS } from "../components/dayDot";
import { stepBand } from "../core/health";
import type { HealthDay } from "../core/types";
import { formatCount, formatFullDate, formatMonth } from "../format";
import { routeHref } from "../hooks/useRoute";

const WEEKDAYS = [
  ["Monday", "M"],
  ["Tuesday", "T"],
  ["Wednesday", "W"],
  ["Thursday", "T"],
  ["Friday", "F"],
  ["Saturday", "S"],
  ["Sunday", "S"],
] as const;

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

/** A day's number and its dot: sized by working sets, faint for a rest day, none outside the window. */
function DayMark({ cell }: { cell: CalendarDay }) {
  const trained = cell.inWindow && cell.sessions > 0;
  return (
    <>
      <span className="day-number">{Number(cell.day.slice(8))}</span>
      <svg className="day-dot" viewBox="0 0 8 8" aria-hidden="true">
        {trained ? <circle cx="4" cy="4" r={dayDotRadius(cell.sets)} /> : cell.inWindow && <circle className="rest" cx="4" cy="4" r={REST_DOT_RADIUS} />}
      </svg>
    </>
  );
}

/** Health data by date, or null when the calendar shows none. */
type HealthByDay = ReadonlyMap<string, HealthDay> | null | undefined;

function DayCell({ cell, selected, health }: { cell: CalendarDay; selected: boolean; health: HealthByDay }) {
  if (!cell.inWindow) {
    return (
      <td data-day={cell.day} className="outside">
        <DayMark cell={cell} />
      </td>
    );
  }
  const today = health?.get(cell.day);
  const shade = health ? `steps-${stepBand(today?.steps)}` : undefined;
  if (cell.sessions === 0 && !today) {
    return (
      <td data-day={cell.day} className={[shade, selected && "selected"].filter(Boolean).join(" ") || undefined}>
        <DayMark cell={cell} />
      </td>
    );
  }
  const load = cell.sessions === 0 ? "no sessions" : `${plural(cell.sessions, "session", "sessions")}, ${plural(cell.sets, "set", "sets")}`;
  const steps = today?.steps === undefined ? "" : `, ${plural(today.steps, "step", "steps")}`;
  return (
    <td data-day={cell.day} className={shade}>
      <a
        href={routeHref({ view: "calendar", day: cell.day })}
        className={selected ? "selected" : undefined}
        aria-current={selected ? "date" : undefined}
        aria-label={`${formatFullDate(cell.day)}: ${load}${steps}`}
      >
        <DayMark cell={cell} />
      </a>
    </td>
  );
}

/** One month as a Monday-first table, then `after` (the day panel, on narrow screens). With `health`, days are shaded by steps and Health-only days are links too. */
export function CalendarMonth({ month, selected, after, health }: { month: Month; selected: string | null; after?: ReactNode; health?: HealthByDay }) {
  return (
    <div className="calendar-month-block">
      <table className="calendar-month">
        <caption>
          {formatMonth(month.month)} · {plural(month.sessions, "session", "sessions")}
        </caption>
        <thead>
          <tr>
            {WEEKDAYS.map(([name, letter]) => (
              <th key={name} scope="col" abbr={name}>
                {letter}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {month.weeks.map((week) => (
            <tr key={week.find((c) => c != null)!.day}>
              {week.map((cell, i) => (cell ? <DayCell key={cell.day} cell={cell} selected={cell.day === selected} health={health} /> : <td key={`pad-${i}`} />))}
            </tr>
          ))}
        </tbody>
      </table>
      {after}
    </div>
  );
}
