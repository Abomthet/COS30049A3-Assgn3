// Empty-watchlist playground: the settings, where they are read from, and when the playground is available.
// Self-contained and temporary: delete the watchlist-empty folder and empty-watchlist.css when a look is chosen.
import { useCallback, useMemo, useSyncExternalStore } from 'react';

export type Art = 0 | 1 | 2 | 3;
export type Align = 'center' | 'left';
export type Size = 's' | 'm' | 'l';
export type Suggest = 'off' | '3' | '5';

export interface PlaySettings {
  art: Art;
  align: Align;
  size: Size;
  /** Show the empty state even when the watchlist has entries (client side only; nothing is changed). */
  empty: boolean;
  suggest: Suggest;
}

export const DEFAULTS: PlaySettings = { art: 0, align: 'center', size: 'm', empty: false, suggest: 'off' };

const STORE_KEY = 'empty-watchlist-play';
const CHANGED = 'empty-watchlist-play-changed';

const ONE_OF = {
  art: ['0', '1', '2', '3'],
  align: ['center', 'left'],
  size: ['s', 'm', 'l'],
  suggest: ['off', '3', '5'],
} as const;

/** The query part of a hash ('#/watchlist?art=2' gives 'art=2'). */
const queryOf = (hash: string) => hash.split('?')[1] ?? '';

/** True in development, and in a production build only when the hash query contains `play`. */
export function playEnabled(hash: string, dev: boolean = import.meta.env.DEV): boolean {
  return dev || new URLSearchParams(queryOf(hash)).has('play');
}

function pick(raw: Record<string, string | null | undefined>, base: PlaySettings): PlaySettings {
  const ok = <K extends keyof typeof ONE_OF>(key: K): string | undefined => {
    const v = raw[key];
    return v != null && (ONE_OF[key] as readonly string[]).includes(v) ? v : undefined;
  };
  const art = ok('art');
  const empty = raw.empty;
  return {
    art: art ? (Number(art) as Art) : base.art,
    align: (ok('align') as Align | undefined) ?? base.align,
    size: (ok('size') as Size | undefined) ?? base.size,
    suggest: (ok('suggest') as Suggest | undefined) ?? base.suggest,
    empty: empty === '1' ? true : empty === '0' ? false : base.empty,
  };
}

/** Settings from a stored JSON string (if any), then the hash query on top of them. */
export function parseSettings(hash: string, stored: string | null = null): PlaySettings {
  let base = DEFAULTS;
  try {
    if (stored) base = pick(JSON.parse(stored) as Record<string, string>, DEFAULTS);
  } catch {
    /* a damaged stored value is ignored */
  }
  const q = new URLSearchParams(queryOf(hash));
  return pick(Object.fromEntries(q.entries()), base);
}

const toRaw = (s: PlaySettings): Record<string, string> => ({
  art: String(s.art), align: s.align, size: s.size, empty: s.empty ? '1' : '0', suggest: s.suggest,
});

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  window.addEventListener(CHANGED, cb);
  return () => {
    window.removeEventListener('hashchange', cb);
    window.removeEventListener(CHANGED, cb);
  };
};
const snapshot = () => `${window.location.hash}\n${readStored() ?? ''}`;

/** The playground's state: whether it is available, the settings in force and a way to change them. */
export function usePlaySettings(): { enabled: boolean; settings: PlaySettings; update: (patch: Partial<PlaySettings>) => void } {
  const snap = useSyncExternalStore(subscribe, snapshot, () => '\n');
  const [hash, stored] = useMemo(() => {
    const i = snap.indexOf('\n');
    return [snap.slice(0, i), snap.slice(i + 1) || null] as const;
  }, [snap]);
  const enabled = playEnabled(hash);
  const settings = useMemo(() => (enabled ? parseSettings(hash, stored) : DEFAULTS), [enabled, hash, stored]);

  const update = useCallback(
    (patch: Partial<PlaySettings>) => {
      const next = { ...settings, ...patch };
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(toRaw(next)));
      } catch {
        /* storage may be blocked */
      }
      const [path, search = ''] = window.location.hash.split('?');
      const q = new URLSearchParams(search);
      for (const [k, v] of Object.entries(toRaw(next))) q.set(k, v);
      const query = q.toString().replace(/(^|&)play=(?=&|$)/, '$1play');
      history.replaceState(null, '', `${path || '#/watchlist'}?${query}`);
      window.dispatchEvent(new Event(CHANGED));
    },
    [settings],
  );

  return { enabled, settings, update };
}
