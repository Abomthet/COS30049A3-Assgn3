import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { entryName, loadWatchlist, useWatchlistState } from '../hooks/useWatchlist';
import { usePreferences } from '../hooks/usePreferences';
import type { Route } from '../lib/router';
import { PAGE_SECTIONS, paths } from '../lib/router';
import { AddressLink } from './AddressLink';

// The four sections of the application (plan section 8, "The shell around every view"). Each
// section owns the routes listed, so a day or a transaction keeps "Addresses" marked as current.
// Each also has a menu of places inside it (the disclosure-navigation pattern: the label stays a link, a small
// button beside it shows the list), so the long pages can be opened at a section.
type Key = 'addresses' | 'models' | 'watchlist' | 'about';
const SECTIONS: Array<{ key: Key; label: string; href: string; screens: Route['screen'][] }> = [
  { key: 'addresses', label: 'Addresses', href: paths.select(), screens: ['select', 'timeline', 'transactions', 'day'] },
  { key: 'models', label: 'Models', href: paths.models(), screens: ['models'] },
  { key: 'watchlist', label: 'Watchlist', href: paths.watchlist(), screens: ['watchlist'] },
  { key: 'about', label: 'About', href: paths.about(), screens: ['about'] },
];

const CLOSE_DELAY_MS = 150;
const RECENT_SHOWN = 3;
const WATCHED_SHOWN = 5;
// Hovering opens a menu only where the bar is a row and the pointer is a mouse.
const HOVER_QUERY = '(min-width: 720px) and (hover: hover) and (pointer: fine)';
const canHover = () => window.matchMedia(HOVER_QUERY).matches;

const link = (href: string, text: ReactNode) => (
  <li key={href}>
    <a href={href}>{text}</a>
  </li>
);

const sectionLinks = (screen: 'select' | 'models' | 'about') =>
  PAGE_SECTIONS[screen]
    // "Recently opened" has its own group below, and only when there is something in it.
    .filter((s) => s.id !== 'recent')
    .map((s) => link(paths[screen](s.id), s.label));

function AddressesEntries() {
  const [{ recent, method }] = usePreferences();
  return (
    <>
      {sectionLinks('select')}
      {recent.length > 0 ? (
        <>
          <li className="nav-panel-label">Recently opened</li>
          {recent.slice(0, RECENT_SHOWN).map((a) => (
            <li key={a}>
              <AddressLink className="mono" address={a} href={paths.timeline(a, method ?? undefined)} head={8} tail={6} />
            </li>
          ))}
        </>
      ) : null}
    </>
  );
}

function WatchlistEntries() {
  const state = useWatchlistState();
  // Nothing is asked of the service until this menu is opened.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'error') void loadWatchlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entries = state.status === 'ready' ? state.entries : [];
  return (
    <>
      {link(paths.watchlist(), 'Open the watchlist')}
      {state.status === 'ready' && entries.length === 0 ? <li className="nav-panel-note">Nothing watched yet</li> : null}
      {state.status === 'idle' || state.status === 'loading' ? <li className="nav-panel-note">Loading…</li> : null}
      {entries.slice(0, WATCHED_SHOWN).map((e, i) => (
        <li key={e.address} className={i === 0 ? 'nav-panel-first' : undefined}>
          <a href={paths.timeline(e.address)} title={e.address}>
            {entryName(e)}
          </a>
        </li>
      ))}
      {entries.length > WATCHED_SHOWN ? link(paths.watchlist(), `All ${entries.length} on the watchlist`) : null}
    </>
  );
}

function Entries({ section }: { section: Key }) {
  if (section === 'addresses') return <AddressesEntries />;
  if (section === 'watchlist') return <WatchlistEntries />;
  return <>{sectionLinks(section)}</>;
}

/** The main navigation links (Addresses, Models, Watchlist, About), with the current section marked, each with a menu of its parts; used in the shell. */
export function MainNav({ route, id, open }: { route: Route; id: string; open: boolean }) {
  // `how` tells a menu the pointer opened (it closes again when the pointer leaves) from one a button opened (it stays).
  const [shown, setShown] = useState<{ key: Key; how: 'hover' | 'pin' } | null>(null);
  const timer = useRef(0);
  const focusFirst = useRef(false);

  // Following a link, or any other change of the address, closes the menu.
  useEffect(() => {
    const close = () => setShown(null);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  // A click or touch outside the open menu closes it.
  useEffect(() => {
    if (!shown) return;
    const away = (event: Event) => {
      if ((event.target as Element).closest('[data-nav-item]')?.getAttribute('data-nav-item') !== shown.key) setShown(null);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [shown]);

  // After ArrowDown on the button, the first entry takes focus once the list is on screen.
  useEffect(() => {
    if (shown && focusFirst.current) document.querySelector<HTMLElement>(`#nav-panel-${shown.key} a`)?.focus();
    focusFirst.current = false;
  }, [shown]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !shown) return;
    const inside = (event.target as Element).closest('[data-nav-item]');
    setShown(null);
    if (inside) document.getElementById(`nav-toggle-${shown.key}`)?.focus();
  };

  return (
    <nav id={id} className={`main-nav${open ? ' is-open' : ''}`} aria-label="Main" onKeyDown={onKeyDown}>
      <ul className="nav-list">
        {SECTIONS.map((s) => {
          const isOpen = shown?.key === s.key;
          const hover = (event: PointerEvent, entering: boolean) => {
            if (event.pointerType !== 'mouse' || !canHover()) return;
            window.clearTimeout(timer.current);
            if (entering) setShown((was) => (was?.key === s.key ? was : { key: s.key, how: 'hover' }));
            else timer.current = window.setTimeout(() => setShown((was) => (was?.key === s.key && was.how === 'hover' ? null : was)), CLOSE_DELAY_MS);
          };
          // Tabbing out of the item closes it. A blur with no target (a click on a spot that cannot take focus) is left to the click handler.
          const onBlur = (event: FocusEvent<HTMLLIElement>) => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setShown((was) => (was?.key === s.key ? null : was));
          };
          return (
            <li key={s.key} className="nav-item" data-nav-item={s.key} data-open={isOpen || undefined} onPointerEnter={(e) => hover(e, true)} onPointerLeave={(e) => hover(e, false)} onBlur={onBlur}>
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
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      focusFirst.current = true;
                      setShown({ key: s.key, how: 'pin' });
                    }
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
                    <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              {/* The entries exist only while the list is open, so a closed menu adds nothing to the page's text. */}
              <ul id={`nav-panel-${s.key}`} className="nav-panel" hidden={!isOpen} onClick={(e) => (e.target as Element).closest('a') && setShown(null)}>
                {isOpen ? <Entries section={s.key} /> : null}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
