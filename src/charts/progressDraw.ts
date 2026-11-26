// D3 drawing steps for the progress chart. Each step draws one layer into a
// Frame; ProgressChart wires them to React and resizing. Works for any measure:
// values arrive in stored units (kg, reps, seconds, meters) and ChartFormat says
// how to show them.
import * as d3 from "d3";
import { addDays, MS_PER_DAY, parseDay } from "../core/dates";
import { LONG_BREAK_DAYS, type ProgressPoint } from "../core/progress";
import { formatDate, type ChartFormat } from "../format";
import { STAR_PATH } from "../components/ink";


export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** Room on the right is for the exercise chart's end label. */
export const MARGIN: Margin = { top: 22, right: 64, bottom: 30, left: 56 };
const Y_TICKS = 5;
/** Roughly one x-axis label per this many pixels. */
const PX_PER_X_TICK = 110;
const FOCUS_RADIUS = 6;
const STAR_SIZE = 18;
/** Half the width of the tick mark drawn for a lone session. */
const LONE_TICK = 7;
const TOOLTIP_OFFSET = 12;
/** Radius of the dot marking a session that sits alone between two long breaks. */
export const LONE_DOT_RADIUS = 3;

export interface Frame {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  width: number;
  height: number;
  margin: Margin;
  x: d3.ScaleTime<number, number>;
  y: d3.ScaleLinear<number, number>;
}

/** What the frame, grid and axes need of a point: a day and a value. */
export type DatedValue = Pick<ProgressPoint, "date" | "value">;

export const xOf = (f: Frame, p: DatedValue) => f.x(parseDay(p.date));
export const yOf = (f: Frame, p: DatedValue) => f.y(p.value);

/** Sizes the svg and removes everything drawn in it. */
export function resetSvg(svgEl: SVGSVGElement, width: number, height: number): Frame["svg"] {
  const svg = d3.select(svgEl).attr("width", width).attr("height", height);
  svg.selectAll("*").remove();
  return svg;
}

/** Resets the svg and fits scales to `points`, which must not be empty. */
export function createFrame(
  svgEl: SVGSVGElement,
  width: number,
  height: number,
  points: readonly DatedValue[],
  margin: Margin = MARGIN,
): Frame {
  const svg = resetSvg(svgEl, width, height);
  const first = points[0].date;
  const last = points.at(-1)!.date;
  // One date would collapse the time scale; give it a day either side.
  const [from, to] = first === last ? [addDays(first, -1), addDays(last, 1)] : [first, last];
  const x = d3
    .scaleUtc()
    .domain([parseDay(from), parseDay(to)])
    .range([margin.left, width - margin.right]);

  // Lines don't need a zero baseline; fit the data so progress is visible.
  const lo = d3.min(points, (d) => d.value)!;
  const hi = d3.max(points, (d) => d.value)!;
  const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
  const y = d3
    .scaleLinear()
    .domain([Math.max(0, lo - pad), hi + pad])
    .range([height - margin.bottom, margin.top]);
  return { svg, width, height, margin, x, y };
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
    .attr("x1", f.margin.left)
    .attr("x2", f.width - f.margin.right)
    .attr("y1", (d) => f.y(d))
    .attr("y2", (d) => f.y(d));
}

export function drawAxes(f: Frame, format: ChartFormat): void {
  const xTicks = Math.max(2, Math.floor(f.width / PX_PER_X_TICK));
  f.svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${f.height - f.margin.bottom})`)
    .call(d3.axisBottom(f.x).ticks(xTicks).tickSize(0).tickPadding(10))
    .call((g) => g.select(".domain").remove());
  f.svg
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(${f.margin.left},0)`)
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
      .attr("x", f.margin.left - 8)
      .attr("y", f.margin.top - 10)
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
  const { series, bridges } = splitAtGaps(points, LONG_BREAK_DAYS);
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
  // A session with a long break on both sides has no line of its own; mark it with a dot.
  const alone = series.filter((p, i): p is ProgressPoint => p !== null && !series[i - 1] && !series[i + 1]);
  f.svg
    .append("g")
    .selectAll("circle")
    .data(alone)
    .join("circle")
    .attr("class", "series-dot")
    .attr("r", LONE_DOT_RADIUS)
    .attr("cx", (p) => xOf(f, p))
    .attr("cy", (p) => yOf(f, p));
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

