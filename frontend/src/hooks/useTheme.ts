import { useEffect, useSyncExternalStore } from 'react';
import { usePreferences } from './usePreferences';

export type Theme = 'light' | 'dark';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribeToSystem(onChange: () => void): () => void {
  const media = query();
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * The theme in force and a way to flip it. Until the user chooses, the system setting applies (the
 * stylesheet follows it with no attribute set). Choosing writes data-theme on <html>, which the
 * stylesheet puts above the system setting, and remembers it. A ?theme= link (screenshots) sets
 * the same attribute before the app starts.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [{ theme: chosen }, update] = usePreferences();
  const systemDark = useSyncExternalStore(subscribeToSystem, () => query().matches);

  useEffect(() => {
    if (chosen) document.documentElement.dataset.theme = chosen;
  }, [chosen]);

  const forced = document.documentElement.dataset.theme;
  const theme: Theme = chosen ?? (forced === 'light' || forced === 'dark' ? forced : systemDark ? 'dark' : 'light');
  return { theme, toggle: () => update({ theme: theme === 'dark' ? 'light' : 'dark' }) };
}
