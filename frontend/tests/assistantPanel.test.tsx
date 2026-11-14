// S-05: the Assistant's panel in V3 and V4, through the real UI on the mock (which replays the real service's recorded E12 answers).
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { CONFIG, EXPLANATIONS_RECORDED } from '../src/api/mock/fixtures';
import { mockApi } from '../src/api/mock/mockApi';
import { ApiError, type ExplanationResponse } from '../src/api/types';
import { settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const LATE = { timeout: 3000 };
const TEMPLATE = /Template: fixed sentences filled in from the numbers/;
const WRITTEN = /Written by the Explorer Assistant, a language model the team trained; checked by code before being shown/;
const NOT_INSTALLED = /model file \(610 MB\) is not installed; the README says how to add it\. Explanations use the template\./;
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
  test('is asked of E12 at once where the Assistant cannot run, and shows the prepared answer with the Assistant label', async () => {
    open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    expect(await within(why).findByText(WRITTEN, undefined, LATE)).toBeInTheDocument();
    expect(within(why).queryByText(TEMPLATE)).not.toBeInTheDocument();
    expect(within(why).queryByRole('button', { name: /Ask the Assistant/ })).not.toBeInTheDocument();
    expect(within(why).getAllByRole('listitem').length).toBeGreaterThan(1);
  });

  test('where the Assistant can run, waits for the button, shows the progress line, and "Keep the template" cancels', async () => {
    assistantInstalled();
    const explain = vi.spyOn(mockApi, 'explain').mockImplementation(
      (_body, opts) => new Promise((_resolve, reject) => opts?.signal?.addEventListener('abort', () => reject(new ApiError(0, { status: 'cancelled', message: 'x' })))),
    );
    const user = open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    const ask = await within(why).findByRole('button', { name: 'Ask the Assistant to write this' });
    expect(within(why).getByText(TEMPLATE)).toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
    await user.click(ask);
    expect(within(why).getByText('Writing; this takes about 10 seconds on this computer')).toBeInTheDocument();
    await user.click(within(why).getByRole('button', { name: 'Keep the template' }));
    expect(within(why).getByText(TEMPLATE)).toBeInTheDocument();
    expect(within(why).getByRole('button', { name: 'Ask the Assistant to write this' })).toBeInTheDocument();
    expect(within(why).queryByText(/Writing;/)).not.toBeInTheDocument();
  });

  test('a template answer names the failed checks in plain words and keeps the template', async () => {
    assistantInstalled();
    vi.spyOn(mockApi, 'explain').mockResolvedValue({ ...template(), attempts: [{ source: 'text150m', failedChecks: ['numbers_ok', 'direction_ok'] }] });
    const user = open(detailHash(ex.flagged));
    await user.click(await screen.findByRole('button', { name: 'Ask the Assistant to write this' }, LATE));
    const why = screen.getByTestId('flag-explanation');
    expect(await within(why).findByText(/a number that was not in the facts, a comparison pointing the wrong way, so it was not shown/)).toBeInTheDocument();
    expect(within(why).getByText(TEMPLATE)).toBeInTheDocument();
  });

  test('a busy service (429) shows the countdown state, and "Keep the template" leaves it', async () => {
    assistantInstalled();
    vi.spyOn(mockApi, 'explain').mockRejectedValue(new ApiError(429, { status: 'rate_limited', message: 'busy', retryAfterSeconds: 30 }));
    const user = open(detailHash(ex.flagged));
    await user.click(await screen.findByRole('button', { name: 'Ask the Assistant to write this' }, LATE));
    expect(await screen.findByTestId('state-rate-limited')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep the template' }));
    expect(screen.queryByTestId('state-rate-limited')).not.toBeInTheDocument();
  });
});

describe('elsewhere', () => {
  test('a transaction that is not flagged shows the template and the not-installed note, and is not asked of E12', async () => {
    const explain = vi.spyOn(mockApi, 'explain');
    open(detailHash(ex.scored));
    const card = (await screen.findByRole('heading', { name: 'In words' }, LATE)).closest('section')!;
    expect(await within(card).findByText(TEMPLATE)).toBeInTheDocument();
    expect(await within(card).findByText(NOT_INSTALLED)).toBeInTheDocument();
    expect(within(card).queryByRole('button')).not.toBeInTheDocument();
    expect(explain).not.toHaveBeenCalled();
  });

  test('a what-if is asked of E12 with the form values once the button is pressed, and the template answer says why', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    assistantInstalled();
    const explain = vi.spyOn(mockApi, 'explain');
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Amount (BTC)'), '0.05');
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), '2026-10-20');
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    await user.click(await within(why).findByRole('button', { name: 'Ask the Assistant to write this' }));
    await waitFor(() => expect(explain).toHaveBeenCalledWith({ address: ex.mainAddress, whatIf: { amountBtc: '0.05000000', direction: 'out', time: '2026-10-20T12:00:00Z' } }, expect.anything()));
    expect(await within(why).findByText(NOT_INSTALLED)).toBeInTheDocument();
  });
});
