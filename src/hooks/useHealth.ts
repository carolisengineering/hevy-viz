import { useEffect, useState } from "react";
import type { HealthDataset } from "../core/types";

export type HealthState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "error"; message: string }
  | { status: "ready"; data: HealthDataset };

/** The file `npm run health` writes, and the public demo's stand-in. */
const HEALTH_FILE = "data/health.json";
const SAMPLE_HEALTH_FILE = "data/sample-health.json";

async function fetchJson(fetchFn: typeof fetch, file: string, signal?: AbortSignal): Promise<HealthDataset | null> {
  const res = await fetchFn(import.meta.env.BASE_URL + file, { signal });
  // A missing file comes back from Vite (and many static hosts) as index.html with status 200.
  return res.ok && res.headers.get("content-type")?.includes("json") ? res.json() : null;
}

/**
 * The loading rule, pure so it can be tested without a DOM: the real file, else the sample
 * only when the Hevy data is the sample. Null means no health data.
 */
export async function loadHealth(
  fetchFn: typeof fetch,
  hevyIsSample: boolean,
  signal?: AbortSignal,
): Promise<HealthDataset | null> {
  const real = await fetchJson(fetchFn, HEALTH_FILE, signal);
  if (real || !hevyIsSample) return real;
  return fetchJson(fetchFn, SAMPLE_HEALTH_FILE, signal);
}

/** Loads the health data once per `hevyIsSample`; independent of the Hevy dataset's own loading. */
export function useHealth(hevyIsSample: boolean): HealthState {
  const [state, setState] = useState<HealthState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    loadHealth(fetch, hevyIsSample, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState(data ? { status: "ready", data } : { status: "none" });
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => controller.abort();
  }, [hevyIsSample]);

  return state;
}
