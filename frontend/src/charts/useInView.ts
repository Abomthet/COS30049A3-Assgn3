import { useEffect, useRef, useState } from 'react';

/** Whether an element is on screen, so a chart that is scrolled away or hidden is not redrawn. Always true where IntersectionObserver is missing. */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const supported = typeof IntersectionObserver !== 'undefined';
  const [inView, setInView] = useState(!supported);

  useEffect(() => {
    const el = ref.current;
    if (!el || !supported) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [supported]);

  return [ref, inView] as const;
}
