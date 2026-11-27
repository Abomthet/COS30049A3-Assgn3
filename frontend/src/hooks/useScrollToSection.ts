import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/** Element ids for one section: the one to scroll to, and optionally a different one to focus (default: the same). */
export type SectionTarget = string | { scroll: string; focus: string };

const SETTLE_MS = 1500;

/**
 * Content above the target can still be loading when the first scroll lands. For a short while after it, whenever the
 * page has stopped moving and the heading is not where it belongs (below the sticky header), scrolls to it again.
 * Stops at once when the person scrolls, types or presses a pointer button (a scrollbar drag, a middle-click autoscroll).
 * A scroll the page makes itself (the jump just made, or this correction) does not count. Returns the function that stops it.
 */
function keepInPlace(el: HTMLElement): () => void {
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const end = performance.now() + SETTLE_MS;
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  let previous = NaN;
  let timer = 0;
  // True while our own scrolling (a smooth jump takes a while) is still going; it clears once scroll events go quiet.
  let ours = true;
  let quiet = 0;
  const ownScroll = (ms: number) => {
    ours = true;
    window.clearTimeout(quiet);
    quiet = window.setTimeout(() => (ours = false), ms);
  };
  const onScroll = () => {
    if (ours) ownScroll(150);
    else stop();
  };
  const tick = () => {
    const top = el.getBoundingClientRect().top;
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
    if (top === previous && Math.abs(top - margin) > 8 && !atBottom) {
      ownScroll(60); // an instant scroll: its event comes within a frame or two
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    previous = top;
    if (performance.now() < end) timer = window.setTimeout(tick, 100);
  };
  function stop() {
    window.clearTimeout(timer);
    window.clearTimeout(quiet);
    for (const type of events) window.removeEventListener(type, stop);
    window.removeEventListener('scroll', onScroll);
  }
  for (const type of events) window.addEventListener(type, stop, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });
  ownScroll(150); // the jump just made (it may be smooth)
  timer = window.setTimeout(tick, 100);
  return stop;
}

/**
 * Scrolls to the page section named in the address (`?section=`) and moves keyboard focus to it.
 * The element may appear late (data loads first), so it keeps watching the page until the element exists, the
 * section changes or the page goes away; it does nothing if there is no section. Runs again when the section changes,
 * and when a link to the address already shown is followed (that fires no `hashchange`).
 */
export function useScrollToSection(section: string | undefined, targets: Record<string, SectionTarget>): void {
  const reduced = useReducedMotion();
  const [again, setAgain] = useState(0);
  useEffect(() => {
    // Following a link to the hash already in the address bar changes nothing else, so the click itself is the signal.
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = link.getAttribute('href') ?? '';
      if (href.startsWith('#') && href === window.location.hash) setAgain((n) => n + 1);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);
  useEffect(() => {
    const target = section ? targets[section] : undefined;
    if (!target) return;
    const scrollId = typeof target === 'string' ? target : target.scroll;
    const focusId = typeof target === 'string' ? target : target.focus;
    let stop = () => {};
    let observer: MutationObserver | null = null;
    const look = () => {
      const el = document.getElementById(scrollId);
      if (!el) return false;
      observer?.disconnect();
      el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      stop = keepInPlace(el);
      const focusEl = document.getElementById(focusId);
      if (focusEl) {
        if (!focusEl.hasAttribute('tabindex') && !/^(INPUT|BUTTON|A|SELECT|TEXTAREA)$/.test(focusEl.tagName)) focusEl.tabIndex = -1;
        focusEl.focus({ preventScroll: true });
      }
      return true;
    };
    if (!look()) {
      observer = new MutationObserver(look);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      observer?.disconnect();
      stop();
    };
  }, [section, reduced, again]);
}
