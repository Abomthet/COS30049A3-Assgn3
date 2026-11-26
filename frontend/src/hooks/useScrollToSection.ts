import { useEffect } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Element ids for one section: the one to scroll to, and optionally a different one to focus (default: the same). */
export type SectionTarget = string | { scroll: string; focus: string };

const GIVE_UP_MS = 2000;

/**
 * Scrolls to the page section named in the address (`?section=`) and moves keyboard focus to it.
 * The element may appear late (data loads first), so it looks again each frame for up to two seconds,
 * and does nothing if it never appears or there is no section. Runs again when the section changes.
 */
export function useScrollToSection(section: string | undefined, targets: Record<string, SectionTarget>): void {
  const reduced = useReducedMotion();
  useEffect(() => {
    const target = section ? targets[section] : undefined;
    if (!target) return;
    const scrollId = typeof target === 'string' ? target : target.scroll;
    const focusId = typeof target === 'string' ? target : target.focus;
    const started = performance.now();
    let frame = 0;
    const look = () => {
      const el = document.getElementById(scrollId);
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        const focusEl = document.getElementById(focusId);
        if (focusEl) {
          if (!focusEl.hasAttribute('tabindex') && !/^(INPUT|BUTTON|A|SELECT|TEXTAREA)$/.test(focusEl.tagName)) focusEl.tabIndex = -1;
          focusEl.focus({ preventScroll: true });
        }
      } else if (performance.now() - started < GIVE_UP_MS) {
        frame = requestAnimationFrame(look);
      }
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [section, reduced]);
}
