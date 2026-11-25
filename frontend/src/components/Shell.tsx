import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LimitationProvider, useLimitationElsewhere } from '../hooks/useLimitationShown';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useSettings } from '../hooks/useSettings';
import { useToasts } from '../hooks/useToasts';
import { formatDay } from '../lib/dates';
import { useIsLive } from '../lib/liveOrigin';
import { paths, useRoute } from '../lib/router';
import { MainNav } from './MainNav';
import { OfflineBanner } from './OfflineBanner';
import { ServiceStatus } from './ServiceStatus';
import { ThemeSwitch } from './ThemeSwitch';

/** Tells the user when the service drops out or returns, since that can happen while they read. */
function useStatusToasts(): void {
  const { state } = useServiceStatus();
  const { notify } = useToasts();
  const previous = useRef(state);

  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (state === 'ready' && (was === 'unreachable' || was === 'starting')) {
      notify({ tone: 'success', message: 'Connection restored.' });
    } else if (state === 'unreachable' && was === 'ready') {
      notify({ tone: 'error', message: 'Lost the connection. Retrying.' });
    }
  }, [state, notify]);
}

/** The footer's copy of the limitation line, left out (not just hidden) while a flag box or the replay's flagged line shows it. */
function FooterLimitation() {
  const { settings } = useSettings();
  return useLimitationElsewhere() ? null : <p className="footer-limitation">{settings.limitationLine}</p>;
}

/** The frame around every view: skip link, header, main region, footer (plan section 8). */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <LimitationProvider>
      <ShellFrame>{children}</ShellFrame>
    </LimitationProvider>
  );
}

function ShellFrame({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  useStatusToasts();

  // On a phone the menu closes once a link has been followed.
  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  const { snapshot } = settings;
  // On a fetched address's pages the strip says where that data came from instead of the snapshot's date.
  const live = useIsLive('address' in route ? route.address : null);

  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      <OfflineBanner />
      <header className="app-header">
        <div className="container header-inner">
          <a className="brand" href={paths.select()}>
            <span>Bitcoin Address Activity Explorer</span>
          </a>
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            Menu
          </button>
          <MainNav id="main-nav" route={route} open={menuOpen} />
        </div>
        <div className="header-bar">
          <div className="container header-bar-inner">
            {snapshot ? (
              <p className="header-meta" data-testid="header-meta">
                {live ? 'Live data' : `Snapshot of ${formatDay(snapshot.snapshotDate)}`} · {snapshot.source}
              </p>
            ) : null}
            <ServiceStatus />
            <ThemeSwitch />
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="container">
        {children}
      </main>

      <footer className="app-footer">
        <div className="container footer-inner">
          <FooterLimitation />
          <p className="footer-help">Unusual means different from this address's own earlier activity.</p>
          <p className="footer-credit">COS30049 Computing Technology Innovation Project · group HCMC_COS30049.1_4</p>
        </div>
      </footer>
    </>
  );
}
