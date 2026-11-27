import { useLayoutEffect, useMemo, useRef } from "react";
import "./Calendar.css";
import { calendarMonths, dayEntries, pickDay } from "../core/calendar";
import { longestBreak, windowStats } from "../core/consistency";
import { healthByDay } from "../core/health";
import { windowFor, type DateRange, type DayWindow } from "../core/ranges";
import type { Training } from "../core/training";
import { formatCount, formatShortDate, stepBandLabel, type Unit } from "../format";
import type { HealthState } from "../hooks/useHealth";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { TIME_ZONE } from "../hooks/useTraining";
import { CalendarMonth } from "./CalendarMonth";
import { DayPanel } from "./DayPanel";

/** From this width the day panel gets a column of its own; below it, it sits under its month. */
const WIDE = "(min-width: 1000px)";

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

const BANDS = [1, 2, 3, 4, 5, 6] as const;

/** The six step shades and the hatch, with their ranges. */
function StepLegend() {
  return (
    <ul className="step-legend" aria-label="Steps">
      {BANDS.map((band) => (
        <li key={band}>
          <span className={`step-swatch steps-${band}`} aria-hidden="true" />
          {stepBandLabel(band)}
        </li>
      ))}
      <li>
        <span className="step-swatch steps-0" aria-hidden="true" />
        no data
      </li>
    </ul>
  );
}

interface Props {
  training: Training;
  range: DateRange;
  day?: string;
  unit: Unit;
  health: HealthState;
  hevyIsSample: boolean;
}

/** The range as month calendars, newest first, with a dot for each training day, and the picked day's workouts. With Health data, days are shaded by steps and the panel gets the day's totals. */
export function Calendar({ training, range, day, unit, health, hevyIsSample }: Props) {
  const w = useMemo(() => windowFor(range, training.endDay, training.firstDay), [range, training]);
  const months = useMemo(() => calendarMonths(training.days, w), [training, w]);
  const sessions = months.reduce((n, m) => n + m.sessions, 0);
  const selected = sessions === 0 ? null : pickDay(training.days, w, day);
  const entries = useMemo(() => (selected ? dayEntries(training, selected, TIME_ZONE) : []), [training, selected]);
  // Sample lifting is never drawn beside a real export.
  const byDay = useMemo(
    () => (health.status === "ready" && !(hevyIsSample && health.data.source === "apple-health") ? healthByDay(health.data.days, health.data.export_date) : null),
    [health, hevyIsSample],
  );
  const wide = useMediaQuery(WIDE);
  const panel = selected && <DayPanel day={selected} entries={entries} unit={unit} timeZone={TIME_ZONE} totals={byDay?.get(selected)} />;

  // On narrow screens the panel moves to the picked day's month. When it leaves a month
  // above, the page shifts up; browsers without scroll anchoring (Safari) then carry the
  // tapped day off screen. Bring it back, without moving focus.
  // A day opened from a link (a bookmark) starts centered on screen.
  const view = useRef<HTMLElement>(null);
  const shown = useRef(day != null ? null : selected);
  useLayoutEffect(() => {
    if (shown.current === selected) return;
    const opening = shown.current == null;
    shown.current = selected;
    const picked = view.current?.querySelector(".calendar-month .selected");
    if (opening) picked?.scrollIntoView({ block: "center" });
    else if (!wide) picked?.scrollIntoView({ block: "nearest" });
  }, [selected, wide]);

  return (
    <section ref={view} className="calendar-view" aria-labelledby="calendar-title">
      <div className="calendar-main">
        <div className="view-head">
          <h2 id="calendar-title" className="display">
            Calendar
          </h2>
          <p className="quiet">{byDay ? "dot size = working sets · shade = steps" : "dot size = working sets"}</p>
        </div>
        {sessions === 0 ? (
          <p className="quiet">No sessions in this range.</p>
        ) : (
          <>
            <p className="calendar-summary">{summary(training, w)}</p>
            {byDay && <StepLegend />}
            <div className="calendar-months">
              {months.map((m) => (
                <CalendarMonth
                  key={m.month}
                  month={m}
                  selected={selected}
                  health={byDay}
                  after={!wide && selected?.startsWith(m.month) ? panel : undefined}
                />
              ))}
            </div>
          </>
        )}
      </div>
      {wide && panel && <div className="calendar-side">{panel}</div>}
    </section>
  );
}
