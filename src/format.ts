// Display formatting shared by the table, stat tiles, and chart.
import { parseDay } from "./core/dates";

/** "117 kg" */
export const formatKg = (kg: number): string => `${Math.round(kg)} kg`;

/** "116.7 kg" */
export const formatKgPrecise = (kg: number): string => `${kg.toFixed(1)} kg`;

/** "+12 kg", "−4 kg" (true minus sign), or "0 kg". */
export function formatKgChange(kg: number): string {
  const rounded = Math.round(kg);
  if (rounded === 0) return "0 kg";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)} kg`;
}

/** "102.5 kg × 5" */
export const formatSet = ({ weightKg, reps }: { weightKg: number; reps: number }): string => `${weightKg} kg × ${reps}`;

// Days are UTC midnights (see core/dates), so format in UTC to keep the same date.
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Nov 14, 2026" for a "YYYY-MM-DD" day. */
export const formatDate = (day: string): string => dateFormat.format(parseDay(day));
