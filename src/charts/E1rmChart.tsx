import { useEffect, useRef } from "react";
import "./chart.css";
import type { E1rmPoint } from "../core/metrics";
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
} from "./e1rmDraw";

interface Props {
  history: E1rmPoint[];
  prs: E1rmPoint[];
  height?: number;
}

/** Estimated 1RM over time: one 2px line, PR markers, crosshair tooltip. */
export function E1rmChart({ history, prs, height = 320 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current!;
    const svgEl = svgRef.current!;
    const tip = tipRef.current!;
    // Lives across resizes; resets only when the data changes.
    const cursor: Cursor = { index: history.length - 1 };

    const draw = () => {
      // A redraw replaces every element, including the focused hit area; note it to restore focus.
      const hadFocus = svgEl.contains(document.activeElement);
      hideTooltip(tip); // A redraw moves every point; an open tooltip would be stale.
      const last = history.at(-1);
      if (!last) {
        resetSvg(svgEl, wrap.clientWidth, height);
        return;
      }
      const frame = createFrame(svgEl, wrap.clientWidth, height, history);
      drawGrid(frame);
      drawAxes(frame);
      drawSeries(frame, history);
      drawPrMarkers(frame, prs);
      drawEndLabel(frame, last);
      const hit = attachInteraction(frame, history, prs, tip, cursor);
      // Refocusing reshows the tooltip at the cursor's new position.
      if (hadFocus) hit.focus({ preventScroll: true });
    };

    // ResizeObserver calls draw once on observe, so no separate initial draw.
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [history, prs, height]);

  return (
    <div ref={wrapRef} className="chart-wrap">
      {/* Height is set up front so the first draw doesn't resize the observed wrapper
          (that would trigger a ResizeObserver loop error and a second draw). */}
      <svg ref={svgRef} height={height} role="img" aria-label="Estimated one-rep max over time" />
      <div ref={tipRef} className="tooltip" aria-hidden="true" />
    </div>
  );
}
