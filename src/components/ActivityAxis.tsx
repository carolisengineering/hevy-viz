import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DayWindow } from "../core/ranges";
import { formatMonthShort } from "../format";

/** Every "YYYY-MM" month `w` touches, oldest first. */
export function monthsIn(w: DayWindow): string[] {
  const months: string[] = [];
  let [year, month] = [Number(w.from.slice(0, 4)), Number(w.from.slice(5, 7))];
  const last = w.to.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) return months;
    months.push(key);
    [year, month] = month === 12 ? [year + 1, 1] : [year, month + 1];
  }
}

/** Rough width of a 16px tick label, and the clear space kept between neighbors. */
const CHAR_PX = 9;
const GAP_PX = 12;
const labelPx = (text: string) => text.length * CHAR_PX;

/** Strides tried, in months. A stride of 12 or more labels years instead of months. */
const STRIDES = [1, 2, 3, 6, 12, 24, 60, 120];

export interface AxisLabel {
  index: number;
  text: string;
  /** Center of the label, in px from the chart's left edge, kept inside the chart. */
  center: number;
}

/**
 * Which months get a tick label, chosen by the room there is: the finest stride whose labels
 * fit `width` px with a gap between them. Month labels start at the first month, with a short
 * year on it and wherever the year changes; year labels sit under each January (every 2nd, 5th
 * or 10th year when narrow). A label that would crowd the one before it is dropped.
 */
export function axisLabels(months: readonly string[], width: number): AxisLabel[] {
  const n = months.length;
  if (n === 0) return [];
  const column = width / n;
  // For month strides `text` is the "YYYY-MM" month, written below once the kept neighbor is known.
  const candidates = (stride: number): { index: number; text: string }[] => {
    if (stride >= 12) {
      const years = stride / 12;
      return months.flatMap((m, index) => (m.endsWith("-01") && Number(m.slice(0, 4)) % years === 0 ? [{ index, text: m.slice(0, 4) }] : []));
    }
    const out: { index: number; text: string }[] = [];
    for (let index = 0; index < n; index += stride) out.push({ index, text: months[index] });
    return out;
  };
  const widest = (stride: number) => (stride >= 12 ? 4 : 7) * CHAR_PX;
  const stride = STRIDES.find((s) => s * column >= widest(s) + GAP_PX) ?? STRIDES.at(-1)!;
  const labels: AxisLabel[] = [];
  let right = -Infinity;
  let year = "";
  for (const candidate of candidates(stride)) {
    const { index } = candidate;
    // A short year goes on the first label and on any label whose year differs from the one kept before it.
    const month = candidate.text;
    const name = stride >= 12 ? month : formatMonthShort(month, month.slice(0, 4));
    const text = stride < 12 && month.slice(0, 4) !== year ? `${name} ’${month.slice(2, 4)}` : name;
    const half = labelPx(text) / 2;
    const center = Math.min(Math.max(((index + 0.5) / n) * width, half), width - half);
    if (center - half < right + GAP_PX) continue;
    labels.push({ index, text, center });
    if (stride < 12) year = month.slice(0, 4);
    right = center + half;
  }
  return labels;
}

/** The width of an element, kept current as it resizes. */
function useWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** The shared time axis under the rows, on the same month columns as every row's chart. */
export function ActivityAxis({ window: w }: { window: DayWindow }) {
  const months = monthsIn(w);
  const ticks = useRef<HTMLSpanElement>(null);
  const width = useWidth(ticks);
  return (
    <div className="activity-axis" aria-hidden="true">
      <span ref={ticks} className="activity-ticks">
        {axisLabels(months, width).map(({ index, text, center }) => (
          <span key={index} className="activity-tick" style={{ left: `${center}px` }}>
            {text}
          </span>
        ))}
      </span>
    </div>
  );
}
