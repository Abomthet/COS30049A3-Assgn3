import { useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PageHeading } from './components/PageHeading';
import { Shell } from './components/Shell';
import { StatePanel } from './components/StatePanel';
import { ServiceStatusProvider } from './hooks/useServiceStatus';
import { SettingsProvider } from './hooks/useSettings';
import { ToastProvider } from './hooks/useToasts';
import { paths, useRoute, type Route } from './lib/router';
import { DayScreen } from './views/DayScreen';
import { SelectScreen } from './views/SelectScreen';
import { TimelineScreen } from './views/TimelineScreen';

// A new screen starts at the top. Selecting a transaction within a day is not a new screen.
function screenKey(route: Route): string {
  switch (route.screen) {
    case 'day':
      return `day|${route.address}|${route.date}`;
    case 'timeline':
      return `tl|${route.address}`;
    default:
      return route.screen;
  }
}

// Stands in for the views that are not built yet (models, watchlist, about), so the navigation
// never leads to a dead end. Each is replaced by its own view.
function ComingSoon({ title }: { title: string }) {
  return (
    <div className="page">
      <PageHeading>{title}</PageHeading>
      <StatePanel
        tone="info"
        title="This page is not available yet"
        actions={
          <a className="btn btn-secondary" href={paths.select()}>
            Go to the address list
          </a>
        }
      >
        <p>It will be added in a later version of the Explorer.</p>
      </StatePanel>
    </div>
  );
}

function Views() {
  const route = useRoute();
  const key = screenKey(route);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  return (
    <ErrorBoundary resetKey={key}>
      {route.screen === 'select' ? <SelectScreen query={route.query} /> : null}
      {route.screen === 'timeline' ? <TimelineScreen key={route.address} address={route.address} /> : null}
      {route.screen === 'day' ? (
        <DayScreen key={`${route.address}|${route.date}`} address={route.address} date={route.date} txid={route.txid} />
      ) : null}
      {route.screen === 'models' ? <ComingSoon title="Models and limits" /> : null}
      {route.screen === 'watchlist' ? <ComingSoon title="Watchlist" /> : null}
      {route.screen === 'about' ? <ComingSoon title="About and help" /> : null}
      {route.screen === 'not-found' ? (
        <div className="page">
          <PageHeading>Page not found</PageHeading>
          <StatePanel
            tone="info"
            title="There's nothing at this link"
            actions={
              <a className="btn btn-secondary" href={paths.select()}>
                Go to the address list
              </a>
            }
          >
            <p>The link may be incomplete. Start again from the list of addresses.</p>
          </StatePanel>
        </div>
      ) : null}
    </ErrorBoundary>
  );
}

// The providers are ordered by what each needs: settings and toasts both react to the service status.
export function App() {
  return (
    <ServiceStatusProvider>
      <SettingsProvider>
        <ToastProvider>
          <Shell>
            <Views />
          </Shell>
        </ToastProvider>
      </SettingsProvider>
    </ServiceStatusProvider>
  );
}
