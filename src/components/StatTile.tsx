interface Props {
  label: string;
  value: string;
}

export function StatTile({ label, value }: Props) {
  return (
    <div className="stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
