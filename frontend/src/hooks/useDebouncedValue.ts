import { useCallback, useEffect, useState } from 'react';

/**
 * `value`, once it has stayed the same for `delayMs`; `flush` takes the current value at once (a
 * button that asks for the answer now). `settled` is false from the moment `value` changes until
 * the delayed copy has caught up, so a view can show "updating" without waiting for the delay.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): { debounced: T; settled: boolean; flush: () => void } {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === debounced) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, debounced, delayMs]);
  const flush = useCallback(() => setDebounced(value), [value]);
  return { debounced, settled: value === debounced, flush };
}
