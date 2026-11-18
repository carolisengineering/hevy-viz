// The MCP server's tool handlers: (context, args) → result. No SDK and no I/O here,
// so every figure comes from src/core exactly as the dashboard computes it.
import { groupVolumes, setsPerWeekByMuscleIn } from "../src/core/balance";
import { longestBreak, monthlySessions, windowStats } from "../src/core/consistency";
import { parseDay, toLocalDay, weekStart } from "../src/core/dates";
import { muscleGroup, muscleLabel, sideOf } from "../src/core/muscles";
import { longBreaks, METRIC_LABEL, recordsBy, summarizeIn, type Break, type ExerciseProgress, type MetricId, type ProgressPoint } from "../src/core/progress";
import { rangeById, weeksIn, windowFor, type DayWindow, type RangeId } from "../src/core/ranges";
import { latestEntries, mainLiftsIn, matchExercises, type ExerciseKind, type ExerciseSort, type Training } from "../src/core/training";
import { formatChange, formatPointSet, formatValue, formatWeight, valueUnit, type Unit } from "../src/format";

/** A problem Claude can fix by changing the arguments. Its message is the one sentence Claude sees. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/** What every handler is given: the training model as last loaded, and how it was loaded. */
export interface ToolContext {
  training: Training;
  timeZone: string;
  /** When the data file was synced, from its `synced_at`. */
  syncedAt: string;
}

/** Carried by every result, so an answer always says what data and window it describes. */
export interface ResultContext {
  source: "hevy" | "sample";
  syncedAt: string;
  timeZone: string;
  window: DayWindow | null;
  unit: Unit | null;
}

/** A preset range, or a custom window that overrides it. */
export type RangeArgs = { range?: RangeId; from?: string; to?: string };

const DEFAULT_RANGE: RangeId = "1y";
const DEFAULT_UNIT: Unit = "kg";
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Math.trunc(n)));

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real "YYYY-MM-DD" day, or a ToolError. */
function checkDay(day: string): string {
  const parsed = parseDay(day);
  if (!DATE.test(day) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw new ToolError("Dates must be YYYY-MM-DD, like 2026-01-31.");
  }
  return day;
}

/**
 * The days a call covers. `from` and `to` override `range`; `from` alone runs to the
 * end day and `to` alone starts at the first workout. A custom window is cut to the days
 * the log covers, since later days haven't happened and earlier ones weren't logged, so
 * weeks and rest days are only counted where they could be. A window wholly outside the
 * data is kept as asked (a half-given one shrinks to its one day) and gives empty results.
 */
export function resolveWindow(training: Training, args: RangeArgs): DayWindow {
  const { firstDay, endDay } = training;
  if (args.from == null && args.to == null) return windowFor(rangeById(args.range ?? DEFAULT_RANGE), endDay, firstDay);
  const given = { from: args.from == null ? null : checkDay(args.from), to: args.to == null ? null : checkDay(args.to) };
  if (given.from != null && given.to != null && given.from > given.to) {
    throw new ToolError(`The window starts after it ends: ${given.from} is after ${given.to}.`);
  }
  const from = given.from ?? (given.to! < firstDay ? given.to! : firstDay);
  const to = given.to ?? (given.from! > endDay ? given.from! : endDay);
  if (!overlapsData(training, { from, to })) return { from, to };
  return { from: from < firstDay ? firstDay : from, to: to > endDay ? endDay : to };
}

/** Whether `w` shares a day with the log, from the first workout to the end day. */
const overlapsData = (training: Training, w: DayWindow): boolean => w.from <= training.endDay && w.to >= training.firstDay;

/** How many candidates an ambiguous name lists. */
const MAX_CANDIDATES = 10;

/** An exercise by exact id, then exact title (trimmed, any case), then a unique literal substring of a title. */
export function resolveExercise(training: Training, query: string): ExerciseProgress {
  const wanted = query.trim();
  if (!wanted) throw new ToolError("Name an exercise, by title or id; find_exercises lists them.");
  const byId = training.index.get(wanted);
  if (byId) return byId;
  const lower = wanted.toLowerCase();
  const byTitle = training.exercises.find((e) => e.title.toLowerCase() === lower);
  if (byTitle) return byTitle;
  const found = matchExercises(training.exercises, { query: wanted });
  if (found.length === 1) return found[0];
  if (found.length === 0) throw new ToolError(`No exercise matches "${wanted}"; find_exercises lists them.`);
  const listed = found.slice(0, MAX_CANDIDATES).map((e) => `${e.title} (${e.templateId})`);
  const more = found.length > MAX_CANDIDATES ? `, and ${found.length - MAX_CANDIDATES} more` : "";
  throw new ToolError(`"${wanted}" matches ${found.length} exercises: ${listed.join(", ")}${more}. Ask again with one of the ids.`);
}

/** The result context for a call. */
function contextOf(ctx: ToolContext, window: DayWindow | null, unit: Unit | null): ResultContext {
  return { source: ctx.training.data.source, syncedAt: ctx.syncedAt, timeZone: ctx.timeZone, window, unit };
}

