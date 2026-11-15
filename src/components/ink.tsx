// Drawn marks for the notebook: stars, stripes, scribble fills, sparklines and icons.
// Every mark is SVG in ink or accent; none is a Unicode glyph.
import { parseDay } from "../core/dates";
import type { ProgressPoint } from "../core/progress";

/** A raspberry PR star. Named for screen readers by `title`. */
export function Star({ size = 18, title = "PR" }: { size?: number; title?: string }) {
  return (
    <svg className="ink-star" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      <path
        d="M12.2 2.4 L14.7 8.8 L21.6 9.1 L16.2 13.5 L18.1 20.4 L12.1 16.5 L5.9 20.6 L7.8 13.6 L2.4 9.4 L9.3 8.9 Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The triple brand stripe beside a PR row. Decorative. */
export function Stripe() {
  return (
    <svg className="ink-stripe" width="16" height="30" viewBox="0 0 16 30" aria-hidden="true">
      {[1.5, 7, 12.5].map((x) => (
        <path key={x} d={`M${x + 0.6} 1 L${x} 29`} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Diagonal ballpoint scribble fills, referenced as url(#scribble-ink) and url(#scribble-accent). Render once per page. */
export function ScribbleDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
      <defs>
        <pattern id="scribble-ink" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <rect width="6" height="6" style={{ fill: "var(--ink)", opacity: 0.2 }} />
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--ink)" }} strokeWidth="3.6" />
        </pattern>
        <pattern id="scribble-accent" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
          <line x1="0" y1="0" x2="0" y2="6" style={{ stroke: "var(--accent)" }} strokeWidth="3.6" />
        </pattern>
      </defs>
    </svg>
  );
}

const SPARK_PAD = 2;

/** A small ballpoint line through `points`, placed by date. Empty for fewer than two points. */
export function Sparkline({ points, width = 130, height = 30 }: { points: readonly ProgressPoint[]; width?: number; height?: number }) {
  let d = "";
  if (points.length >= 2) {
    const times = points.map((p) => parseDay(p.date).getTime());
    const t0 = times[0];
    const tSpan = times.at(-1)! - t0 || 1;
    const values = points.map((p) => p.value);
    const lo = Math.min(...values);
    const vSpan = Math.max(...values) - lo;
    const x = (t: number) => SPARK_PAD + ((t - t0) / tSpan) * (width - 2 * SPARK_PAD);
    const y = (v: number) => (vSpan === 0 ? height / 2 : height - SPARK_PAD - ((v - lo) / vSpan) * (height - 2 * SPARK_PAD));
    d = points.map((p, i) => `${i ? "L" : "M"}${x(times[i]).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  }
  return (
    <svg className="ink-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {d && <path d={d} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Magnifier for the exercise search. Decorative. */
export function SearchIcon() {
  return (
    <svg className="ink-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M15.4 15.6 L21 21.2" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** Left arrow for "back to the list" links. Decorative. */
export function BackArrow() {
  return (
    <svg className="ink-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M20.5 12.3 L4.2 11.8 M10 5.6 L3.8 11.9 L10.3 18.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
