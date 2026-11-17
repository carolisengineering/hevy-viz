// The MCP server's tool handlers: (context, args) → result. No SDK and no I/O here,
// so every figure comes from src/core exactly as the dashboard computes it.
import { parseDay } from "../src/core/dates";
import { muscleGroup, muscleLabel } from "../src/core/muscles";
import { METRIC_LABEL, recordsBy, type ExerciseProgress, type MetricId } from "../src/core/progress";
import { rangeById, windowFor, type DayWindow, type RangeId } from "../src/core/ranges";
import { matchExercises, type ExerciseKind, type ExerciseSort, type Training } from "../src/core/training";
import { formatValue, type Unit } from "../src/format";

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
 * end day and `to` alone starts at the first workout. A window outside the data is fine.
 */
export function resolveWindow(training: Training, args: RangeArgs): DayWindow {
  if (args.from == null && args.to == null) return windowFor(rangeById(args.range ?? DEFAULT_RANGE), training.endDay, training.firstDay);
  const from = args.from == null ? training.firstDay : checkDay(args.from);
  const to = args.to == null ? training.endDay : checkDay(args.to);
  if (from > to) throw new ToolError(`The window starts after it ends: ${from} is after ${to}.`);
  return { from, to };
}

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
  if (found.length === 0) throw new ToolError(`No exercise matches "${wanted}".`);
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
