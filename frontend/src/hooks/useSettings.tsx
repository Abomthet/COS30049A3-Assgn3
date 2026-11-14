import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { AppSettings } from '../api/types';
import { BUNDLED_SETTINGS } from '../lib/settings';
import { useServiceStatus } from './useServiceStatus';

// Settings come from E2 once at start (plan section 8, "State and data"). Until E2 answers, and
// whenever the service cannot be reached, the bundled settings.json stands in, so the application
// always has limits and thresholds to work with. E2 is asked again when the service comes back.

export type SettingsOrigin = 'loading' | 'service' | 'bundled';

interface SettingsState {
  settings: AppSettings;
  origin: SettingsOrigin;
}

const SettingsContext = createContext<SettingsState>({ settings: BUNDLED_SETTINGS, origin: 'bundled' });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { recoveries } = useServiceStatus();
  const [state, setState] = useState<SettingsState>({ settings: BUNDLED_SETTINGS, origin: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    api.config({ signal: controller.signal }).then(
      (config) => setState({ settings: config, origin: 'service' }),
      () => {
        // Keep what the service last said; fall back to the bundled file only if it never answered.
        if (!controller.signal.aborted) setState((prev) => (prev.origin === 'service' ? prev : { settings: BUNDLED_SETTINGS, origin: 'bundled' }));
      },
    );
    return () => controller.abort();
  }, [recoveries]);

  return <SettingsContext.Provider value={state}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  return useContext(SettingsContext);
}
