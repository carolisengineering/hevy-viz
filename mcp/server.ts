// The hevy-viz MCP server: answers questions about the synced Hevy data over stdio.
// Read-only and local: it reads data/hevy.json (or HEVY_VIZ_DATA), never the network,
// and never HEVY_API_KEY. stdout is the protocol channel, so diagnostics go to stderr.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { dropUndatedWorkouts, rangeEndDay } from "../src/core/dataset";
import { buildTraining } from "../src/core/training";
import type { HevyDataset } from "../src/core/types";
import { balance, consistency, exerciseProgress, findExercises, mainLifts, recentWorkouts, ToolError, type ToolContext } from "./tools";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_DATA = "data/hevy.json";
const DEFAULT_TIME_ZONE = "America/Chicago";
const UNREADABLE = "The data file couldn't be read; if a sync is running, try again in a moment, or run `npm run sync` again.";

/** The data as last loaded, and the file modification time it was loaded at. */
export interface Loaded {
  ctx: ToolContext;
  mtimeMs: number;
}

/** A path as the user would recognize it: relative inside the repo, absolute outside it. */
const shown = (file: string): string => {
  const rel = relative(ROOT, file);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : file;
};

const isDataset = (value: unknown): value is HevyDataset =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as HevyDataset).workouts) &&
  Array.isArray((value as HevyDataset).exercise_templates);

/**
 * The training model from `file`. Returns `previous` untouched while the file's mtime and
 * the local day are the same; a new day rebuilds it from the data already loaded, so
 * "today" moves on in a long-running server just as it does on reloading the dashboard.
 * A file that can't be read or parsed throws a ToolError; the caller keeps `previous`,
 * so a sync caught half-written only fails the calls made while it runs.
 */
export function loadTraining(file: string, timeZone: string, previous?: Loaded, now = new Date()): Loaded {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new ToolError(`No synced data at ${shown(file)}. Run \`npm run sync\` in the hevy-viz folder.`);
    }
    throw new ToolError(UNREADABLE);
  }
  if (previous && previous.mtimeMs === mtimeMs) {
    const { training } = previous.ctx;
    if (rangeEndDay(training.data, timeZone, now) === training.endDay) return previous;
    return { ctx: { ...previous.ctx, training: buildTraining(training.data, timeZone, now) }, mtimeMs };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new ToolError(UNREADABLE);
  }
  if (!isDataset(parsed)) throw new ToolError(UNREADABLE);
  const { data, skipped } = dropUndatedWorkouts(parsed);
  if (skipped > 0) console.error(`hevy-viz: skipped ${skipped} workout(s) without a readable start time`);
  return { ctx: { training: buildTraining(data, timeZone, now), timeZone, syncedAt: data.synced_at }, mtimeMs };
}

/** HEVY_VIZ_TZ, or America/Chicago. Throws, naming the variable, when it isn't an IANA zone. */
export function resolveTimeZone(env: NodeJS.ProcessEnv): string {
  const timeZone = env.HEVY_VIZ_TZ || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new Error(`HEVY_VIZ_TZ "${timeZone}" isn't a time zone. Use an IANA name like America/Chicago.`);
  }
  return timeZone;
}

// Argument schemas, shared by the tools that take them.
const range = {
  range: z.enum(["90d", "1y", "all"]).optional().describe("Preset window ending today: 90d, 1y (default) or all."),
  from: z.string().optional().describe("First day, YYYY-MM-DD, inclusive. from/to override range; from alone runs to today. A custom window is cut to the days the log covers; context.window gives the days used."),
  to: z.string().optional().describe("Last day, YYYY-MM-DD, inclusive. to alone starts at the first workout."),
};
const unit = { unit: z.enum(["kg", "lb"]).optional().describe("Weight unit for values and text: lb (default, whole pounds) or kg (to 0.1).") };

const annotations = { readOnlyHint: true, openWorldHint: false } as const;

/** Every description ends with the same promise and freshness rule. */
const describe = (what: string, timeZone: string): string =>
  `${what} Figures match the hevy-viz dashboard; dates are local days in ${timeZone}; data is as of the last sync (context.syncedAt). Mention the sync date if it's more than a few days old.`;

const text = (body: string, isError = false): CallToolResult => ({ content: [{ type: "text", text: body }], ...(isError ? { isError } : {}) });

