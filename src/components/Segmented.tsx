import { useRef, type KeyboardEvent, type ReactNode } from "react";

interface Props<T extends string> {
  /** Accessible name of the group, e.g. "Date range". */
  label: string;
  /** With an `icon`, the button shows the icon and keeps `label` as its name and tooltip. */
  options: readonly { id: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * A radio group drawn as one ballpoint box. Tab reaches the chosen option;
 * the arrow keys move the choice, as in any radio group.
 */
export function Segmented<T extends string>({ label, options, value, onChange }: Props<T>) {
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].id);
    groupRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={label} ref={groupRef}>
      {options.map((o, i) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          title={o.icon ? o.label : undefined}
          className={o.icon ? "icon-option" : undefined}
        >
          {o.icon ? (
            <>
              {o.icon}
              <span className="visually-hidden">{o.label}</span>
            </>
          ) : (
            o.label
          )}
        </button>
      ))}
    </div>
  );
}
