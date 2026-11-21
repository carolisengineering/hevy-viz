import { describe, expect, it } from "vitest";
import { EVENTS_OVERLAP_MS, planSync } from "./sync-mode.ts";

const SYNCED = "2026-11-19T14:34:04.585Z";
const NOW = Date.parse(SYNCED) + 24 * 3_600_000;
const saved = (extra: Record<string, unknown> = {}) => ({
  source: "hevy",
  synced_at: SYNCED,
  workouts: [],
  exercise_templates: [],
  ...extra,
});
const text = (extra: Record<string, unknown> = {}) => JSON.stringify(saved(extra));

describe("planSync", () => {
  it("is incremental for a normal saved file", () => {
    expect(EVENTS_OVERLAP_MS).toBe(600_000);
    expect(planSync(text(), [], NOW)).toEqual({
      mode: "incremental",
      since: "2026-11-19T14:24:04.585Z",
      saved: saved(),
    });
  });

  it("is full with --full", () => {
    expect(planSync(text(), ["--full"], NOW)).toEqual({ mode: "full", reason: "--full" });
  });

  it("is full without saved data", () => {
    expect(planSync(null, [], NOW)).toEqual({ mode: "full", reason: "no saved data" });
  });

  it("is full when the saved data can't be read", () => {
    expect(planSync('{"source":"hevy","workouts":[{', [], NOW)).toEqual({
      mode: "full",
      reason: "saved data can't be read",
    });
  });

  it("is full for the sample", () => {
    expect(planSync(text({ source: "sample" }), [], NOW)).toEqual({
      mode: "full",
      reason: "saved data is the sample",
    });
  });

  it("is full when the source isn't hevy", () => {
    for (const source of [undefined, "foo", 3]) {
      expect(planSync(text({ source }), [], NOW), String(source)).toEqual({
        mode: "full",
        reason: "saved data can't be read",
      });
    }
  });

  it("is incremental when the sync time equals now", () => {
    expect(planSync(text({ synced_at: SYNCED }), [], Date.parse(SYNCED))).toMatchObject({ mode: "incremental" });
  });

  it("is full without a readable sync time", () => {
    for (const synced_at of [undefined, "soon"]) {
      expect(planSync(text({ synced_at }), [], NOW), String(synced_at)).toEqual({
        mode: "full",
        reason: "saved data has no sync time",
      });
    }
  });

  it("is full when the sync time is in the future", () => {
    const future = new Date(NOW + 3_600_000).toISOString();
    expect(planSync(text({ synced_at: future }), [], NOW)).toEqual({
      mode: "full",
      reason: "saved sync time is in the future",
    });
  });

  it("is full when workouts isn't a list", () => {
    expect(planSync(text({ workouts: {} }), [], NOW)).toEqual({
      mode: "full",
      reason: "saved data can't be read",
    });
  });

  it("is full for a non-object top level or missing exercise_templates", () => {
    for (const t of ["[]", "null", "3"]) {
      expect(planSync(t, [], NOW), t).toMatchObject({ reason: "saved data can't be read" });
    }
    expect(planSync(text({ exercise_templates: undefined }), [], NOW)).toMatchObject({
      reason: "saved data can't be read",
    });
  });
});
