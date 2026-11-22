// The live lookup (S-09, V8): the offer on V1's unsupported panel, the dialog with its progress (stream, then polling when the
// stream fails), Cancel, the failures, the overview marked as live data, and "Forget this address". The mock plays the job.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const OUTSIDE = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

async function askFor(address = OUTSIDE) {
  window.location.hash = '#/';
  const user = userEvent.setup();
  render(<App />);
  await user.type(await screen.findByLabelText('Bitcoin address'), address);
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  return user;
}

describe('the offer', () => {
  test('is absent while live lookup is off, and the panel is as before', async () => {
    await askFor();
    const panel = await screen.findByTestId('state-unsupported');
    expect(within(panel).queryByRole('button', { name: /Fetch its public history/ })).not.toBeInTheDocument();
  });

  test('is a button on the unsupported panel when it is on; the privacy sentence waits for the dialog', async () => {
    mockControls.liveLookup = true;
    await askFor();
    const panel = await screen.findByTestId('state-unsupported');
    expect(within(panel).getByRole('button', { name: 'Fetch its public history' })).toBeInTheDocument();
    expect(panel).not.toHaveTextContent('Only the address is sent');
  });
});

describe('the dialog', () => {
  test('shows the counts as pages arrive from the stream, then opens the overview marked as live data', async () => {
    mockControls.liveLookup = true;
    mockControls.liveStepMs = 5;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAccessibleName('Fetching public history');
    expect(dialog).toHaveTextContent('Only the address is sent. The result stays on this computer.');
    expect(within(dialog).getByText(OUTSIDE)).toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByTestId('live-progress')).toHaveTextContent(/^\d+ of 377 transactions$/));
    expect(within(dialog).getByTestId('live-progress')).toHaveAttribute('data-updates', 'stream');

    const banner = await screen.findByTestId('live-banner', undefined, { timeout: 4000 });
    expect(window.location.hash).toBe(`#/address/${OUTSIDE}`);
    expect(banner).toHaveTextContent(/Live data, fetched \d+ \w+ \d{4} \d\d:\d\d UTC, the most recent 377 transactions/);
    expect(banner).toHaveTextContent('1,157 transactions in all');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Source: .* live data/)).toBeInTheDocument();
    expect(screen.queryByText(/snapshot of \d+ \w+ \d{4} · days in UTC/)).not.toBeInTheDocument();
    // The header strip says where this address's data came from, not the snapshot's date.
    expect(screen.getByTestId('header-meta')).toHaveTextContent(/^Live data · .+$/);
    expect(screen.getByTestId('header-meta')).not.toHaveTextContent('Snapshot of');
    expect(screen.getByText('Fetched 377 transactions.')).toBeInTheDocument();
  });

  test('falls back to polling every two seconds when the stream fails, and still finishes', async () => {
    mockControls.liveLookup = true;
    mockControls.liveStepMs = 5;
    mockControls.liveStreamBroken = true;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByTestId('live-progress')).toHaveAttribute('data-updates', 'polling'));
    await screen.findByTestId('live-banner', undefined, { timeout: 8000 });
  }, 15000);

  test('Cancel stops the lookup and leaves the address unfetched', async () => {
    mockControls.liveLookup = true;
    mockControls.liveStepMs = 200;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByTestId('live-progress')).toHaveTextContent(/\d+ of \d+ transactions|Scoring/));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(window.location.hash).toBe('#/');
    await expect(mockApi.lookup(OUTSIDE)).rejects.toMatchObject({ status: 404 });
  });

  test('Escape cancels it too', async () => {
    mockControls.liveLookup = true;
    mockControls.liveStepMs = 200;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  test('a lookup that fails part way says so, with Try again and the way back', async () => {
    mockControls.liveLookup = true;
    mockControls.liveStepMs = 5;
    mockControls.liveFailAfterPages = 2;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText("The blockchain service didn't answer")).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('a service that answers 502 at the start shows the same state', async () => {
    mockControls.liveLookup = true;
    mockControls.liveFailAfterPages = -1;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    expect(await screen.findByText("The blockchain service didn't answer")).toBeInTheDocument();
  });
});

describe('a fetched address', () => {
  async function fetched() {
    mockControls.liveLookup = true;
    mockControls.liveStepMs = 1;
    const user = await askFor();
    await user.click(await screen.findByRole('button', { name: 'Fetch its public history' }));
    await screen.findByTestId('live-banner', undefined, { timeout: 6000 });
    return user;
  }

  test('is listed on V1 as live data, and opens like any address (the what-if tab included)', async () => {
    await fetched();
    expect(screen.getByRole('link', { name: 'Transactions' })).toBeInTheDocument();
    window.location.hash = '#/';
    await waitFor(() => {
      const row = screen.getAllByRole('link', { name: new RegExp(`full address ${OUTSIDE}`) }).map((link) => link.closest('tr')).find((tr) => tr !== null);
      expect(row).toHaveTextContent('live data');
    });
    window.location.hash = `#/address/${OUTSIDE}/what-if`;
    expect(await screen.findByRole('link', { name: 'What-if', current: 'page' })).toBeInTheDocument();
    expect(screen.getByTestId('live-banner')).toBeInTheDocument();
  });

  test('"Forget this address" removes it and returns to V1', async () => {
    const user = await fetched();
    await user.click(screen.getByRole('button', { name: 'Forget this address' }));
    await waitFor(() => expect(window.location.hash).toBe('#/'));
    expect(await screen.findByText(/Forgot 1A1zP1/)).toBeInTheDocument();
    await expect(mockApi.lookup(OUTSIDE)).rejects.toMatchObject({ status: 404 });
  });

  test('looking it up again answers at once from the cache', async () => {
    await fetched();
    window.location.hash = '#/';
    const lookup = await mockApi.startLiveLookup(OUTSIDE);
    expect(lookup).toMatchObject({ status: 'done', cached: true });
  });
});
