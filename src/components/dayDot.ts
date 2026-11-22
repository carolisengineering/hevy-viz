// How big a day's dot is drawn, in an 8×8 svg cell. Shared by the Consistency grid and the calendar.

/** Sets at which a dot reaches full size. */
export const FULL_DOT_SETS = 30;

/** A rest day's faint dot, so gaps read as empty days rather than missing grid. */
export const REST_DOT_RADIUS = 1;

/** Area grows with sets, so dot size reads as volume; the biggest dot stays inside its cell. */
export const dayDotRadius = (sets: number): number => 1.5 + 2.1 * Math.sqrt(Math.min(sets, FULL_DOT_SETS) / FULL_DOT_SETS);
