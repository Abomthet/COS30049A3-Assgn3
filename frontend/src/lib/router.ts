// Hash-based routes, so every screen and state has a URL (back button works, screenshots
// and usability tasks can start anywhere) and the app needs no server-side routing.
//
//   #/                                      Screen 1  address selection   (?q=<text> prefills and checks the lookup box)
//   #/address/<address>                     Screen 2  daily timeline (the overview tab)
//   (every address route may carry ?method=<id>, the deciding method; it is left out for the default)
//   #/address/<address>/transactions        ...its transactions tab (?status=, direction=, from=, to=, sort=, page= are the filters)
//   #/address/<address>/what-if              ...its what-if tab (V4; ?direction=in|out opens it with that direction)
//   #/address/<address>/day/<YYYY-MM-DD>    Screen 3  day's transactions
//   #/address/<address>/day/<date>/tx/<txid>          ...with one transaction open
//   #/models   #/watchlist   #/about                  the other sections in the navigation

import { useSyncExternalStore } from 'react';
import type { MethodId } from '../api/types';
import { methodSearch, parseMethod } from './methods';

export type Route =
  | { screen: 'select'; query: string | null; section?: string }
  | { screen: 'timeline'; address: string; method: MethodId }
  | { screen: 'transactions'; address: string; search: string; method: MethodId }
  | { screen: 'what-if'; address: string; search: string; method: MethodId }
  | { screen: 'day'; address: string; date: string; txid: string | null; method: MethodId }
  | { screen: 'models'; section?: string }
  | { screen: 'watchlist' }
  | { screen: 'about'; section?: string }
  | { screen: 'not-found'; path: string };

/** Reads an address bar hash (such as '#/address/…/transactions') into its screen and parts; anything unknown becomes the not-found screen. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path, search = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);

  if (parts.length === 0) {
    const params = new URLSearchParams(search);
    const section = params.get('section');
    return { screen: 'select', query: params.get('q'), ...(section ? { section } : {}) };
  }
  if (parts[0] === 'address' && parts.length === 2) {
    return { screen: 'timeline', address: parts[1], method: parseMethod(search) };
  }
  if (parts[0] === 'address' && parts.length === 3 && parts[2] === 'transactions') {
    return { screen: 'transactions', address: parts[1], search, method: parseMethod(search) };
  }
  if (parts[0] === 'address' && parts.length === 3 && parts[2] === 'what-if') {
    return { screen: 'what-if', address: parts[1], search, method: parseMethod(search) };
  }
  if (parts[0] === 'address' && parts[2] === 'day' && (parts.length === 4 || (parts.length === 6 && parts[4] === 'tx'))) {
    return { screen: 'day', address: parts[1], date: parts[3], txid: parts[5] ?? null, method: parseMethod(search) };
  }
  if (parts.length === 1 && parts[0] === 'watchlist') {
    return { screen: 'watchlist' };
  }
  if (parts.length === 1 && (parts[0] === 'models' || parts[0] === 'about')) {
    const section = new URLSearchParams(search).get('section');
    return { screen: parts[0], ...(section ? { section } : {}) };
  }
  return { screen: 'not-found', path };
}

/** A link's query string, with a leading `?` when there is one. */
const query = (...parts: string[]) => {
  const search = parts.filter(Boolean).join('&');
  return search ? `?${search}` : '';
};

/** The jump-to sections of the three long pages: `id` goes in `?section=`, `label` is the menu entry. */
export const PAGE_SECTIONS = {
  select: [
    { id: 'lookup', label: 'Look up an address' },
    { id: 'recent', label: 'Recently opened' },
    { id: 'snapshot', label: 'Addresses in the snapshot' },
  ],
  models: [
    { id: 'models', label: 'The models' },
    { id: 'test', label: 'Planted-spike test' },
    { id: 'flag', label: 'What a flag means' },
  ],
  about: [
    { id: 'shows', label: 'What it shows' },
    { id: 'unusual', label: 'What "unusual" means' },
    { id: 'decided', label: 'How a flag is decided' },
    { id: 'charts', label: 'How to read the charts' },
    { id: 'limits', label: 'Limits' },
    { id: 'data', label: 'Where the data comes from' },
    { id: 'keys', label: 'Keyboard' },
  ],
} as const;

const sectionQuery = (section?: string) => query(section ? `section=${encodeURIComponent(section)}` : '');

// `method` is the deciding method the link keeps; the default is left out.
export const paths = {
  select: (section?: string) => `#/${sectionQuery(section)}`,
  models: (section?: string) => `#/models${sectionQuery(section)}`,
  watchlist: () => '#/watchlist',
  about: (section?: string) => `#/about${sectionQuery(section)}`,
  timeline: (address: string, method?: MethodId) => `#/address/${encodeURIComponent(address)}${query(method ? methodSearch(method) : '')}`,
  /** `search` is the filters' query string, without the `?`; it carries the method itself. */
  transactions: (address: string, search = '') => `#/address/${encodeURIComponent(address)}/transactions${query(search)}`,
  /** `direction` opens the lab with that direction chosen. */
  whatIf: (address: string, direction?: 'in' | 'out', method?: MethodId) =>
    `#/address/${encodeURIComponent(address)}/what-if${query(direction ? `direction=${direction}` : '', method ? methodSearch(method) : '')}`,
  day: (address: string, date: string, method?: MethodId) => `#/address/${encodeURIComponent(address)}/day/${date}${query(method ? methodSearch(method) : '')}`,
  tx: (address: string, date: string, txid: string, method?: MethodId) =>
    `#/address/${encodeURIComponent(address)}/day/${date}/tx/${txid}${query(method ? methodSearch(method) : '')}`,
};

/** Moves to a hash in the address bar; with replace it changes the bar without adding a history entry. */
export function navigate(hash: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) {
    history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The current route, which updates whenever the address bar's hash changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  return parseRoute(hash);
}
