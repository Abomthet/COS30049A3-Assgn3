import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import type { Route } from '../lib/router';
import { paths } from '../lib/router';

// The four sections of the application (plan section 8, "The shell around every view"). Each section owns the
// routes listed, so a day or a transaction keeps "Addresses" marked as current. Each also has a menu (the
// disclosure-navigation pattern: the label stays a link, a small button beside it shows the menu). On a wide
// screen the menu is one full-width flyout under the header, shared by the four tabs, with the page dimmed behind
// it; on a phone it opens in place under its tab. What the menus hold is in NavPanels, loaded on first use.
type Key = 'addresses' | 'models' | 'watchlist' | 'about';
const SECTIONS: Array<{ key: Key; label: string; href: string; screens: Route['screen'][] }> = [
  { key: 'addresses', label: 'Addresses', href: paths.select(), screens: ['select', 'timeline', 'transactions', 'day'] },
  { key: 'models', label: 'Models', href: paths.models(), screens: ['models'] },
  { key: 'watchlist', label: 'Watchlist', href: paths.watchlist(), screens: ['watchlist'] },
  { key: 'about', label: 'About', href: paths.about(), screens: ['about'] },
];

// The menus' contents stay out of the first screen's script: fetched when the pointer or focus first reaches the
// bar (so the first opening is not empty), or at the latest when a menu opens.
let panelsModule: Promise<typeof import('./NavPanels')> | null = null;
const loadPanels = () => (panelsModule ??= import('./NavPanels'));
const NavPanel = lazy(loadPanels);
const Flyout = lazy(() => loadPanels().then((m) => ({ default: m.Flyout })));

const CLOSE_DELAY_MS = 150;
// Hovering opens a menu only where the bar is a row and the pointer is a mouse.
const HOVER_QUERY = '(min-width: 720px) and (hover: hover) and (pointer: fine)';
const canHover = () => window.matchMedia(HOVER_QUERY).matches;

// From 720 px the bar is a row and the menus are the shared flyout; below it they open in place.
const WIDE_QUERY = '(min-width: 720px)';
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(WIDE_QUERY);
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

const firstEntry = (key: Key) => document.querySelector<HTMLElement>(`#nav-panel-${key} a`);

/** The main navigation links (Addresses, Models, Watchlist, About), with the current section marked, each with a menu of its parts; used in the shell. */
export function MainNav({ route, id, open }: { route: Route; id: string; open: boolean }) {
  // `how` tells a menu the pointer opened (it closes again when the pointer leaves) from one a button opened (it stays).
  const [shown, setShown] = useState<{ key: Key; how: 'hover' | 'pin' } | null>(null);
  const timer = useRef(0);
  const focusFirst = useRef<Key | null>(null);
  const wide = useWide();
  // The flyout's code comes the first time the pointer or focus reaches the bar, or a menu opens.
  const [wanted, setWanted] = useState(false);
  const want = () => {
    void loadPanels();
    setWanted(true);
  };

  // Following a link, or any other change of the address, closes the menu.
  useEffect(() => {
    const close = () => setShown(null);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Called when a menu's content has appeared: a move of focus that was waiting for it happens now.
  const contentReady = (key: Key) => {
    if (focusFirst.current !== key) return;
    focusFirst.current = null;
    firstEntry(key)?.focus({ preventScroll: true });
  };

  const hoverEnd = (key: Key) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShown((was) => (was?.key === key && was.how === 'hover' ? null : was)), CLOSE_DELAY_MS);
  };

  const panel = (key: Key) => (
    <Suspense fallback={null}>
      <NavPanel section={key} onReady={() => contentReady(key)} onClose={() => setShown(null)} />
    </Suspense>
  );

  return (
    <nav id={id} className={`main-nav${open ? ' is-open' : ''}`} aria-label="Main" onPointerEnter={want} onFocus={want}>
      <ul className="nav-list">
        {SECTIONS.map((s) => {
          const isOpen = shown?.key === s.key;
          const hover = (event: PointerEvent, entering: boolean) => {
            if (event.pointerType !== 'mouse' || !canHover()) return;
            if (entering) {
              window.clearTimeout(timer.current);
              setShown((was) => (was?.key === s.key ? was : { key: s.key, how: 'hover' }));
            } else hoverEnd(s.key);
          };
          return (
            <li
              key={s.key}
              className="nav-item"
              data-nav-item={s.key}
              data-open={isOpen || undefined}
              onPointerEnter={(e) => hover(e, true)}
              onPointerLeave={(e) => hover(e, false)}
            >
              <div className="nav-row">
                <a href={s.href} aria-current={s.screens.includes(route.screen) ? 'page' : undefined} onClick={() => setShown(null)}>
                  {s.label}
                </a>
                <button
                  type="button"
                  id={`nav-toggle-${s.key}`}
                  className="nav-sub-toggle"
                  aria-label={`More in ${s.label}`}
                  aria-expanded={isOpen}
                  aria-controls={`nav-panel-${s.key}`}
                  onClick={() => setShown(isOpen && shown?.how === 'pin' ? null : { key: s.key, how: 'pin' })}
                  onKeyDown={(e) => {
                    if (e.key !== 'ArrowDown') return;
                    e.preventDefault();
                    const present = isOpen ? firstEntry(s.key) : null;
                    if (present) present.focus({ preventScroll: true });
                    else {
                      focusFirst.current = s.key;
                      setShown({ key: s.key, how: 'pin' });
                    }
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {/* On a phone the menu opens here, in place; it exists only while open, so a closed menu adds nothing to the page's text. */}
              {wide ? null : (
                <div id={`nav-panel-${s.key}`} className="nav-panel" hidden={!isOpen} onClick={(e) => (e.target as Element).closest('a') && setShown(null)}>
                  {isOpen ? panel(s.key) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {wide && (wanted || shown) ? (
        <Suspense fallback={null}>
          <Flyout
            shown={shown?.key ?? null}
            onReady={contentReady}
            onClose={() => setShown(null)}
            onEnter={() => window.clearTimeout(timer.current)}
            onLeave={() => shown?.how === 'hover' && hoverEnd(shown.key)}
          />
        </Suspense>
      ) : null}
    </nav>
  );
}