/** A stored value in the requested unit, rounded as the dashboard shows it, with its text. */
function measured(metric: MetricId, value: number, unit: Unit): { value: number; text: string } {
  const text = formatValue(metric, value, unit);
  return { value: metric === "e1rm" || metric === "weight" ? Number(text) : value, text };
}

/**
 * The unit a result's values are in. Like the dashboard's, except that times and distances,
 * whose text carries its own unit there, are named here: their values are raw seconds and meters.
 */
function resultUnit(metric: MetricId, unit: Unit): string {
  const shown = valueUnit(metric, unit);
  if (shown) return shown;
  return metric === "duration" ? "seconds" : "meters";
}

export interface FindExercisesArgs {
  query?: string;
  kind?: ExerciseKind;
  sort?: ExerciseSort;
  limit?: number;
  unit?: Unit;
}

const FIND_LIMIT = 20;
const FIND_MAX = 50;

/** The Exercises list as data: matching exercises with their all-time best. */
export function findExercises(ctx: ToolContext, args: FindExercisesArgs) {
  const unit = args.unit ?? DEFAULT_UNIT;
  const matches = matchExercises(ctx.training.exercises, { query: args.query, kind: args.kind, sort: args.sort });
  const limit = clamp(args.limit ?? FIND_LIMIT, 1, FIND_MAX);
  return {
    context: contextOf(ctx, null, unit),
    total: matches.length,
    exercises: matches.slice(0, limit).map((e) => {
      const best = recordsBy(e.points).at(-1);
      return {
        id: e.templateId,
        title: e.title,
        muscle: muscleLabel(e.muscle),
        group: muscleGroup(e.muscle),
        measure: METRIC_LABEL[e.metric],
        sessions: e.sessions,
        lastDone: e.lastDay,
        best: best ? { ...measured(e.metric, best.value, unit), date: best.date } : null,
      };
    }),
  };
}

/** A change in the requested unit, rounded the way the dashboard shows it, with its text ("+6.5", "±0"). */
function measuredChange(metric: MetricId, delta: number, unit: Unit): { value: number; text: string } {
  const isWeight = metric === "e1rm" || metric === "weight";
  return { value: isWeight ? Math.sign(delta) * Number(formatWeight(Math.abs(delta), unit)) : delta, text: formatChange(metric, delta, unit) };
}

const MAX_PRS = 20;
const MAX_WEEKS = 104;

export interface ExerciseProgressArgs extends RangeArgs {
  exercise: string;
  unit?: Unit;
}

