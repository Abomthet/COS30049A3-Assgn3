// T21: the state catalogue (plan section 11) in every view. Each view is opened with its main request
// failing in each way the service or the network can fail, and must say what happened and offer a next
// action; then the states that are not request failures: the offline banner, the busy countdown, the
// slow-request notice and the time limit. The mock produces offline, starting, busy and slow itself;
// the other statuses are answered by a spy, as the journeys do.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { ApiError } from '../src/api/types';
import { settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

function start(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  // NFR-01 pass condition 3, on whatever each test left on screen.
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

/** Each view with the request that fills it. V4's lab asks for its curve as soon as it opens; V7 asks for nothing it cannot do without. */
const VIEWS = [
  { view: 'V1 address selection', hash: '#/', call: 'listAddresses' },
  { view: 'V2 overview', hash: `#/address/${ex.mainAddress}`, call: 'timeline' },
  { view: 'V2 transactions', hash: `#/address/${ex.mainAddress}/transactions`, call: 'transactions' },
  { view: 'V3 day', hash: `#/address/${ex.flagged.address}/day/${ex.flagged.date}`, call: 'transactions' },
  { view: 'V3 transaction', hash: `#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}`, call: 'transaction' },
  { view: 'V4 what-if lab', hash: `#/address/${ex.mainAddress}/what-if`, call: 'whatIfCurve' },
  { view: 'V5 models', hash: '#/models', call: 'methods' },
] as const;

/** Each failure, the heading it must show and the next action it must offer ('none' where the plan says none is needed). */
const FAILURES = [
  { name: 'network failure', error: new ApiError(0, { status: 'network', message: "Can't reach the Explorer." }), title: "Can't reach the Explorer", action: 'Try again' },
  { name: 'timeout', error: new ApiError(0, { status: 'timeout', message: 'x' }), title: 'This is taking longer than it should', action: 'Try again' },
  { name: 'server error', error: new ApiError(500, { status: 'server_error', message: 'Something unexpected happened.', requestId: 'abc123def456' }), title: 'Something went wrong', action: 'Try again' },
  { name: 'service starting', error: new ApiError(503, { status: 'unavailable', message: 'x' }), title: 'The Explorer is starting', action: 'none' },
  { name: 'busy', error: new ApiError(429, { status: 'rate_limited', message: 'x', retryAfterSeconds: 30 }), title: 'The Explorer is busy', action: 'Try again now' },
  { name: 'too large', error: new ApiError(413, { status: 'too_large', message: 'x', hint: 'y' }), title: 'That request was too large', action: 'Choose an address' },
  { name: 'not found', error: new ApiError(404, { status: 'not_found', message: 'x' }), title: "There's nothing at this link", action: 'Go to the address list' },
  { name: 'upstream failure', error: new ApiError(504, { status: 'upstream_timeout', message: 'x' }), title: "The blockchain service didn't answer", action: 'Try again' },
] as const;

describe('every view says what failed and what to do next', () => {
  for (const { view, hash, call } of VIEWS) {
    test.each(FAILURES)(`${view}: $name`, async ({ error, title, action }) => {
      vi.spyOn(mockApi, call).mockRejectedValue(error);
      start(hash);
      const heading = (await screen.findAllByRole('heading', { name: title }))[0];
      const panel = heading.closest('section')!;
      if (action === 'none') {
        expect(within(panel).queryByRole('button')).not.toBeInTheDocument();
        expect(panel).toHaveTextContent('load by itself');
      } else {
        expect(within(panel).getByRole(action === 'Try again' || action === 'Try again now' ? 'button' : 'link', { name: action })).toBeInTheDocument();
      }
    });
  }

  test('V7 about and help needs no request to be complete: with the service down it shows the built-in limits and says so', async () => {
    mockControls.offline = true;
    start('#/about');
    expect(await screen.findByRole('heading', { level: 1, name: 'About and help' })).toBeInTheDocument();
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.queryByText(/built-in/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('contentinfo')).queryByText(settings.limitationLine)).not.toBeInTheDocument();
  });

  test('a server error names its reference, which can be copied', async () => {
    vi.spyOn(mockApi, 'timeline').mockRejectedValue(FAILURES[2].error);
    start(`#/address/${ex.mainAddress}`);
    expect(await screen.findByText('abc123def456')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy the reference/ })).toBeInTheDocument();
  });

  test('the address lookup shows a failure in the same words, keeps what was typed, and tries again', async () => {
    mockControls.offline = true;
    const user = start('#/');
    const field = await screen.findByLabelText('Bitcoin address');
    await user.type(field, `${ex.mainAddress}{Enter}`);
    const form = screen.getByRole('region', { name: 'Look up an address' });
    expect(await within(form).findByText("Can't reach the Explorer")).toBeInTheDocument();
    expect(field).toHaveValue(ex.mainAddress);
    mockControls.offline = false;
    await user.click(within(form).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: ex.mainAddress })).toBeInTheDocument();
  });

  test('a lookup that failed because the service was starting is repeated when it is ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockControls.starting = true;
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    start('#/');
    const field = await screen.findByLabelText('Bitcoin address');
    await user.type(field, `${ex.mainAddress}{Enter}`);
    expect(await within(screen.getByRole('region', { name: 'Look up an address' })).findByText('The Explorer is starting')).toBeInTheDocument();
    mockControls.starting = false;
    await act(async () => vi.advanceTimersByTime(settings.web.requests.healthPollSeconds * 1000));
    expect(await screen.findByRole('heading', { level: 1, name: ex.mainAddress })).toBeInTheDocument();
  });
});

