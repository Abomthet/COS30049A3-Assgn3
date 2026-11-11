import { useTheme } from '../hooks/useTheme';

/** A two-way switch between the light and dark themes. The choice is remembered. */
export function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  return (
    <button type="button" role="switch" aria-checked={theme === 'dark'} className="theme-switch" onClick={toggle}>
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      Dark theme
    </button>
  );
}
