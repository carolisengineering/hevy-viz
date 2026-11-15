// D3 drawing steps for the progress chart. Each step draws one layer into a
// Frame; ProgressChart wires them to React and resizing. Works for any measure:
// values arrive in stored units (kg, reps, seconds, meters) and ChartFormat says
// how to show them.
import * as d3 from "d3";
import { addDays, MS_PER_DAY, parseDay } from "../core/dates";
import type { ProgressPoint } from "../core/progress";
import { formatDate } from "../format";
import { STAR_PATH } from "../components/ink";

/** How one measure is written on the chart, its table and its tooltip. */
export interface ChartFormat {
  /** A stored value as text, without the unit: "172.5", "1:45", "5 km". */
  value: (v: number) => string;
  /** Written small after values: "kg", "lb", "reps", or "". */
  unit: string;
  /** The set behind a point: "150 × 5". */
  set: (p: ProgressPoint) => string;
  /** The measure's name, for the table's column: "Est. 1RM". */
  measure: string;
  /** Display units per stored unit (2.2046… for pounds), so axis ticks land on round display values. */
  scale: number;
}

const MARGIN = { top: 22, right: 64, bottom: 30, left: 56 };
const Y_TICKS = 5;
/** Roughly one x-axis label per this many pixels. */
const PX_PER_X_TICK = 110;
const FOCUS_RADIUS = 6;
const STAR_SIZE = 18;
/** Half the width of the tick mark drawn for a lone session. */
const LONE_TICK = 7;
const TOOLTIP_OFFSET = 12;
/** A break longer than this many days splits the line, so a layoff stays visible. */
const MAX_GAP_DAYS = 28;

export interface Frame {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  width: number;
  height: number;
  x: d3.ScaleTime<number, number>;
  y: d3.ScaleLinear<number, number>;
}

const xOf = (f: Frame, p: ProgressPoint) => f.x(parseDay(p.date));
const yOf = (f: Frame, p: ProgressPoint) => f.y(p.value);

/** Sizes the svg and removes everything drawn in it. */
export function resetSvg(svgEl: SVGSVGElement, width: number, height: number): Frame["svg"] {
  const svg = d3.select(svgEl).attr("width", width).attr("height", height);
  svg.selectAll("*").remove();
  return svg;
}

/** Resets the svg and fits scales to `points`, which must not be empty. */
export function createFrame(svgEl: SVGSVGElement, width: number, height: number, points: readonly ProgressPoint[]): Frame {
  const svg = resetSvg(svgEl, width, height);
  const first = points[0].date;
  const last = points.at(-1)!.date;
  // One date would collapse the time scale; give it a day either side.
  const [from, to] = first === last ? [addDays(first, -1), addDays(last, 1)] : [first, last];
  const x = d3
    .scaleUtc()
    .domain([parseDay(from), parseDay(to)])
    .range([MARGIN.left, width - MARGIN.right]);

  // Lines don't need a zero baseline; fit the data so progress is visible.
  const lo = d3.min(points, (d) => d.value)!;
  const hi = d3.max(points, (d) => d.value)!;
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
  const y = d3
    .scaleLinear()
    .domain([Math.max(0, lo - pad), hi + pad])
    .range([height - MARGIN.bottom, MARGIN.top]);
  return { svg, width, height, x, y };
}

/** Y ticks at round values in display units, returned in stored units. */
function yTicks(f: Frame, format: ChartFormat): number[] {
  const [lo, hi] = f.y.domain();
  return d3.ticks(lo * format.scale, hi * format.scale, Y_TICKS).map((t) => t / format.scale);
}

/** Faint horizontal rules at the y ticks. */
export function drawGrid(f: Frame, format: ChartFormat): void {
  f.svg
    .append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(yTicks(f, format))
    .join("line")
    .attr("x1", MARGIN.left)
    .attr("x2", f.width - MARGIN.right)
    .attr("y1", (d) => f.y(d))
    .attr("y2", (d) => f.y(d));
}

