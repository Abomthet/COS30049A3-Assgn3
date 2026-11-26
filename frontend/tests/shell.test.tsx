// The application shell: navigation, service status, settings from E2, theme, toasts and the
// error boundary. Everything runs on the mock, including a back end that is down or still starting.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import { mockControls } from '../src/api/mock/mockApi';
import ex from '../src/api/mock/fixtures/examples.json';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ToastProvider, useToasts } from '../src/hooks/useToasts';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

function start(hash = '#/') {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}


afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
  vi.restoreAllMocks();
});

describe('navigation', () => {
  test('lists the four sections and marks the current one', async () => {
    start();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual(['Addresses', 'Models', 'Watchlist', 'About']);
    expect(within(nav).getByRole('link', { name: 'Addresses' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Models' })).not.toHaveAttribute('aria-current');
  });

  test('a deeper view keeps its section marked, and other sections have a page to go to', async () => {
    const user = start(`#/address/${ex.mainAddress}`);
    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Addresses' })).toHaveAttribute('aria-current', 'page');
    await user.click(within(nav).getByRole('link', { name: 'About' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'About and help' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
  });

  test('on a phone the menu button opens and closes the list, and following a link closes it', async () => {
    const user = start();
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await user.click(screen.getByRole('link', { name: 'Models' }));
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  test('the skip link moves focus to the main region', async () => {
    const user = start();
    await user.click(screen.getByRole('link', { name: 'Skip to content' }));
    expect(screen.getByRole('main')).toHaveFocus();
  });
});

describe('service status', () => {
  test('ready: the dot says so in words', async () => {
    start();
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });

  test('starting: says it needs no action, and the page loads by itself on the next poll after the service is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockControls.starting = true;
      start(`#/address/${ex.mainAddress}`);
      expect(await screen.findByText('Starting up')).toBeInTheDocument();
      expect(await screen.findByText(/This page will load by itself/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /again/i })).not.toBeInTheDocument();

      mockControls.starting = false;
      await act(async () => vi.advanceTimersByTime(settings.web.requests.healthPollSeconds * 1000));
      expect(await screen.findByText('Connected')).toBeInTheDocument();
      expect(await screen.findByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test('down: the page shows the network state, the dot turns to "not responding" with a next action', async () => {
    mockControls.offline = true;
    start(`#/address/${ex.mainAddress}`);
    expect(await screen.findByText("Can't reach the Explorer")).toBeInTheDocument();
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(screen.getByText(/Pages reload when it is back\./)).toBeInTheDocument();
    expect(screen.queryByText(/built-in/)).not.toBeInTheDocument();
  });

  test('back again: "Check again" reloads the failed page by itself and says the service is back', async () => {
    mockControls.offline = true;
    const user = start(`#/address/${ex.mainAddress}`);
    await screen.findByText('Not connected');

    mockControls.offline = false;
    await user.click(screen.getByRole('button', { name: 'Check again' }));

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    // No click on the panel's own "Try again": the view reloaded when the service returned.
    expect(await screen.findByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: 'Notifications' })).findByText('Connection restored.')).toBeInTheDocument();
  });

  test('a service that drops out while the user reads is announced', async () => {
    const user = start();
    await screen.findByText('Connected');
    await screen.findByRole('link', { name: new RegExp(`full address ${ex.mainAddress}`) });
    mockControls.offline = true;
    // Opening an address fails; that failure triggers an immediate check, not a wait for the next poll.
    await user.click(screen.getByRole('link', { name: new RegExp(`full address ${ex.mainAddress}`) }));
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(await within(screen.getByRole('region', { name: 'Notifications' })).findByText('Lost the connection. Retrying.')).toBeInTheDocument();
  });
});

describe('settings from E2', () => {
  test('the header shows what the service says', async () => {
    start();
    expect(await screen.findByTestId('header-meta')).toHaveTextContent(/^Snapshot of 22 Oct 2026 · Blockstream Esplora$/);
  });

  test('the footer carries the course credit alone: no limitation line, no help line', async () => {
    start();
    await screen.findByTestId('header-meta');
    const footer = screen.getByRole('contentinfo');
    const credit = within(footer).getByText('COS30049 Computing Technology Innovation Project · group HCMC_COS30049.1_4');
    expect(credit).toHaveClass('footer-credit');
    expect(footer).toHaveTextContent(/^COS30049 Computing Technology Innovation Project · group HCMC_COS30049\.1_4$/);
    expect(footer).not.toHaveTextContent(LIMITATION_LINE);
    expect(footer).not.toHaveTextContent(/Unusual means|Days and times are in UTC/);
  });

  test('when the service is unreachable the page still renders with the bundled settings', async () => {
    mockControls.offline = true;
    start();
    await screen.findByText('Not connected');
    // The snapshot is known only to the service, so the line is simply absent.
    expect(screen.queryByText(/Snapshot of/)).not.toBeInTheDocument();
  });

  test('E2 is asked again when the service returns', async () => {
    mockControls.offline = true;
    const user = start();
    await screen.findByText('Not connected');
    mockControls.offline = false;
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByText(/Snapshot of 22 Oct 2026/)).toBeInTheDocument();
  });
});

describe('theme', () => {
  test('the switch flips the theme, writes it on the page and remembers it', async () => {
    const user = start();
    const toggle = screen.getByRole('switch', { name: 'Dark theme' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(JSON.parse(localStorage.getItem('explorer.preferences.v1')!)).toEqual({ theme: 'dark', method: null, recent: [], scenarios: {} });
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  test('a remembered theme is applied when the page opens', async () => {
    localStorage.setItem('explorer.preferences.v1', JSON.stringify({ theme: 'dark' }));
    start();
    expect(screen.getByRole('switch', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });

  test('damaged stored preferences are ignored', () => {
    localStorage.setItem('explorer.preferences.v1', '{not json');
    start();
    expect(screen.getByRole('switch', { name: 'Dark theme' })).toHaveAttribute('aria-checked', 'false');
  });
});

describe('toasts', () => {
  function Trigger({ withAction = false, onAction = () => {} }: { withAction?: boolean; onAction?: () => void }) {
    const { notify } = useToasts();
    return (
      <button
        type="button"
        onClick={() =>
          notify({ message: 'Removed from the watchlist', action: withAction ? { label: 'Undo', onAction } : undefined })
        }
      >
        Show
      </button>
    );
  }
  const region = () => screen.getByRole('region', { name: 'Notifications' });

  test('a toast appears in the polite live region and can be dismissed', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    expect(region()).toHaveAttribute('aria-live', 'polite');
    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(within(region()).getByText('Removed from the watchlist')).toBeInTheDocument();
    await user.click(within(region()).getByRole('button', { name: 'Dismiss this message' }));
    await waitFor(() => expect(within(region()).queryByText('Removed from the watchlist')).not.toBeInTheDocument());
  });

  test('its action runs once and closes it', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger withAction onAction={onAction} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show' }));
    await user.click(within(region()).getByRole('button', { name: 'Undo' }));
    expect(onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(within(region()).queryByText('Removed from the watchlist')).not.toBeInTheDocument());
  });

  test('it leaves by itself after five seconds, ten with an action', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(
        <ToastProvider>
          <Trigger />
          <Trigger withAction />
        </ToastProvider>,
      );
      const [plain, withAction] = screen.getAllByRole('button', { name: 'Show' });
      await user.click(plain);
      await user.click(withAction);
      expect(within(region()).getAllByText('Removed from the watchlist')).toHaveLength(2);

      await act(async () => vi.advanceTimersByTime(5_400));
      expect(within(region()).getAllByText('Removed from the watchlist')).toHaveLength(1);
      await act(async () => vi.advanceTimersByTime(5_000));
      expect(within(region()).queryByText('Removed from the watchlist')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('error boundary', () => {
  let broken = true;
  function Fragile() {
    if (broken) throw new Error('boom');
    return <p>All good</p>;
  }

  test('a crash is caught, the rest of the page stays, and "Reload this part" tries again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    broken = true;
    const user = userEvent.setup();
    render(
      <>
        <p>Outside</p>
        <ErrorBoundary>
          <Fragile />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This part of the page failed to load');
    expect(screen.getByText('Outside')).toBeInTheDocument();
    broken = false;
    await user.click(screen.getByRole('button', { name: 'Reload this part' }));
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  test('moving to another view gives a failed part another try', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    broken = true;
    const { rerender } = render(
      <ErrorBoundary resetKey="one">
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('state-crashed')).toBeInTheDocument();
    broken = false;
    rerender(
      <ErrorBoundary resetKey="two">
        <Fragile />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });
});

describe('slow requests', () => {
  test('after five seconds the loading message says it is still working', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockControls.latencyMs = 60_000;
      start(`#/address/${ex.mainAddress}`);
      expect(await screen.findByText(/Loading this address's activity/)).toBeInTheDocument();
      expect(screen.queryByText(/Still working/)).not.toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(5_100));
      expect(screen.getByText(/Still working/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('error states for the new statuses', () => {
  test('a 500 shows the reference, a timeout offers another try', async () => {
    const { ErrorState } = await import('../src/components/ErrorState');
    const { ApiError } = await import('../src/api/types');
    const retry = vi.fn();
    const { rerender } = render(
      <ErrorState error={new ApiError(500, { status: 'server_error', message: 'Something unexpected happened.', requestId: '0f3c9a1e7b2d' })} onRetry={retry} />,
    );
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument();
    expect(screen.getByText('0f3c9a1e7b2d')).toBeInTheDocument();

    rerender(<ErrorState error={new ApiError(0, { status: 'timeout', message: 'x' })} onRetry={retry} />);
    expect(screen.getByRole('heading', { name: 'This is taking longer than it should' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();

    rerender(<ErrorState error={new ApiError(503, { status: 'unavailable', message: 'x' })} onRetry={retry} />);
    expect(screen.getByRole('heading', { name: 'The Explorer is starting' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
