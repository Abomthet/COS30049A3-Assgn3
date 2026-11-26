import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api/client';
import type { ApiError, WatchlistBody, WatchlistEntry } from '../api/types';
import { shortAddress } from '../lib/format';
import { runRequest } from './useRequest';
import { useToasts } from './useToasts';

// The watchlist (S-04, E13 to E15) is the one piece of state the user changes that several screens show at
// once: the stars on V1 and V2 and the list on V6. It lives here, outside any view, so a star saved on V2 is
// already filled when V1 or V6 is opened, and a removal on V6 empties the star on the next screen. The server
// holds the list; this is the copy the page reads and keeps in step with each change it makes.

export type WatchlistState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; entries: WatchlistEntry[] }
  | { status: 'error'; error: ApiError };

let state: WatchlistState = { status: 'idle' };
const listeners = new Set<() => void>();

function set(next: WatchlistState): void {
  state = next;
  listeners.forEach((notify) => notify());
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

/** Back to the start, for the tests: nothing loaded. */
export function resetWatchlistStore(): void {
  state = { status: 'idle' };
}

/** Asks E13 for the list. A list already on screen stays there while it is asked again. */
export async function loadWatchlist(): Promise<void> {
  if (state.status === 'loading') return;
  if (state.status !== 'ready') set({ status: 'loading' });
  const res = await runRequest(() => api.watchlist());
  if (res.ok) set({ status: 'ready', entries: res.data.entries });
  else if (state.status !== 'ready') set({ status: 'error', error: res.error });
}

function change(update: (entries: WatchlistEntry[]) => WatchlistEntry[]): void {
  if (state.status === 'ready') set({ status: 'ready', entries: update(state.entries) });
}

type Outcome<T = void> = { ok: true; data: T } | { ok: false; error: ApiError };

/** E14. A new entry goes to the top of the list, as the service orders it; a replaced one stays where it is. */
export async function saveWatchlistEntry(address: string, body: WatchlistBody): Promise<Outcome<WatchlistEntry>> {
  const res = await runRequest(() => api.putWatchlist(address, body));
  if (!res.ok) return res;
  const { entry, created } = res.data;
  change((entries) => (created ? [entry, ...entries.filter((e) => e.address !== entry.address)] : entries.map((e) => (e.address === entry.address ? entry : e))));
  return { ok: true, data: entry };
}

/** E15, taking effect on screen at once. If the service refuses, the entry comes back where it was. An entry the service no longer has is gone all the same. */
export async function removeWatchlistEntry(entry: WatchlistEntry): Promise<Outcome> {
  const index = state.status === 'ready' ? state.entries.findIndex((e) => e.address === entry.address) : -1;
  change((entries) => entries.filter((e) => e.address !== entry.address));
  const res = await runRequest(() => api.deleteWatchlist(entry.address));
  if (res.ok || res.error.body.status === 'not_found') return { ok: true, data: undefined };
  change((entries) => (index < 0 ? entries : [...entries.slice(0, index), entry, ...entries.slice(index)]));
  return res;
}

/** The store as it stands, without loading it (the navigation's Watchlist menu loads it only when opened). */
export const useWatchlistState = (): WatchlistState => useSyncExternalStore(subscribe, () => state);

/** The list, loaded the first time any screen asks for it. */
export function useWatchlist(): { state: WatchlistState; entryFor: (address: string) => WatchlistEntry | undefined; reload: () => void } {
  const current = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (state.status === 'idle') void loadWatchlist();
  }, []);
  return {
    state: current,
    entryFor: (address) => (current.status === 'ready' ? current.entries.find((e) => e.address === address) : undefined),
    reload: () => void loadWatchlist(),
  };
}

/** What an entry is called in a sentence: its label as typed, or the short address when it has none. */
export const entryName = (entry: Pick<WatchlistEntry, 'label' | 'address'>): string => entry.label || shortAddress(entry.address);

/** Removes an entry and says so in a toast whose Undo puts it back with the same label and note. */
export function useRemoveWithUndo(): (entry: WatchlistEntry) => Promise<boolean> {
  const { notify } = useToasts();
  const undo = async (entry: WatchlistEntry) => {
    const res = await saveWatchlistEntry(entry.address, { label: entry.label, note: entry.note });
    notify(res.ok ? { tone: 'success', message: `${entryName(entry)} is back on the watchlist.` } : { tone: 'error', message: res.error.body.message });
  };
  return async (entry) => {
    const res = await removeWatchlistEntry(entry);
    notify(
      res.ok
        ? { tone: 'info', message: `Removed ${entryName(entry)} from the watchlist.`, action: { label: 'Undo', onAction: () => void undo(entry) } }
        : { tone: 'error', message: `${entryName(entry)} could not be removed: ${res.error.body.message}` },
    );
    return res.ok;
  };
}