/** One exercise's progress in a window, figured exactly as its dashboard page does. */
export function exerciseProgress(ctx: ToolContext, args: ExerciseProgressArgs) {
  const { training } = ctx;
  const exercise = resolveExercise(training, args.exercise);
  const w = resolveWindow(training, args);
  const unit = args.unit ?? DEFAULT_UNIT;
  const { metric, type } = exercise;
  const summary = summarizeIn(exercise.points, w);
  const point = (p: ProgressPoint | undefined) => (p ? { ...measured(metric, p.value, unit), set: formatPointSet(p, type, unit), date: p.date } : null);

  // Best per Monday-first week, or per calendar month when weeks would be too many to list.
  const by: "week" | "month" = weeksIn(w) > MAX_WEEKS ? "month" : "week";
  const periods = new Map<string, number>();
  for (const p of summary.history) {
    const start = by === "week" ? weekStart(p.date) : `${p.date.slice(0, 7)}-01`;
    periods.set(start, Math.max(periods.get(start) ?? -Infinity, p.value));
  }

  let sessionsInWindow = 0;
  for (const workout of training.data.workouts) {
    const day = toLocalDay(workout.start_time, ctx.timeZone);
    if (day >= w.from && day <= w.to && workout.exercises.some((e) => e.exercise_template_id === exercise.templateId)) sessionsInWindow += 1;
  }

  const breaks: Break[] = longBreaks(exercise.points).filter((b) => b.from >= w.from && b.to <= w.to);

  return {
    context: contextOf(ctx, w, unit),
    id: exercise.templateId,
    title: exercise.title,
    measure: METRIC_LABEL[metric],
    unit: resultUnit(metric, unit),
    bestEver: point(summary.best),
    latestInWindow: point(summary.current),
    changeInWindow: summary.change == null ? null : measuredChange(metric, summary.change, unit),
    sessionsInWindow,
    daysCharted: summary.history.length,
    prsInWindow: summary.prs.slice(-MAX_PRS).map((p) => point(p)!),
    /** Each period's best as [start day, value]: compact, so two years of weeks stay small. */
    series: { by, points: [...periods].map(([start, best]): [string, number] => [start, measured(metric, best, unit).value]) },
    breaks,
    ...(exercise.points.length === 0 ? { note: "No sets to chart" as const } : {}),
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface UnitRangeArgs extends RangeArgs {
  unit?: Unit;
}

/** The overview's tracklist: the estimated-1RM lifts trained most in the window. */
export function mainLifts(ctx: ToolContext, args: UnitRangeArgs) {
  const w = resolveWindow(ctx.training, args);
  const unit = args.unit ?? DEFAULT_UNIT;
  return {
    context: contextOf(ctx, w, unit),
    lifts: mainLiftsIn(ctx.training, w).map(({ lift, sessions }, i) => {
      const s = summarizeIn(lift.points, w);
      const best = recordsBy(s.history).at(-1);
      return {
        rank: i + 1,
        side: sideOf(lift.muscle),
        id: lift.templateId,
        title: lift.title,
        /** Days the lift was charted in the window: what the tracklist ranks by. */
        daysCharted: sessions,
        bestSetInWindow: best ? { ...measured(lift.metric, best.value, unit), set: formatPointSet(best, lift.type, unit), date: best.date } : null,
        change: s.change == null ? null : measuredChange(lift.metric, s.change, unit),
        latest: s.current ? measured(lift.metric, s.current.value, unit) : null,
        prInWindow: s.prs.length > 0,
      };
    }),
  };
}

/** How often training happened: this month against the usual month, and the window's weeks and breaks. */
export function consistency(ctx: ToolContext, args: RangeArgs) {
  const { training } = ctx;
  const w = resolveWindow(training, args);
  const { thisMonth, monthlyAverage } = monthlySessions(training.days, training.endDay);
  const stats = windowStats(training.days, w);
  return {
    context: contextOf(ctx, w, null),
    thisMonth,
    monthlyAverage: monthlyAverage == null ? null : round1(monthlyAverage),
    sessionsInWindow: stats.sessions,
    trainingDaysInWindow: stats.trainingDays,
    sessionsPerWeek: stats.sessionsPerWeek,
    weeksTrained: stats.weeksTrained,
    weeksInWindow: stats.weeks,
    longestBreak: overlapsData(training, w) ? longestBreak(training.days, w) : null,
  };
}

const TOP_MUSCLES = 10;

/** Where the training goes: working sets per week for the six main groups and the busiest muscles. */
export function balance(ctx: ToolContext, args: RangeArgs) {
  const w = resolveWindow(ctx.training, args);
  const muscles = setsPerWeekByMuscleIn(ctx.training.data, ctx.timeZone, w);
  return {
    context: contextOf(ctx, w, null),
    rule: "Light means under half the sets per week of the median group.",
    groups: groupVolumes(muscles).map((g) => ({ group: g.group, setsPerWeek: round1(g.setsPerWeek), light: g.light })),
    muscles: muscles.slice(0, TOP_MUSCLES).map((m) => ({ muscle: muscleLabel(m.muscle), group: muscleGroup(m.muscle), setsPerWeek: round1(m.setsPerWeek) })),
  };
}

const RECENT_LIMIT = 5;
const RECENT_MAX = 40;

export interface RecentWorkoutsArgs extends RangeArgs {
  limit?: number;
  unit?: Unit;
}

export interface RecentWorkoutsResult {
  context: ResultContext;
  /** Workouts in the window, when there is one; more than `workouts` holds when the cap cut the list. */
  totalInWindow?: number;
  workouts: { date: string; title: string; exercises: { id: string; title: string; topSet: string; allTimeRecord: boolean }[] }[];
  note?: string;
}

/**
 * The training log as Latest entries shows it: each workout with every exercise's top set.
 * With no window, the latest `limit` (5) workouts. With a window, every workout in it, up to
 * the cap of 40, plus how many the window holds so a cut-off list never passes as complete.
 */
export function recentWorkouts(ctx: ToolContext, args: RecentWorkoutsArgs): RecentWorkoutsResult {
  const unit = args.unit ?? DEFAULT_UNIT;
  const windowed = args.range != null || args.from != null || args.to != null;
  const w = windowed ? resolveWindow(ctx.training, args) : null;
  const limit = clamp(args.limit ?? (windowed ? RECENT_MAX : RECENT_LIMIT), 1, RECENT_MAX);
  const shown = latestEntries(ctx.training, limit, ctx.timeZone, w ?? undefined);
  const workouts = shown.map(({ workout, day, sets }) => ({
    date: day,
    title: workout.title,
    exercises: sets.map(({ exercise, top, record }) => ({
      id: exercise.templateId,
      title: exercise.title,
      topSet: formatPointSet(top, exercise.type, unit),
      allTimeRecord: record,
    })),
  }));
  if (!w) return { context: contextOf(ctx, null, unit), workouts };
  let total = 0;
  for (const workout of ctx.training.data.workouts) {
    const day = toLocalDay(workout.start_time, ctx.timeZone);
    if (day >= w.from && day <= w.to) total += 1;
  }
  return {
    context: contextOf(ctx, w, unit),
    totalInWindow: total,
    workouts,
    ...(total > shown.length ? { note: `Showing the latest ${shown.length} of ${total} workouts in the window; ask for a shorter window to see the rest.` } : {}),
  };
}
