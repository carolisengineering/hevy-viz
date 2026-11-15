import { RANGES, type RangeId } from "../core/ranges";

interface Props {
  value: RangeId;
  onChange: (id: RangeId) => void;
}

export function RangePicker({ value, onChange }: Props) {
  return (
    <div className="segmented" role="radiogroup" aria-label="Date range">
      {RANGES.map((r) => (
        <button key={r.id} role="radio" aria-checked={value === r.id} onClick={() => onChange(r.id)}>
          {r.label}
        </button>
      ))}
    </div>
  );
}
