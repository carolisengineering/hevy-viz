interface Props {
  label: string;
  value: string;
  /** Shown small beside the value, e.g. "kg". */
  unit?: string;
}

export function StatTile({ label, value, unit }: Props) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <span className="stat-figure">
        <strong>{value}</strong>
        {unit && <span className="unit"> {unit}</span>}
      </span>
    </div>
  );
}
