import { describe, expect, it } from "vitest";
import type { HealthDataset } from "../core/types";
import { loadHealth } from "./useHealth";

const dataset = (source: HealthDataset["source"]): HealthDataset => ({
  source,
  imported_at: "2026-11-25T00:00:00Z",
  export_date: "2026-11-25",
  days: [{ date: "2026-11-25", steps: 1 }],
});

/** A fake fetch over a map of path suffix -> dataset; anything else is Vite's HTML fallback. Records requests. */
function fakeFetch(files: Record<string, HealthDataset>) {
  const requested: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requested.push(url);
    const hit = Object.keys(files).find((f) => url.endsWith(f));
    return hit
      ? new Response(JSON.stringify(files[hit]), { headers: { "content-type": "application/json" } })
      : new Response("<!doctype html>", { headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  return { fn, requested };
}

describe("loadHealth", () => {
  it("returns the real health file", async () => {
    const real = dataset("apple-health");
    const { fn } = fakeFetch({ "data/health.json": real, "data/sample-health.json": dataset("sample") });
    expect(await loadHealth(fn, false)).toEqual(real);
  });

  it("returns null for a missing file with real Hevy data, never requesting the sample", async () => {
    const { fn, requested } = fakeFetch({ "data/sample-health.json": dataset("sample") });
    expect(await loadHealth(fn, false)).toBeNull();
    expect(requested.some((u) => u.includes("sample-health"))).toBe(false);
  });

  it("falls back to the sample when the Hevy data is the sample", async () => {
    const sample = dataset("sample");
    const { fn } = fakeFetch({ "data/sample-health.json": sample });
    expect(await loadHealth(fn, true)).toEqual(sample);
  });

  it("returns null when the sample is wanted but missing", async () => {
    const { fn } = fakeFetch({});
    expect(await loadHealth(fn, true)).toBeNull();
  });
});
