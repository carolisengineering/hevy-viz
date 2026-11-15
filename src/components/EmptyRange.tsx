import type { E1rmPoint } from "../core/metrics";
import { formatDate } from "../format";

interface Props {
  /** The lift's latest session of all time, if it has one. */
  lastSession: E1rmPoint | undefined;
  onShowAll: () => void;
}

/** Shown in place of the chart or table when the range has no sessions. */
export function EmptyRange({ lastSession, onShowAll }: Props) {
  if (!lastSession) {
    return (
      <div className="empty-state">
        <p className="muted">No sets with weight and reps to chart yet.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <p>No sessions in this range.</p>
      <p className="muted">Last session: {formatDate(lastSession.date)}</p>
      <button className="link" onClick={onShowAll}>
        Show all time
      </button>
    </div>
  );
}
