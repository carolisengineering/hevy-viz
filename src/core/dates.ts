// Calendar-day helpers. A "day" is a "YYYY-MM-DD" string: it sorts and
// compares as a string, and serializes as-is. Pure, no DOM.

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = dayFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, fmt);
  }
  return fmt;
}

/** The calendar day an ISO timestamp falls on in `timeZone` (an IANA name, e.g. "America/Los_Angeles"). */
export function toLocalDay(iso: string, timeZone: string): string {
  const parts = dayFormatter(timeZone).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC midnight of a day. Days are placed on UTC scales so no zone shifts them. */
export const parseDay = (day: string): Date => new Date(`${day}T00:00:00Z`);

const formatDay = (d: Date): string => d.toISOString().slice(0, 10);

/** The day `n` days after `day` (negative `n` goes back). */
export function addDays(day: string, n: number): string {
  return formatDay(new Date(parseDay(day).getTime() + n * MS_PER_DAY));
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const daysSinceMonday = (parseDay(day).getUTCDay() + 6) % 7;
  return addDays(day, -daysSinceMonday);
}

/** The browser's or runtime's own time zone. */
export const localTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;
