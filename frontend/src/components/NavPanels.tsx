import { Children, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { entryName, loadWatchlist, useWatchlistState } from '../hooks/useWatchlist';
import { usePreferences } from '../hooks/usePreferences';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useRequest } from '../hooks/useRequest';
import { plural, shortAddress } from '../lib/format';
import { METHODS } from '../lib/methods';
import { PAGE_SECTIONS, paths } from '../lib/router';
import { AddressLink } from './AddressLink';

// What each navigation menu holds. This module is loaded the first time a menu is about to open (MainNav
// imports it lazily), so the first screen carries only the tab row; the lists, their requests and the
// watchlist rendering come with it.

export type NavKey = 'addresses' | 'models' | 'watchlist' | 'about';

const RECENT_SHOWN = 3;
const FLAGGED_SHOWN = 3;
const WATCHED_SHOWN = 5;
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** The order an item appears in (0 first), as a delay of its fade-in; the delays stop growing after five steps. */
const rise = (n: number): CSSProperties => ({ '--i': Math.min(n, 5) }) as CSSProperties;

/** A column: a small grey label and a list; each child is one item, appearing one step after the one before. */
function Col({ label, start = 0, wide, stacked, id, children }: { label: string; start?: number; wide?: boolean; stacked?: boolean; id?: string; children: ReactNode }) {
  const labelId = useId();
  return (
    <div className={`nav-col${wide ? ' nav-col-wide' : ''}${stacked ? ' nav-col-stacked' : ''}`} id={id}>
      <p className="nav-eyebrow" id={labelId} style={rise(start)}>
        {label}
      </p>
      <ul aria-labelledby={labelId}>
        {Children.toArray(children).map((child, i) => (
          <li key={(child as { key?: string }).key ?? i} style={rise(start + 1 + i)}>
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small right-pointing chevron drawn as a shape (not a font glyph); it takes the text colour. */
const Chevron = ({ className }: { className: string }) => (
  <svg className={className} viewBox="0 0 8 12" width="8" height="12" aria-hidden="true" focusable="false">
    <path d="M1.5 1.5 6 6l-4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A main link: its chevron stays attached to the last word, so a long label never leaves it alone on a line. */
const Primary = ({ href, children }: { href: string; children: ReactNode }) => {
  const text = Children.toArray(children).join('');
  const cut = text.lastIndexOf(' ') + 1;
  return (
    <a className="nav-primary" href={href}>
      {text.slice(0, cut)}
      <span className="nav-last">
        {text.slice(cut)}
        <Chevron className="nav-chev" />
      </span>
    </a>
  );
};

/** A small link with an optional quiet part after it (read out after a comma). */
const Secondary = ({ href, title, detail, mono, children }: { href: string; title?: string; detail?: ReactNode; mono?: boolean; children: ReactNode }) => (
  <a className="nav-secondary" href={href} title={title}>
    <span className={mono ? 'mono' : undefined}>{children}</span>
    {detail ? (
      <>
        <span className="sr-only">, </span>
        <span className="nav-detail">{detail}</span>
      </>
    ) : null}
  </a>
);

const Note = ({ children }: { children: ReactNode }) => <span className="nav-note">{children}</span>;

function AddressesPanel() {
  const [{ recent, method }] = usePreferences();
  // The snapshot list is asked for only now, the first time this menu opens (or taken from the page's own copy of it).
  const list = useRequest('addresses', (signal) => api.listAddresses({ signal }));
  const flagged = useMemo(
    () =>
      list.status === 'success'
        ? list.data.addresses
            .filter((a) => a.flaggedCount > 0)
            .sort((a, b) => b.flaggedCount - a.flaggedCount || a.address.localeCompare(b.address))
            .slice(0, FLAGGED_SHOWN)
        : [],
    [list],
  );
  const total = list.status === 'success' ? list.data.addresses.length : null;
  const shownRecent = recent.slice(0, RECENT_SHOWN);
  return (
    <>
      <Col label="Explore Addresses">
        <Primary href={paths.select('lookup')}>Look up an address</Primary>
        <Primary href={paths.select('snapshot')}>{total === null ? 'Browse all addresses' : `Browse all ${plural(total, 'address', 'addresses')}`}</Primary>
      </Col>
      {list.status === 'loading' ? (
        <Col label="Most flagged" start={1}>
          <Note>Loading…</Note>
        </Col>
      ) : null}
      {flagged.length > 0 ? (
        <Col label="Most flagged" start={1}>
          {flagged.map((a) => (
            <AddressLink
              key={a.address}
              className="nav-secondary mono"
              address={a.address}
              href={paths.timeline(a.address, method ?? undefined)}
              head={8}
              tail={6}
              detail={plural(a.flaggedCount, 'flag')}
            />
          ))}
        </Col>
      ) : null}
      {shownRecent.length > 0 ? (
        <Col label="Recently opened" start={2}>
          {shownRecent.map((a) => (
            <AddressLink key={a} className="nav-secondary mono" address={a} href={paths.timeline(a, method ?? undefined)} head={8} tail={6} />
          ))}
        </Col>
      ) : null}
    </>
  );
}

function ModelsPanel() {
  const count = METHODS.length;
  return (
    <>
      <Col label="Explore Models">
        <Primary href={paths.models('models')}>Compare the {NUMBER_WORDS[count] ?? count} models</Primary>
        <Primary href={paths.models('test')}>Test-pattern results</Primary>
        <Primary href={paths.models('flag')}>What a flag means</Primary>
      </Col>
      <Col label="The models" start={1} wide>
        {METHODS.map((m) => (
          <Secondary key={m.id} href={paths.models(`model-${m.id}`)} detail={m.family}>
            {m.name}
          </Secondary>
        ))}
      </Col>
    </>
  );
}

function WatchlistPanel() {
  const state = useWatchlistState();
  // Nothing is asked of the service until this menu is opened.
  useEffect(() => {
    if (state.status === 'idle' || state.status === 'error') void loadWatchlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entries = state.status === 'ready' ? state.entries : [];
  return (
    <>
      <Col label="Your watchlist">
        <Primary href={paths.watchlist()}>Open the watchlist</Primary>
      </Col>
      {state.status === 'idle' || state.status === 'loading' ? (
        <Col label="Watched addresses" start={1}>
          <Note>Loading…</Note>
        </Col>
      ) : null}
      {state.status === 'ready' && entries.length === 0 ? (
        <Col label="Watched addresses" start={1}>
          <Note>Nothing watched yet. Use the star beside an address to add it.</Note>
        </Col>
      ) : null}
      {entries.length > 0 ? (
        <Col label="Watched addresses" start={1} stacked>
          {entries.slice(0, WATCHED_SHOWN).map((e) => {
            const flags = typeof e.summary?.flaggedCount === 'number' ? plural(e.summary.flaggedCount, 'flag') : null;
            return e.label ? (
              <Secondary key={e.address} href={paths.timeline(e.address)} title={e.address} detail={[shortAddress(e.address), flags].filter(Boolean).join(' · ')}>
                {entryName(e)}
              </Secondary>
            ) : (
              <Secondary key={e.address} href={paths.timeline(e.address)} title={e.address} detail={flags} mono>
                {entryName(e)}
              </Secondary>
            );
          })}
          {entries.length > WATCHED_SHOWN ? (
            <Secondary key="all" href={paths.watchlist()}>
              All {entries.length} on the watchlist
            </Secondary>
          ) : null}
        </Col>
      ) : null}
    </>
  );
}

// The three that matter most come first; "See more" brings the rest.
const ABOUT_MAIN = ['decided', 'unusual', 'limits'];
const aboutLabel = (id: string) => PAGE_SECTIONS.about.find((s) => s.id === id)!.label;

function AboutPanel() {
  const [more, setMore] = useState(false);
  const moreId = useId();
  const rest = PAGE_SECTIONS.about.filter((s) => !ABOUT_MAIN.includes(s.id));
  return (
    <>
      <div className="nav-stack">
        <Col label="About this explorer">
          {ABOUT_MAIN.map((id) => (
            <Primary key={id} href={paths.about(id)}>
              {aboutLabel(id)}
            </Primary>
          ))}
        </Col>
        <button type="button" className="nav-more" aria-expanded={more} aria-controls={moreId} onClick={() => setMore((m) => !m)} style={rise(4)}>
          {more ? 'See less' : 'See more'}
          <svg className="nav-more-chev" viewBox="0 0 12 8" width="10" height="7" aria-hidden="true" focusable="false">
            <path d="M1.5 1.5 6 6l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {more ? (
        <Col label="More about the explorer" id={moreId}>
          {rest.map((s) => (
            <Secondary key={s.id} href={paths.about(s.id)}>
              {s.label}
            </Secondary>
          ))}
        </Col>
      ) : null}
    </>
  );
}

/**
 * What closes the open menu `key` besides its own controls (these listeners are here, not in the tab row, so the first screen
 * does not carry them): a click, touch or focus that lands away from the menu and its tab, and Escape, which also returns
 * to the tab's button. In the wide layout the tab key is steered too (see `steerTab`).
 */
function useDismiss(key: NavKey | null, wide: boolean, close: () => void): void {
  useEffect(() => {
    if (!key) return;
    const away = (event: Event) => {
      const el = event.target instanceof Element ? event.target : null;
      if (el && !el.closest('.nav-flyout') && el.closest('[data-nav-item]')?.getAttribute('data-nav-item') !== key) close();
    };
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        const inside = event.target instanceof Element && event.target.closest('[data-nav-item], .nav-flyout');
        close();
        if (inside) document.getElementById(`nav-toggle-${key}`)?.focus();
      } else if (wide && event.key === 'Tab') steerTab(event, key);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('focusin', away);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('focusin', away);
      document.removeEventListener('keydown', keys);
    };
    // `close` only ever sets the state to closed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, wide]);
}

/**
 * In the wide layout the flyout sits after the whole tab row, so the tab key is steered to keep the order a menu has in a
 * list: its button, then its entries, then the next tab.
 */
function steerTab(event: globalThis.KeyboardEvent, key: NavKey): void {
  const target = event.target as Element;
  const entries = Array.from(document.getElementById(`nav-panel-${key}`)?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
  const toggle = document.getElementById(`nav-toggle-${key}`);
  const go = (el: HTMLElement | null | undefined) => {
    event.preventDefault();
    el?.focus({ preventScroll: true });
  };
  if (!event.shiftKey && target === toggle && entries.length > 0) go(entries[0]);
  else if (event.shiftKey && target === entries[0]) go(toggle);
  else if (!event.shiftKey && target === entries[entries.length - 1]) {
    const next = toggle?.closest('li')?.nextElementSibling?.querySelector<HTMLElement>('a');
    if (next) go(next);
  }
}

const SECTION_KEYS: NavKey[] = ['addresses', 'models', 'watchlist', 'about'];

function Panel({ section }: { section: NavKey }) {
  return (
    <div className="nav-cols">
      {section === 'addresses' ? <AddressesPanel /> : section === 'models' ? <ModelsPanel /> : section === 'watchlist' ? <WatchlistPanel /> : <AboutPanel />}
    </div>
  );
}

/** The content of one menu where it opens in place (a phone); `onReady` is called once it is on screen, for a focus move that waited for it. */
export default function InlinePanel({ section, onReady, onClose }: { section: NavKey; onReady: () => void; onClose: () => void }) {
  useEffect(onReady, []); // eslint-disable-line react-hooks/exhaustive-deps
  useDismiss(section, false, onClose);
  return <Panel section={section} />;
}

// How long a closing flyout keeps its content while it folds away (the CSS transition is a little shorter).
const LEAVE_MS = 220;

/**
 * The wide layout's menu: one surface under the header, full width, shared by the four tabs, with the dimmed page behind it.
 * Its height follows its content, so changing tab, "See more" or data arriving all animate the same way; a closing menu
 * keeps its content until it has folded away. It first appears closed and opens a frame later, so even the first opening animates.
 */
export function Flyout({
  shown,
  onReady,
  onClose,
  onEnter,
  onLeave,
}: {
  shown: NavKey | null;
  onReady: (key: NavKey) => void;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const reduced = useReducedMotion();
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [armed, setArmed] = useState(false);
  const [leaving, setLeaving] = useState<NavKey | null>(null);
  useDismiss(shown, true, onClose);
  const open = armed && shown !== null;
  // A fresh opening starts its content afresh (a "See more" left open does not come back).
  const opening = useRef({ was: false, count: 0 });
  if (shown && !opening.current.was) opening.current.count += 1;
  opening.current.was = !!shown;
  const contentKey = shown ?? leaving;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (shown) setLeaving(shown);
    else if (reduced) setLeaving(null);
    else {
      const t = window.setTimeout(() => setLeaving(null), LEAVE_MS);
      return () => window.clearTimeout(t);
    }
  }, [shown, reduced]);

  useEffect(() => {
    if (open && contentKey) onReady(contentKey);
    // When it has opened, and when another tab's content arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contentKey]);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  return (
    <>
      <div
        className="nav-flyout"
        data-open={open ? '' : undefined}
        style={{ height: open ? height : 0 }}
        onClick={(e) => (e.target as Element).closest('a') && onClose()}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
      >
        <div ref={innerRef} className="nav-flyout-inner">
          {/* Folding away, the content is already out of reach of the keyboard and of screen readers. */}
          <div className="container" aria-hidden={shown ? undefined : true} inert={!shown}>
            {SECTION_KEYS.map((key) => (
              <div key={key} id={`nav-panel-${key}`} className="nav-panel" hidden={contentKey !== key}>
                {contentKey === key ? <Panel key={`${opening.current.count}-${key}`} section={key} /> : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* The dimmed page behind the flyout: out of the accessibility tree, and a click on it closes the menu. */}
      {createPortal(<div className="nav-scrim" data-open={open ? '' : undefined} aria-hidden="true" onPointerDown={onClose} />, document.body)}
    </>
  );
}
