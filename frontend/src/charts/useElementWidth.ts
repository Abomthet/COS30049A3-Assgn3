import { useEffect, useRef, useState } from 'react';

/**
 * Width of an element, kept up to date as the layout changes. The first measurement is immediate;
 * later ones wait until the size has stopped changing for `debounceMs`, so dragging a window edge
 * redraws a chart once, not on every pixel. Falls back when there is no layout (tests).
 */
export function useElementWidth<T extends HTMLElement>(fallback = 640, debounceMs = 150) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(measure, debounceMs);
    });
    observer.observe(el);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [debounceMs]);

  return [ref, width > 0 ? width : fallback] as const;
}
