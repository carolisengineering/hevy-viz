import { useEffect, useRef } from "react";
import "./chart.css";
import type { MonthAverage, YearAverage } from "../core/health";
import type { ChartFormat } from "../format";
import { drawMonths, drawYearMarks, monthTooltip, toPoints, yearMarks } from "./activityDraw";
import { attachInteraction, createFrame, drawAxes, drawGrid, hideTooltip, MARGIN, resetSvg, type Cursor, type Margin } from "./progressDraw";

/** No end label to leave room for, so the plot runs nearly to the edge; this matters most on a phone. */
const CHART_MARGIN: Margin = { ...MARGIN, left: 48, right: 20 };

interface Props {
  /** Oldest first. */
  months: readonly MonthAverage[];
  years: readonly YearAverage[];
  format: ChartFormat;
  /** What the chart shows, for screen readers: "Steps per day". */
  label: string;
  height?: number;
}

/** A measure's monthly averages: an ink line that breaks where a month has no data, a raspberry mark per year, a crosshair tooltip. */
export function ActivityChart({ months, years, format, label, height = 340 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const svgEl = svgRef.current!;
    const tip = tipRef.current!;
    const points = toPoints(months);
    const marks = yearMarks(months, years);
    const tooltip = monthTooltip(format);
    // Lives across resizes; resets only when the data changes.
    const cursor: Cursor = { index: points.length - 1 };
    // The pen draws the line once per data change, not on every resize.
    let drawIn = true;

    const draw = () => {
      // A redraw replaces every element, including the focused hit area; note it to restore focus.
      const hadFocus = svgEl.contains(document.activeElement);
      hideTooltip(tip); // A redraw moves every point; an open tooltip would be stale.
      if (points.length === 0) {
        resetSvg(svgEl, wrap.clientWidth, height);
        return;
      }
      const frame = createFrame(svgEl, wrap.clientWidth, height, points, CHART_MARGIN);
      drawGrid(frame, format);
      drawAxes(frame, format);
      // The year marks sit under the line, so the ink stays the top stroke.
      drawYearMarks(frame, marks);
      drawMonths(frame, points, drawIn);
      drawIn = false;
      const hit = attachInteraction(frame, points, tip, cursor, label, "months", tooltip);
      // Refocusing reshows the tooltip at the cursor's new position.
      if (hadFocus) hit.focus({ preventScroll: true });
    };

    // ResizeObserver calls draw once on observe, so no separate initial draw.
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [months, years, format, label, height]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {/* Height is set up front so the first draw doesn't resize the observed wrapper
          (that would trigger a ResizeObserver loop error and a second draw). */}
      <svg ref={svgRef} height={height} role="img" aria-label={label} />
      <div ref={tipRef} className="tooltip" aria-hidden="true" />
    </div>
  );
}