export function drawAxes(f: Frame, format: ChartFormat): void {
  const xTicks = Math.max(2, Math.floor(f.width / PX_PER_X_TICK));
  f.svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${f.height - MARGIN.bottom})`)
    .call(d3.axisBottom(f.x).ticks(xTicks).tickSize(0).tickPadding(10))
    .call((g) => g.select(".domain").remove());
  f.svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${MARGIN.left},0)`)
    .call(
      d3
        .axisLeft(f.y)
        .tickValues(yTicks(f, format))
        .tickSize(0)
        .tickPadding(8)
        .tickFormat((d) => format.value(+d)),
    )
    .call((g) => g.select(".domain").remove());
  if (format.unit) {
    f.svg
      .append("text")
      .attr("class", "axis-unit")
      .attr("x", MARGIN.left - 8)
      .attr("y", MARGIN.top - 10)
      .attr("text-anchor", "end")
      .text(format.unit);
  }
}

/**
 * The line's points with a null wherever consecutive sessions are more than `maxGapDays`
 * apart, plus each such gap's two ends, so the chart can bridge it with a dashed line.
 */
export function splitAtGaps(
  points: readonly ProgressPoint[],
  maxGapDays: number,
): { series: (ProgressPoint | null)[]; bridges: [ProgressPoint, ProgressPoint][] } {
  const series: (ProgressPoint | null)[] = [];
  const bridges: [ProgressPoint, ProgressPoint][] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && (parseDay(p.date).getTime() - parseDay(prev.date).getTime()) / MS_PER_DAY > maxGapDays) {
      series.push(null);
      bridges.push([prev, p]);
    }
    series.push(p);
  });
  return { series, bridges };
}

/**
 * The ink line. `drawIn` plays the pen stroke (first draw after the data changes,
 * never on a resize). A lone session is a short tick at its value. Breaks longer
 * than four weeks leave the line and are bridged with a faint dashed stroke.
 */
export function drawSeries(f: Frame, points: readonly ProgressPoint[], drawIn: boolean): void {
  if (points.length === 1) {
    const cx = xOf(f, points[0]);
    const cy = yOf(f, points[0]);
    // A ballpoint dash rises slightly, like a hand-drawn tick.
    f.svg.append("path").attr("class", "series-line").attr("d", `M${cx - LONE_TICK},${cy + 1}L${cx + LONE_TICK},${cy - 1}`);
    return;
  }
  const { series, bridges } = splitAtGaps(points, MAX_GAP_DAYS);
  f.svg
    .append("g")
    .attr("class", "series-gaps")
    .selectAll("line")
    .data(bridges)
    .join("line")
    .attr("x1", ([a]) => xOf(f, a))
    .attr("y1", ([a]) => yOf(f, a))
    .attr("x2", ([, b]) => xOf(f, b))
    .attr("y2", ([, b]) => yOf(f, b));
  const line = d3
    .line<ProgressPoint | null>()
    .defined((p) => p !== null)
    .x((p) => xOf(f, p!))
    .y((p) => yOf(f, p!))
    .curve(d3.curveMonotoneX);
  const path = f.svg
    .append("path")
    .attr("class", drawIn ? "series-line draw-in" : "series-line")
    .attr("d", line(series)!);
  if (drawIn) path.attr("pathLength", 1);
}

/** Raspberry stars on the PRs. */
export function drawPrMarkers(f: Frame, prs: readonly ProgressPoint[]): void {
  const scale = STAR_SIZE / 24;
  f.svg
    .append("g")
    .selectAll("path")
    .data(prs)
    .join("path")
    .attr("class", "pr-star")
    .attr("d", STAR_PATH)
    .attr("transform", (p) => `translate(${xOf(f, p) - 12 * scale},${yOf(f, p) - 12 * scale}) scale(${scale})`);
}

