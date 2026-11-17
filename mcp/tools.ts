// The MCP server's tool handlers: (context, args) → result. No SDK and no I/O here,
// so every figure comes from src/core exactly as the dashboard computes it.
import type { DayWindow, RangeId } from "../src/core/ranges";
import type { Training } from "../src/core/training";
import type { Unit } from "../src/format";

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
