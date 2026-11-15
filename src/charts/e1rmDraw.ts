// D3 drawing steps for the estimated-1RM chart. Each step draws one layer
// into a Frame; E1rmChart wires them to React and resizing.
import * as d3 from "d3";
import { parseDay } from "../core/dates";
import type { E1rmPoint } from "../core/metrics";
import { formatDate, formatKg, formatKgPrecise, formatSet } from "../format";

const MARGIN = { top: 16, right: 56, bottom: 28, left: 48 };
const Y_TICKS = 5;
/** Roughly one x-axis label per this many pixels. */
const PX_PER_X_TICK = 110;
const DOT_RADIUS = 4;
const TOOLTIP_OFFSET = 12;

export interface Frame {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  width: number;
  height: number;
  x: d3.ScaleTime<number, number>;
  y: d3.ScaleLinear<number, number>;
}

const xOf = (f: Frame, p: E1rmPoint) => f.x(parseDay(p.date));
const yOf = (f: Frame, p: E1rmPoint) => f.y(p.e1rm);

/** Sizes the svg and removes everything drawn in it. */
export function resetSvg(svgEl: SVGSVGElement, width: number, height: number): Frame["svg"] {
  const svg = d3.select(svgEl).attr("width", width).attr("height", height);
  svg.selectAll("*").remove();
  return svg;
}

/** Resets the svg and fits scales to `history`, which must not be empty. */
export function createFrame(svgEl: SVGSVGElement, width: number, height: number, history: E1rmPoint[]): Frame {
  const svg = resetSvg(svgEl, width, height);
  const x = d3
    .scaleUtc()
    .domain(d3.extent(history, (d) => parseDay(d.date)) as [Date, Date])
    .range([MARGIN.left, width - MARGIN.right]);
  const y = d3
    .scaleLinear()
    // Lines don't need a zero baseline; fit the data so progress is visible.
    .domain([d3.min(history, (d) => d.e1rm)! * 0.9, d3.max(history, (d) => d.e1rm)! * 1.05])
    .nice()
    .range([height - MARGIN.bottom, MARGIN.top]);
  return { svg, width, height, x, y };
}

/** Recessive horizontal hairlines at the y ticks. */
export function drawGrid(f: Frame): void {
  f.svg
    .append("g")
    .attr("class", "grid")
    .selectAll("line")
    .data(f.y.ticks(Y_TICKS))
    .join("line")
    .attr("x1", MARGIN.left)
    .attr("x2", f.width - MARGIN.right)
    .attr("y1", (d) => f.y(d))
    .attr("y2", (d) => f.y(d));
}

export function drawAxes(f: Frame): void {
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
    .call(d3.axisLeft(f.y).ticks(Y_TICKS).tickSize(0).tickPadding(8).tickFormat((d) => `${d} kg`))
    .call((g) => g.select(".domain").remove());
}

export function drawSeries(f: Frame, history: E1rmPoint[]): void {
  const line = d3
    .line<E1rmPoint>()
    .x((d) => xOf(f, d))
    .y((d) => yOf(f, d))
    .curve(d3.curveMonotoneX);
  f.svg.append("path").datum(history).attr("class", "series-line").attr("d", line);
}

/** 8px dots with a 2px surface ring (ring color is set in CSS). */
export function drawPrMarkers(f: Frame, prs: E1rmPoint[]): void {
  f.svg
    .append("g")
    .selectAll("circle")
    .data(prs)
    .join("circle")
    .attr("class", "pr-dot")
    .attr("r", DOT_RADIUS)
    .attr("cx", (d) => xOf(f, d))
    .attr("cy", (d) => yOf(f, d));
}

/** Direct label on the latest value only. */
export function drawEndLabel(f: Frame, last: E1rmPoint): void {
  f.svg
    .append("text")
    .attr("class", "end-label")
    .attr("x", xOf(f, last) + 8)
    .attr("y", yOf(f, last))
    .attr("dy", "0.32em")
    .text(formatKg(last.e1rm));
}

/** Shared between redraws so a resize doesn't lose the keyboard position. */
export interface Cursor {
  index: number;
}

/** Crosshair, focus dot, tooltip, and keyboard stepping over sessions. */
export function attachInteraction(f: Frame, history: E1rmPoint[], prs: E1rmPoint[], tip: HTMLElement, cursor: Cursor): void {
  const hair = f.svg
    .append("line")
    .attr("class", "crosshair")
    .attr("y1", MARGIN.top)
    .attr("y2", f.height - MARGIN.bottom)
    .style("opacity", 0);
  const focus = f.svg.append("circle").attr("class", "focus-dot").attr("r", DOT_RADIUS).style("opacity", 0);
  const prDates = new Set(prs.map((p) => p.date));
  const bisect = d3.bisector((d: E1rmPoint) => parseDay(d.date)).center;

  const show = (i: number) => {
    const d = history[i];
    const cx = xOf(f, d);
    hair.attr("x1", cx).attr("x2", cx).style("opacity", 1);
    focus.attr("cx", cx).attr("cy", yOf(f, d)).style("opacity", 1);
    renderTooltip(tip, d, prDates.has(d.date));
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

  f.svg
    .append("rect")
    .attr("class", "hit")
    .attr("x", MARGIN.left)
    .attr("y", MARGIN.top)
    .attr("width", f.width - MARGIN.left - MARGIN.right)
    .attr("height", f.height - MARGIN.top - MARGIN.bottom)
    .attr("tabindex", 0)
    .attr("aria-label", "Estimated one-rep max chart. Use arrow keys to step through sessions.")
    .on("pointermove", (e: PointerEvent) => show(bisect(history, f.x.invert(d3.pointer(e)[0]))))
    .on("pointerleave blur", hide)
    .on("focus", () => show(cursor.index))
    .on("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") cursor.index = Math.max(0, cursor.index - 1);
      else if (e.key === "ArrowRight") cursor.index = Math.min(history.length - 1, cursor.index + 1);
      else return;
      e.preventDefault();
      show(cursor.index);
    });
}

/** Fills the tooltip with text nodes only (no HTML parsing of data). */
function renderTooltip(tip: HTMLElement, d: E1rmPoint, isPr: boolean): void {
  const value = document.createElement("strong");
  value.textContent = formatKgPrecise(d.e1rm);
  const detail = document.createElement("div");
  detail.textContent = `${formatSet(d)}${isPr ? " · PR" : ""}`;
  const date = document.createElement("div");
  date.className = "muted";
  date.textContent = formatDate(d.date);
  tip.replaceChildren(value, detail, date);
  tip.style.opacity = "1";
}

export function hideTooltip(tip: HTMLElement): void {
  tip.style.opacity = "0";
}
