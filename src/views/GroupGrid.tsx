import { Fragment } from "react";
import type { GroupPeriod } from "../core/balance";
import { MAIN_GROUPS } from "../core/muscles";
import { parseDay } from "../core/dates";
import type { Period } from "../core/ranges";
import { formatShortDate } from "../format";

/** One cell, in svg units, the same as the Consistency grid's. */
const CELL = 8;
/** Largest drawn scale, in px per svg unit, so a short range's dots don't balloon. */
const MAX_ZOOM = 3.6;
/** A month or year label needs this many columns before the next one. */
const TICK_SPACE = 3;
/** Week grids longer than this mark off-quarter month labels, which phones then hide. */
const DENSE_WEEKS = 26;
const QUARTER_MONTHS = new Set(["01", "04", "07", "10"]);
const REST_RADIUS = 1;

const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const monthYearFormat = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Legs, week of Nov 9: 14 sets", "Legs, week of Nov 17, 2025: …" in a grid spanning years, or "Legs, Oct 2025: 48 sets". */
function cellTitle(group: string, start: string, by: Period, n: number, withYear: boolean): string {
  const week = `week of ${formatShortDate(start)}${withYear ? `, ${start.slice(0, 4)}` : ""}`;
  const when = by === "week" ? week : monthYearFormat.format(parseDay(start));
  return `${group}, ${when}: ${n} ${n === 1 ? "set" : "sets"}`;
}

/**
 * Labels over the columns: the month where a new one starts (weeks), with January written
 * as its year, or the year at each January (months). The first column is labeled too, unless the next label is too close.
 * In a dense grid, months off the quarter are marked minor, for narrow screens to drop.
 */
function ticks(periods: readonly GroupPeriod[], by: Period, dense: boolean): { column: number; text: string; minor: boolean }[] {
  const keyOf = (start: string) => (by === "week" ? start.slice(0, 7) : start.slice(0, 4));
  const textOf = (start: string) => (by === "week" && start.slice(5, 7) !== "01" ? monthFormat.format(parseDay(start)) : start.slice(0, 4));
  const changes = periods.flatMap((p, i) => (i > 0 && keyOf(p.start) !== keyOf(periods[i - 1].start) ? [i] : []));
  const tick = (column: number) => {
    const start = periods[column].start;
    return { column, text: textOf(start), minor: dense && !QUARTER_MONTHS.has(start.slice(5, 7)) };
  };
  const out = changes.map(tick);
  if (periods.length > 0 && (changes.length === 0 || changes[0] >= TICK_SPACE)) out.unshift(tick(0));
  return out;
}

/** Working sets for the six main groups, one row each and one column per period, as dots sized by sets. */
export function GroupGrid({ periods, by }: { periods: GroupPeriod[]; by: Period }) {
  const columns = periods.length;
  // One scale for the whole grid: the busiest cell gets the full-size dot.
  const max = Math.max(1, ...periods.flatMap((p) => p.sets));
  const radius = (sets: number) => 1.5 + 2.1 * Math.sqrt(sets / max);
  const width = { maxWidth: Math.round(columns * CELL * MAX_ZOOM) };
  const dense = by === "week" && columns > DENSE_WEEKS;
  const spansYears = columns > 0 && periods[0].start.slice(0, 4) !== periods[columns - 1].start.slice(0, 4);

  return (
    <div
      className={dense ? "group-grid dense" : "group-grid"}
      role="img"
      aria-label={`Working sets per ${by} for Legs, Back, Chest, Shoulders, Arms and Core, over ${columns} ${by}s`}
    >
      <div className="group-grid-ticks" style={width}>
        {ticks(periods, by, dense).map((t) => (
          <span key={t.column} className={t.minor ? "minor" : undefined} style={{ left: `${(t.column / columns) * 100}%` }}>
            {t.text}
          </span>
        ))}
      </div>
      {MAIN_GROUPS.map((group, row) => (
        <Fragment key={group}>
          <span className="group-grid-label">{group}</span>
          <svg viewBox={`0 0 ${columns * CELL} ${CELL}`} style={width}>
            {periods.map((p, i) => {
              const n = p.sets[row];
              const cx = i * CELL + CELL / 2;
              return n > 0 ? (
                <circle key={p.start} cx={cx} cy={CELL / 2} r={radius(n)}>
                  <title>{cellTitle(group, p.start, by, n, spansYears)}</title>
                </circle>
              ) : (
                <circle key={p.start} className="rest" cx={cx} cy={CELL / 2} r={REST_RADIUS} />
              );
            })}
          </svg>
        </Fragment>
      ))}
    </div>
  );
}
