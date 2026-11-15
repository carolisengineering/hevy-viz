import { useMemo } from "react";
import { GroupBars } from "../../components/GroupBars";
import { setsPerWeekByGroup } from "../../core/balance";
import type { DateRange } from "../../core/ranges";
import { routeHref } from "../../hooks/useRoute";
import { TIME_ZONE, type Training } from "../../hooks/useTraining";

/** The six main groups at a glance, with a link to every muscle. */
export function BalanceBox({ training, range }: { training: Training; range: DateRange }) {
  const groups = useMemo(() => setsPerWeekByGroup(training.data, TIME_ZONE, range, training.endDay), [training, range]);

  return (
    <section className="box balance-box" aria-labelledby="balance-box-title">
      <div className="box-head">
        <h3 id="balance-box-title">Balance</h3>
        <span className="quiet">working sets per week</span>
      </div>
      <GroupBars groups={groups} />
      <a className="more" href={routeHref({ view: "balance" })}>
        Every muscle
      </a>
    </section>
  );
}
