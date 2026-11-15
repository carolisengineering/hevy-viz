// A small setting remembered per browser. Storage can be blocked (private windows,
// previews), so every access is guarded and the setting still works for the visit.
import { useCallback, useState } from "react";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return allowed.find((v) => v === stored) ?? fallback;
  } catch {
    return fallback;
  }
}

export function usePreference<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState(() => read(key, allowed, fallback));
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not remembered, but still applied for this visit.
      }
    },
    [key],
  );
  return [value, update];
}