describe('offline: the browser reports no connection', () => {
  const goOffline = (online: boolean) => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    act(() => void window.dispatchEvent(new Event(online ? 'online' : 'offline')));
  };

  test('a banner appears, and a page that is already loaded stays usable', async () => {
    start(`#/address/${ex.mainAddress}`);
    await screen.findByRole('heading', { name: 'Transactions per day' });
    goOffline(false);
    expect(screen.getByTestId('offline-banner')).toHaveTextContent("You're offline");
    expect(screen.getByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument();
  });

  test('the banner goes when the connection returns, and the service is asked at once', async () => {
    start('#/about');
    await screen.findByText('Connected');
    goOffline(false);
    const asked = vi.spyOn(mockApi, 'health');
    goOffline(true);
    expect(screen.queryByTestId('offline-banner')).not.toBeInTheDocument();
    expect(asked).toHaveBeenCalled();
  });

  test('a page that needs a new answer says the browser is offline, not that the service is down', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mockControls.offline = true;
    start(`#/address/${ex.mainAddress}`);
    expect(await screen.findByText("Can't reach the Explorer")).toBeInTheDocument();
    expect(screen.getByText('Check your connection. This page retries by itself, or press Try again.')).toBeInTheDocument();
    expect(screen.getByTestId('offline-banner')).toHaveTextContent("You're offline. Pages you opened still work; the rest load when you reconnect.");
  });
});

describe('busy: a 429 counts down and tries again by itself', () => {
  test('the wait ticks down, the page loads when it ends, and "Try again now" does not wait', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockControls.busyForSeconds = 3;
    start(`#/address/${ex.mainAddress}`);
    const panel = (await screen.findByTestId('state-rate-limited')) as HTMLElement;
    expect(panel).toHaveTextContent('tries again in 3 seconds');
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(panel).toHaveTextContent('tries again in 2 seconds');

    // The service has calmed down by the time the wait ends. Each second is its own timer, set once the last has been drawn.
    mockControls.busyForSeconds = 0;
    for (let second = 0; second < 2; second++) await act(async () => vi.advanceTimersByTime(1_000));
    expect(await screen.findByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
  });

  test('a screen reader hears the whole wait once, not every second', async () => {
    mockControls.busyForSeconds = 8;
    start('#/models');
    const panel = await screen.findByTestId('state-rate-limited');
    expect(within(panel).getByRole('status')).toHaveTextContent('tries again by itself in 8 seconds');
    expect(panel.querySelector('strong')).toHaveAttribute('aria-hidden', 'true');
  });

  test('"Try again now" asks at once', async () => {
    mockControls.busyForSeconds = 60;
    const user = start('#/models');
    await screen.findByTestId('state-rate-limited');
    mockControls.busyForSeconds = 0;
    await user.click(screen.getByRole('button', { name: 'Try again now' }));
    expect(await screen.findByRole('list', { name: 'The models' })).toBeInTheDocument();
  });

  test('a wait of several minutes is said in minutes', async () => {
    mockControls.busyForSeconds = 540;
    start('#/models');
    expect(await screen.findByTestId('state-rate-limited')).toHaveTextContent('tries again in 9 minutes');
  });
});

describe('slow requests say so, in every place that waits', () => {
  const SLOW_MS = settings.web.requests.timeoutMs / 2 + 100;

  test('the address lookup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    start('#/');
    await user.type(await screen.findByLabelText('Bitcoin address'), ex.mainAddress);
    mockControls.latencyMs = 60_000;
    await user.click(screen.getByRole('button', { name: /Look up/ }));
    expect(screen.queryByText(/Still checking/)).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getByText(/Still checking, this is taking a little longer/)).toBeInTheDocument();
  });

  test('the transaction list while a filter refreshes it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    start(`#/address/${ex.mainAddress}/transactions`);
    await screen.findByRole('table', { name: /Transactions of this address/ });
    mockControls.latencyMs = 60_000;
    await user.click(screen.getByRole('button', { name: 'Unusual' }));
    expect(await screen.findByText(/Updating…/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getByText(/Still working…/)).toBeInTheDocument();
  });

  test('the what-if lab, on its status line and on the result it is replacing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    start(`#/address/${ex.mainAddress}/what-if?direction=out`);
    const field = await screen.findByLabelText('Amount (BTC)');
    await user.type(field, '0.05');
    await screen.findByTestId('verdict-card', undefined, { timeout: 3000 });
    mockControls.latencyMs = 60_000;
    await user.clear(field);
    await user.type(field, '0.0005');
    await act(async () => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getAllByText(/Still working, this is taking longer than usual/).length).toBeGreaterThanOrEqual(2);
  });

  test('the export', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    start(`#/address/${ex.mainAddress}/transactions`);
    await screen.findByRole('table', { name: /Transactions of this address/ });
    await user.click(screen.getByRole('button', { name: 'Export' }));
    mockControls.latencyMs = 60_000;
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    await act(async () => vi.advanceTimersByTime(SLOW_MS));
    expect(screen.getByRole('button', { name: 'Still exporting…' })).toBeDisabled();
  });
});

describe('the time limit', () => {
  test('a request slower than the limit in settings ends as a timeout, as it does through Axios, and offers another try', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockControls.latencyMs = settings.web.requests.timeoutMs + 1;
    start('#/models');
    expect(await screen.findByText(/Loading the models/)).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(settings.web.requests.timeoutMs + 100));
    expect(await screen.findByRole('heading', { name: 'This is taking longer than it should' })).toBeInTheDocument();
    mockControls.latencyMs = 0;
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('list', { name: 'The models' })).toBeInTheDocument());
  });
});
