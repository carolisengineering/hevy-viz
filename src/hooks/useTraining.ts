// The training model, built once per dataset in the browser's time zone.
import { useMemo } from "react";
import { localTimeZone } from "../core/dates";
import { buildTraining, type Training } from "../core/training";
import type { HevyDataset } from "../core/types";

export const TIME_ZONE = localTimeZone();

/** Built once per dataset; switching views, ranges or units reuses it. */
export function useTraining(data: HevyDataset): Training {
  return useMemo(() => buildTraining(data, TIME_ZONE), [data]);
}
