import type { ProgressPoint } from "../core/progress";
import { formatDate } from "../format";

interface Props {
  /** The exercise's latest session of all time, if it has one. */
  lastSession: ProgressPoint | undefined;
  onShowAll: () => void;
}

/** Shown in place of the chart or table when the range has no sessions. */
export function EmptyRange({ lastSession, onShowAll }: Props) {
  if (!lastSession) {
    return (
      <div className="empty-state">
        <p className="quiet">No sets to chart yet.</p>
      </div>
    );
  }
  return (
    <div className="empty-state">
      <p>No sessions in this range.</p>
      <p className="quiet">Last session: {formatDate(lastSession.date)}</p>
      <button className="link" onClick={onShowAll}>
        Show all time
      </button>
    </div>
  );
}