/** Direct label on the latest value only, with its unit written small. */
export function drawEndLabel(f: Frame, last: ProgressPoint, format: ChartFormat): void {
  const label = f.svg
    .append("text")
    .attr("class", "end-label")
    .attr("x", xOf(f, last) + 10)
    .attr("y", yOf(f, last))
    .attr("dy", "0.32em")
    .text(format.value(last.value));
  if (format.unit) label.append("tspan").attr("class", "unit").text(` ${format.unit}`);
}

/** Shared between redraws so a resize doesn't lose the keyboard position. */
export interface Cursor {
  index: number;
}

/** Crosshair, focus ring, tooltip, and keyboard stepping over sessions. Returns the focusable hit area. */
export function attachInteraction(
  f: Frame,
  points: readonly ProgressPoint[],
  prs: readonly ProgressPoint[],
  tip: HTMLElement,
  cursor: Cursor,
  format: ChartFormat,
  label: string,
): SVGRectElement {
  const hair = f.svg
    .append("line")
    .attr("class", "crosshair")
    .attr("y1", MARGIN.top)
    .attr("y2", f.height - MARGIN.bottom)
    .style("opacity", 0);
  const focus = f.svg.append("circle").attr("class", "focus-ring").attr("r", FOCUS_RADIUS).style("opacity", 0);
  const prDates = new Set(prs.map((p) => p.date));
  const bisect = d3.bisector((p: ProgressPoint) => parseDay(p.date)).center;

  const show = (i: number) => {
    const p = points[i];
    const cx = xOf(f, p);
    hair.attr("x1", cx).attr("x2", cx).style("opacity", 1);
    focus.attr("cx", cx).attr("cy", yOf(f, p)).style("opacity", 1);
    renderTooltip(tip, p, prDates.has(p.date), format);
    const tipW = tip.offsetWidth;
    const fitsRight = cx + TOOLTIP_OFFSET + tipW <= f.width;
    tip.style.left = `${fitsRight ? cx + TOOLTIP_OFFSET : cx - TOOLTIP_OFFSET - tipW}px`;
    tip.style.top = `${MARGIN.top}px`;
  };
  const hide = () => {
    hair.style("opacity", 0);
    focus.style("opacity", 0);
    hideTooltip(tip);
  };

  return f.svg
    .append("rect")
    .attr("class", "hit")
    .attr("x", MARGIN.left)
    .attr("y", MARGIN.top)
    .attr("width", f.width - MARGIN.left - MARGIN.right)
    .attr("height", f.height - MARGIN.top - MARGIN.bottom)
    .attr("tabindex", 0)
    .attr("aria-label", `${label} chart. Use arrow keys to step through sessions.`)
    .on("pointermove", (e: PointerEvent) => show(bisect(points, f.x.invert(d3.pointer(e)[0]))))
    .on("pointerleave blur", hide)
    .on("focus", () => show(cursor.index))
    .on("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") cursor.index = Math.max(0, cursor.index - 1);
      else if (e.key === "ArrowRight") cursor.index = Math.min(points.length - 1, cursor.index + 1);
      else return;
      e.preventDefault();
      show(cursor.index);
    })
    .node()!;
}

/** Fills the tooltip with text nodes only (no HTML parsing of data). */
function renderTooltip(tip: HTMLElement, p: ProgressPoint, isPr: boolean, format: ChartFormat): void {
  const value = document.createElement("strong");
  value.append(format.value(p.value));
  if (format.unit) {
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = ` ${format.unit}`;
    value.append(unit);
  }
  const detail = document.createElement("div");
  detail.textContent = `${format.set(p)}${isPr ? " · PR" : ""}`;
  const date = document.createElement("div");
  date.className = "quiet";
  date.textContent = formatDate(p.date);
  tip.replaceChildren(value, detail, date);
  tip.style.opacity = "1";
}

export function hideTooltip(tip: HTMLElement): void {
  tip.style.opacity = "0";
}
