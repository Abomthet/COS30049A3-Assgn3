import { useSyncExternalStore } from 'react';
import type { MethodId } from '../api/types';
import { METHODS } from '../lib/methods';

// The user's remembered choices live in local storage under one versioned key (plan section 8,
// "State and data"). A change reaches every component that reads them, and other tabs.

export interface Preferences {
  /** null until the user chooses; the system setting applies until then. */
  theme: 'light' | 'dark' | null;
  /** The deciding method last chosen (V2's method menu); null until the user chooses, and then the default applies. */
  method: MethodId | null;
  /** The addresses opened last, newest first (V1's "Recently opened"); at most `RECENT_MAX`. */
  recent: string[];
}

export const RECENT_MAX = 5;

const KEY = 'explorer.preferences.v1';
const DEFAULTS: Preferences = { theme: null, method: null, recent: [] };

// Storage can throw (blocked, private window). The choice then lasts until the page closes.
let fallbackRaw: string | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return fallbackRaw;
  }
}

function parse(raw: string | null): Preferences {
  if (raw === null) return DEFAULTS;
  try {
    const stored = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : null,
      method: METHODS.find((m) => m.id === stored.method)?.id ?? null,
      recent: Array.isArray(stored.recent) ? stored.recent.filter((a): a is string => typeof a === 'string').slice(0, RECENT_MAX) : [],
    };
  } catch {
    return DEFAULTS;
  }
}

// useSyncExternalStore needs the same object back until the stored text changes.
let lastRaw: string | null | undefined;
let lastValue = DEFAULTS;

function getSnapshot(): Preferences {
  const raw = readRaw();
  if (raw !== lastRaw) {
    lastRaw = raw;
    lastValue = parse(raw);
  }
  return lastValue;
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function update(patch: Partial<Preferences>): void {
  const raw = JSON.stringify({ ...getSnapshot(), ...patch });
  fallbackRaw = raw;
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Kept in fallbackRaw.
  }
  listeners.forEach((notify) => notify());
}

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  return [useSyncExternalStore(subscribe, getSnapshot), update];
}

/** Puts an address first among the recently opened, once, and keeps the last few. */
export function rememberAddress(address: string): void {
  const { recent } = getSnapshot();
  if (recent[0] !== address) update({ recent: [address, ...recent.filter((a) => a !== address)].slice(0, RECENT_MAX) });
}
