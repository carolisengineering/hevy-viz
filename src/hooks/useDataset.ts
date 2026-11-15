import { useEffect, useState } from "react";
import { dropUndatedWorkouts } from "../core/dataset";
import type { HevyDataset } from "../core/types";

export type DatasetState =
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `skipped`: workouts dropped because their start time couldn't be read. */
  | { status: "ready"; data: HevyDataset; skipped: number };

/** Your synced data first, then the public sample. */
const DATA_FILES = ["data/hevy.json", "data/sample.json"];

async function loadDataset(signal: AbortSignal): Promise<HevyDataset> {
  for (const file of DATA_FILES) {
    const res = await fetch(import.meta.env.BASE_URL + file, { signal });
    // Vite's dev server (and many static hosts) answer a missing file with
    // index.html and status 200, so a 200 alone doesn't mean the file exists.
    if (res.ok && res.headers.get("content-type")?.includes("json")) return res.json();
  }
  throw new Error("No data found. Run `npm run sync` or `npm run sample`.");
}

/** Loads the dataset once; aborts the request if the component unmounts. */
export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    loadDataset(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", ...dropUndatedWorkouts(data) });
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => controller.abort();
  }, []);

  return state;
}
