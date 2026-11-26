// D3 drawing steps for an Activity detail chart: monthly averages as an ink line that breaks at
// months with no data, a short raspberry mark per year at that year's average, and a crosshair
// tooltip. The frame, grid and axes come from progressDraw; a month sits on its 15th day.
import * as d3 from "d3";
import { parseDay } from "../core/dates";
import type { MonthAverage, YearAverage } from "../core/health";
import { formatCount, formatMonthShort, type ChartFormat } from "../format";
import { LONE_DOT_RADIUS, valueHeadline, xOf, yOf, type Frame, type TooltipRenderer } from "./progressDraw";

/** A month's average placed on the month's 15th, which is what the shared frame reads. */
export interface MonthPoint extends MonthAverage {
  date: string;
}

export const toPoints = (months: readonly MonthAverage[]): MonthPoint[] => months.map((m) => ({ ...m, date: `${m.month}-15` }));

const monthIndex = (month: string): number => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));

/** Runs of consecutive months. A month with no data ends a run; nothing bridges it. */
export function lineSegments<T extends { month: string }>(months: readonly T[]): T[][] {
  const runs: T[][] = [];
  for (const m of months) {
    const run = runs.at(-1);
    if (run && monthIndex(run.at(-1)!.month) + 1 === monthIndex(m.month)) run.push(m);
    else runs.push([m]);
  }
  return runs;
}

export interface YearMark {
  year: string;
  /** First and last "YYYY-MM" of the run. */
  from: string;
  to: string;
  value: number;
}

/** One mark per run of consecutive months with data in a year, at that year's average; a month with no data leaves a gap. */
export function yearMarks(months: readonly MonthAverage[], years: readonly YearAverage[]): YearMark[] {
  const marks: YearMark[] = [];
  for (const y of years) {
    for (const run of lineSegments(months.filter((m) => m.month.startsWith(y.year)))) {
      marks.push({ year: y.year, from: run[0].month, to: run.at(-1)!.month, value: y.value });
    }
  }
  return marks;
}

/**
 * The ink line, one stroke per run of consecutive months. `drawIn` plays the pen stroke (first draw
 * after the data changes, never on a resize). A month alone between gaps is a dot.
 */
export function drawMonths(f: Frame, points: readonly MonthPoint[], drawIn: boolean): void {
  const line = d3
    .line<MonthPoint>()
    .x((p) => xOf(f, p))
    .y((p) => yOf(f, p))
    .curve(d3.curveMonotoneX);
  const runs = lineSegments(points);
  f.svg
    .selectAll("path.series-line")
    .data(runs.filter((r) => r.length > 1))
    .join("path")
    .attr("class", drawIn ? "series-line draw-in" : "series-line")
    .attr("pathLength", drawIn ? 1 : null)
    .attr("d", (r) => line(r));
  f.svg
    .append("g")
    .selectAll("circle")
    .data(runs.filter((r) => r.length === 1).map((r) => r[0]))
    .join("circle")
    .attr("class", "series-dot")
    .attr("r", LONE_DOT_RADIUS)
    .attr("cx", (p) => xOf(f, p))
    .attr("cy", (p) => yOf(f, p));
}

/** A short raspberry stroke per year across its months, at the year's average. */
export function drawYearMarks(f: Frame, marks: readonly YearMark[]): void {
  const [left, right] = f.x.range();
  const edge = (month: string, end: boolean) => {
    const start = parseDay(`${month}-01`);
    return Math.min(right, Math.max(left, f.x(end ? d3.utcMonth.offset(start, 1) : start)));
  };
  f.svg
    .append("g")
    .selectAll("line")
    .data(marks)
    .join("line")
    .attr("class", "year-mark")
    .attr("x1", (k) => edge(k.from, false))
    .attr("x2", (k) => edge(k.to, true))
    .attr("y1", (k) => f.y(k.value))
    .attr("y2", (k) => f.y(k.value));
}

/** "Oct 2026", the average, and how many days it rests on. */
export function monthTooltip(format: ChartFormat): TooltipRenderer<MonthPoint> {
  return (tip, p) => {
    const month = document.createElement("div");
    // An empty current year never matches, so the year is always written.
    month.textContent = formatMonthShort(p.month, "");
    const days = document.createElement("div");
    days.className = "quiet";
    days.textContent = `${formatCount(p.days)} ${p.days === 1 ? "day" : "days"} with data`;
    tip.replaceChildren(valueHeadline(format, p.value), month, days);
  };
}
