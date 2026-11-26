import { useEffect } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Element ids for one section: the one to scroll to, and optionally a different one to focus (default: the same). */
export type SectionTarget = string | { scroll: string; focus: string };

const GIVE_UP_MS = 2000;
const SETTLE_MS = 1500;

/**
 * Content above the target can still be loading when the first scroll lands. For a short while after it, whenever the
 * page has stopped moving and the heading is not where it belongs (below the sticky header), scrolls to it again.
 * Stops at once when the person scrolls or types. Returns the function that stops it.
 */
function keepInPlace(el: HTMLElement): () => void {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const end = performance.now() + SETTLE_MS;
  let previous = NaN;
  let timer = 0;
  const tick = () => {
    const top = el.getBoundingClientRect().top;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (top === previous && Math.abs(top - margin) > 8 && !atBottom) el.scrollIntoView({ block: 'start', behavior: 'auto' });
    previous = top;
    if (performance.now() < end) timer = window.setTimeout(tick, 100);
  };
  const stop = () => {
    window.clearTimeout(timer);
    for (const type of ['wheel', 'touchstart', 'keydown']) window.removeEventListener(type, stop);
  };
  for (const type of ['wheel', 'touchstart', 'keydown']) window.addEventListener(type, stop, { passive: true });
  timer = window.setTimeout(tick, 100);
  return stop;
}

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
    let stop = () => {};
    const look = () => {
      const el = document.getElementById(scrollId);
      if (el) {
        el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
        stop = keepInPlace(el);
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
    return () => {
      cancelAnimationFrame(frame);
      stop();
    };
  }, [section, reduced]);
}
