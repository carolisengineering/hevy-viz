import { useEffect, useRef } from "react";
import "./chart.css";
import type { ProgressPoint } from "../core/progress";
import type { ChartFormat } from "../format";
import {
  attachInteraction,
  createFrame,
  drawAxes,
  drawEndLabel,
  drawGrid,
  drawPrMarkers,
  drawSeries,
  hideTooltip,
  resetSvg,
  type Cursor,
} from "./progressDraw";

interface Props {
  /** Oldest first. */
  points: readonly ProgressPoint[];
  prs: readonly ProgressPoint[];
  format: ChartFormat;
  /** What the chart shows, for screen readers: "Squat (Barbell): Est. 1RM". */
  label: string;
  height?: number;
}

/** One exercise's progress over time: an ink line, PR stars, a crosshair tooltip. */
export function ProgressChart({ points, prs, format, label, height = 340 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const svgEl = svgRef.current!;
    const tip = tipRef.current!;
    // Lives across resizes; resets only when the data changes.
    const cursor: Cursor = { index: points.length - 1 };
    // The pen draws the line once per data change, not on every resize.
    let drawIn = true;

    const draw = () => {
      // A redraw replaces every element, including the focused hit area; note it to restore focus.
      const hadFocus = svgEl.contains(document.activeElement);
      hideTooltip(tip); // A redraw moves every point; an open tooltip would be stale.
      const last = points.at(-1);
      if (!last) {
        resetSvg(svgEl, wrap.clientWidth, height);
        return;
      }
      const frame = createFrame(svgEl, wrap.clientWidth, height, points);
      drawGrid(frame, format);
      drawAxes(frame, format);
      drawSeries(frame, points, drawIn);
      drawIn = false;
      drawPrMarkers(frame, prs);
      drawEndLabel(frame, last, format);
      const hit = attachInteraction(frame, points, prs, tip, cursor, format, label);
      // Refocusing reshows the tooltip at the cursor's new position.
      if (hadFocus) hit.focus({ preventScroll: true });
    };

    // ResizeObserver calls draw once on observe, so no separate initial draw.
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [points, prs, format, label, height]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {/* Height is set up front so the first draw doesn't resize the observed wrapper
          (that would trigger a ResizeObserver loop error and a second draw). */}
      <svg ref={svgRef} height={height} role="img" aria-label={label} />
      <div ref={tipRef} className="tooltip" aria-hidden="true" />
    </div>
  );
}
