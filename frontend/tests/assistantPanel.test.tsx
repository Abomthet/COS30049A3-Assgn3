// S-05: the Assistant's panel in V3 and V4, through the real UI on the mock (which replays the real service's recorded E12 answers).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { CONFIG, EXPLANATIONS_RECORDED } from '../src/api/mock/fixtures';
import { mockApi } from '../src/api/mock/mockApi';
import { ApiError, type ExplanationResponse } from '../src/api/types';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const LATE = { timeout: 3000 };
const WRITTEN = 'Written by the Assistant. Checked by code before it is shown.';
const NOT_INSTALLED = "The Assistant isn't installed on this computer.";
const FAILED = "The Assistant's answer did not pass our checks, so this explanation stays.";
const lines = (el: HTMLElement) => within(el).queryByTestId('reason-lines');
const detailHash = (r: { address: string; date: string; txid: string }) => `#/address/${r.address}/day/${r.date}/tx/${r.txid}`;

afterEach(() => {
  vi.restoreAllMocks();
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

function open(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

/** E2 as the service answers it where the Assistant's weights are installed. */
function assistantInstalled() {
  vi.spyOn(mockApi, 'config').mockResolvedValue({ ...CONFIG, capabilities: { ...CONFIG.capabilities, assistant: true } });
}

const template = (): ExplanationResponse => ({ ...EXPLANATIONS_RECORDED.results[0].body, source: 'template', cached: false, attempts: [], skippedWriters: {} });

describe('a flagged snapshot transaction', () => {
  test('asks E12 for nothing until the button is pressed: where the Assistant cannot run but an answer is prepared, the reason lines and the button show', async () => {
    const explain = vi.spyOn(mockApi, 'explain');
    open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    const ask = await within(why).findByRole('button', { name: 'Ask the Assistant to explain' }, LATE);
    expect(ask).toBeInTheDocument();
    expect(lines(why)).toBeInTheDocument();
    expect(within(why).queryByText(NOT_INSTALLED)).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 200));
    expect(explain).not.toHaveBeenCalled();
    expect(within(why).queryByText(WRITTEN)).not.toBeInTheDocument();
  });

  test('pressing the button brings the prepared answer at once, under the Assistant tag, in place of the reason lines', async () => {
    const explain = vi.spyOn(mockApi, 'explain');
    const user = open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    await user.click(await within(why).findByRole('button', { name: 'Ask the Assistant to explain' }, LATE));
    expect(await within(why).findByText(WRITTEN, undefined, LATE)).toBeInTheDocument();
    expect(explain).toHaveBeenCalledTimes(1);
    expect(lines(why)).not.toBeInTheDocument();
    expect(within(why).queryByRole('button', { name: /Ask the Assistant/ })).not.toBeInTheDocument();
    expect(within(why).getByTestId('flag-figure')).toBeInTheDocument();
    expect(within(why).getAllByText(LIMITATION_LINE)).toHaveLength(1);
    expect(within(why).getAllByRole('listitem').length).toBeGreaterThan(1);
  });

  test('where the Assistant can run, waits for the button, shows the progress line, and "Cancel" returns to the reason lines', async () => {
    assistantInstalled();
    const explain = vi.spyOn(mockApi, 'explain').mockImplementation(
      (_body, opts) => new Promise((_resolve, reject) => opts?.signal?.addEventListener('abort', () => reject(new ApiError(0, { status: 'cancelled', message: 'x' })))),
    );
    const user = open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    const ask = await within(why).findByRole('button', { name: 'Ask the Assistant to explain' });
    expect(lines(why)).toBeInTheDocument();
    expect(within(why).queryByText(WRITTEN)).not.toBeInTheDocument();
    expect(within(why).queryByText(/Template/)).not.toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
    await user.click(ask);
    expect(within(why).getByText('Writing… about 10 seconds')).toBeInTheDocument();
    expect(lines(why)).toBeInTheDocument();
    await user.click(within(why).getByRole('button', { name: 'Cancel' }));
    expect(lines(why)).toBeInTheDocument();
    expect(within(why).getByRole('button', { name: 'Ask the Assistant to explain' })).toBeInTheDocument();
    expect(within(why).queryByText(/Writing…/)).not.toBeInTheDocument();
  });

  test('an answer that failed the checks says so in one line, keeps the reason lines and does not list the checks', async () => {
    assistantInstalled();
    vi.spyOn(mockApi, 'explain').mockResolvedValue({ ...template(), attempts: [{ source: 'text150m', failedChecks: ['numbers_ok', 'direction_ok'] }] });
    const user = open(detailHash(ex.flagged));
    await user.click(await screen.findByRole('button', { name: 'Ask the Assistant to explain' }, LATE));
    const why = screen.getByTestId('flag-explanation');
    expect(await within(why).findByText(FAILED)).toBeInTheDocument();
    expect(why).not.toHaveTextContent(/numbers_ok|direction_ok|not in the facts|pointing the wrong way/);
    expect(lines(why)).toBeInTheDocument();
  });

  test('a busy service (429) shows the countdown state, and "Cancel" leaves it', async () => {
    assistantInstalled();
    vi.spyOn(mockApi, 'explain').mockRejectedValue(new ApiError(429, { status: 'rate_limited', message: 'busy', retryAfterSeconds: 30 }));
    const user = open(detailHash(ex.flagged));
    await user.click(await screen.findByRole('button', { name: 'Ask the Assistant to explain' }, LATE));
    expect(await screen.findByTestId('state-rate-limited')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('state-rate-limited')).not.toBeInTheDocument();
  });
});

describe('elsewhere', () => {
  test('a transaction that is not flagged keeps its reasons in a closed Details disclosure with the not-installed line, and is not asked of E12', async () => {
    const explain = vi.spyOn(mockApi, 'explain');
    open(detailHash(ex.scored));
    const details = (await screen.findByTestId('not-flagged-details', undefined, LATE)) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Details', { selector: 'summary' })).toBeInTheDocument();
    expect(within(details).getByRole('heading', { name: 'Closest to the flag line' })).toBeInTheDocument();
    expect(await within(details).findByText(NOT_INSTALLED)).toBeInTheDocument();
    expect(within(details).queryByRole('button')).not.toBeInTheDocument();
    expect(lines(details)).toBeInTheDocument();
    expect(screen.queryByText('In words')).not.toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
  });

  test('a what-if is asked of E12 with the form values once the button is pressed, and the reason the writer was skipped is shown as the service sends it', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    assistantInstalled();
    const explain = vi.spyOn(mockApi, 'explain');
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Amount (BTC)'), '0.05');
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), '2026-10-20');
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    await user.click(await within(why).findByRole('button', { name: 'Ask the Assistant to explain' }));
    await waitFor(() => expect(explain).toHaveBeenCalledWith({ address: ex.mainAddress, whatIf: { amountBtc: '0.05000000', direction: 'out', time: '2026-10-20T12:00:00Z' } }, expect.anything()));
    expect(await within(why).findByText(/model file \(610 MB\) is not installed/)).toBeInTheDocument();
  });
});
