import type { ExerciseSummary } from "../core/metrics";

interface Props {
  exercises: ExerciseSummary[];
  value: string;
  onChange: (templateId: string) => void;
}

export function ExercisePicker({ exercises, value, onChange }: Props) {
  return (
    <label>
      <span className="visually-hidden">Exercise</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {exercises.map((e) => (
          <option key={e.templateId} value={e.templateId}>
            {e.title}
          </option>
        ))}
      </select>
    </label>
  );
}
