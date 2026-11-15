import "./Overview.css";
import type { DateRange } from "../core/ranges";
import type { Unit } from "../format";
import type { Training } from "../hooks/useTraining";
import { BalanceBox } from "./overview/BalanceBox";
import { Consistency } from "./overview/Consistency";
import { LatestEntries } from "./overview/LatestEntries";
import { MainLifts } from "./overview/MainLifts";

interface Props {
  training: Training;
  range: DateRange;
  unit: Unit;
}

/** Getting stronger, training consistently, training in balance: answered at a glance. */
export function Overview({ training, range, unit }: Props) {
  return (
    <div className="overview">
      <div className="overview-main">
        <MainLifts training={training} range={range} unit={unit} />
        <LatestEntries training={training} unit={unit} />
      </div>
      <aside className="overview-side" aria-label="Consistency and balance">
        <Consistency training={training} range={range} />
        <BalanceBox training={training} range={range} />
      </aside>
    </div>
  );
}