/** Fills the tooltip for one point. Text nodes only (no HTML parsing of data). */
export type TooltipRenderer<T> = (tip: HTMLElement, p: T) => void;

/** The value as a tooltip's headline: the number in the display hand with its unit written small. */
export function valueHeadline(format: ChartFormat, value: number): HTMLElement {
  const strong = document.createElement("strong");
  strong.append(format.value(value));
  if (format.unit) {
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = ` ${format.unit}`;
    strong.append(unit);
  }
  return strong;
}

/**
 * Crosshair, focus ring, tooltip, and keyboard stepping over points. `noun` is what the arrow keys
 * step through ("sessions", "months"). Hovering moves the keyboard position too, so ←/→ continue
 * from where the pointer was. Returns the focusable hit area.
 */
export function attachInteraction<T extends DatedValue>(
  f: Frame,
  points: readonly T[],
  tip: HTMLElement,
  cursor: Cursor,
  label: string,
  noun: string,
  render: TooltipRenderer<T>,
): SVGRectElement {
  const hair = f.svg
    .append("line")
    .attr("class", "crosshair")
    .attr("y1", f.margin.top)
    .attr("y2", f.height - f.margin.bottom)
    .style("opacity", 0);
  const focus = f.svg.append("circle").attr("class", "focus-ring").attr("r", FOCUS_RADIUS).style("opacity", 0);
  const bisect = d3.bisector((p: T) => parseDay(p.date)).center;

  const show = (i: number) => {
    const p = points[i];
    const cx = xOf(f, p);
    hair.attr("x1", cx).attr("x2", cx).style("opacity", 1);
    focus.attr("cx", cx).attr("cy", yOf(f, p)).style("opacity", 1);
    render(tip, p);
    tip.style.opacity = "1";
    const tipW = tip.offsetWidth;
    const fitsRight = cx + TOOLTIP_OFFSET + tipW <= f.width;
    tip.style.left = `${fitsRight ? cx + TOOLTIP_OFFSET : cx - TOOLTIP_OFFSET - tipW}px`;
    tip.style.top = `${f.margin.top}px`;
  };
  const hide = () => {
    hair.style("opacity", 0);
    focus.style("opacity", 0);
    hideTooltip(tip);
  };

  return f.svg
    .append("rect")
    .attr("class", "hit")
    .attr("x", f.margin.left)
    .attr("y", f.margin.top)
    .attr("width", f.width - f.margin.left - f.margin.right)
    .attr("height", f.height - f.margin.top - f.margin.bottom)
    .attr("tabindex", 0)
    .attr("aria-label", `${label} chart. Use arrow keys to step through ${noun}.`)
    .on("pointermove", (e: PointerEvent) => {
      cursor.index = bisect(points, f.x.invert(d3.pointer(e)[0]));
      show(cursor.index);
    })
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

/** The exercise chart's tooltip: the value, the set behind it, the date. */
export function exerciseTooltip(prDates: ReadonlySet<string>, format: ChartFormat): TooltipRenderer<ProgressPoint> {
  return (tip, p) => {
    const detail = document.createElement("div");
    detail.textContent = `${format.set(p)}${prDates.has(p.date) ? " · PR" : ""}`;
    const date = document.createElement("div");
    date.className = "quiet";
    date.textContent = formatDate(p.date);
    tip.replaceChildren(valueHeadline(format, p.value), detail, date);
  };
}

export function hideTooltip(tip: HTMLElement): void {
  tip.style.opacity = "0";
}