/** The server with its six tools, reading `file` (reloaded whenever it changes). */
export function createServer(file: string, timeZone: string): McpServer {
  const server = new McpServer({ name: "hevy-viz", version: "1.0.0" });
  let loaded: Loaded | undefined;

  /** Runs a handler against fresh data; ToolErrors become tool errors Claude can read. */
  const run =
    <A,>(handler: (ctx: ToolContext, args: A) => object) =>
    async (args: A): Promise<CallToolResult> => {
      try {
        loaded = loadTraining(file, timeZone, loaded);
        const result = handler(loaded.ctx, args) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
      } catch (e) {
        if (e instanceof ToolError) return text(e.message, true);
        throw e;
      }
    };

  server.registerTool(
    "find_exercises",
    {
      title: "Find exercises",
      description: describe(
        "Lists exercises from the training log, searched by title (plain case-insensitive substring), with sessions, last done and all-time best by the exercise's measure. Use it to find an exercise's id.",
        timeZone,
      ),
      inputSchema: {
        query: z.string().optional().describe("Text the title contains, like 'bench' or '(barbell)'."),
        kind: z.enum(["weights", "bodyweight", "timed", "distance"]).optional().describe("Only exercises of this kind."),
        sort: z.enum(["sessions", "recent", "az"]).optional().describe("Most sessions (default), most recent, or A–Z."),
        limit: z.number().int().min(1).optional().describe("How many to list: 20 by default, 50 at most. `total` counts every match."),
        ...unit,
      },
      annotations,
    },
    run(findExercises),
  );

  server.registerTool(
    "exercise_progress",
    {
      title: "Exercise progress",
      description: describe(
        "How one exercise is going in a window: best ever, latest and change, PRs (judged against all time), sessions, breaks over 28 days, and a series of [period start, best value] pairs per week (per month past 104 weeks). Measures: Est. 1RM (Epley, working sets of 12 reps or fewer), heaviest set, most reps, longest time or longest distance, by exercise type.",
        timeZone,
      ),
      inputSchema: { exercise: z.string().describe("Exercise id, or a title: exact match first, then a unique substring."), ...range, ...unit },
      annotations,
    },
    run(exerciseProgress),
  );

  server.registerTool(
    "main_lifts",
    {
      title: "Main lifts",
      description: describe(
        "Am I getting stronger? The overview's tracklist: the six estimated-1RM lifts trained on the most days in the window, each with its best set, change, latest Est. 1RM and whether it set a PR.",
        timeZone,
      ),
      inputSchema: { ...range, ...unit },
      annotations,
    },
    run(mainLifts),
  );

  server.registerTool(
    "consistency",
    {
      title: "Consistency",
      description: describe(
        "Am I training consistently? Sessions this month against the monthly average, and for the window: sessions, training days, sessions per week, weeks trained, the longest run of rest days, and training time in minutes (the total, and the average per training day; workouts that overlap on a day count once). With series: true, also minutes and training days per week (per month past 104 weeks); the first and last periods can be partial.",
        timeZone,
      ),
      inputSchema: {
        ...range,
        series: z.boolean().optional().describe("Add minutes and training days per week (per month past 104 weeks). Use it for questions about change over time."),
      },
      annotations,
    },
    run(consistency),
  );

  server.registerTool(
    "balance",
    {
      title: "Balance",
      description: describe(
        "Am I training in balance? Working sets per week for the six main muscle groups (with the ones that are light flagged) and the ten busiest muscles, over the window.",
        timeZone,
      ),
      inputSchema: range,
      annotations,
    },
    run(balance),
  );

  server.registerTool(
    "recent_workouts",
    {
      title: "Recent workouts",
      description: describe(
        "The training log: workouts newest first, each exercise's top set and whether it was an all-time record. With no window, the latest `limit` (default 5). With range or from/to, every workout in the window up to 40, and totalInWindow; a note says when the list was cut.",
        timeZone,
      ),
      inputSchema: { ...range, limit: z.number().int().min(1).optional().describe("How many workouts: 5 by default without a window, 40 at most."), ...unit },
      annotations,
    },
    run(recentWorkouts),
  );

  return server;
}

async function main(): Promise<void> {
  let timeZone: string;
  try {
    timeZone = resolveTimeZone(process.env);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
  const file = resolve(ROOT, process.env.HEVY_VIZ_DATA || DEFAULT_DATA);
  await createServer(file, timeZone).connect(new StdioServerTransport());
  console.error(`hevy-viz MCP server: ${shown(file)}, ${timeZone}`);
}

// Started directly (npm run mcp, or a client's launch command), not imported by a test.
const realPath = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return "";
  }
};
if (process.argv[1] && realPath(process.argv[1]) === realPath(fileURLToPath(import.meta.url))) await main();
