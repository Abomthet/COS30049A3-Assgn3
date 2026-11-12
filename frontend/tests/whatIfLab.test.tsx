// V4, the what-if lab, through the real UI on the mock (which replays the real service's recorded what-ifs).
// J4 first: open the lab from the running example, type 0.05 BTC sent at 2026-10-20 12:00 UTC and read a flag.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { WHAT_IF_RECORDED } from '../src/api/mock/fixtures';
import { mockApi } from '../src/api/mock/mockApi';
import type { WhatIfCurve } from '../src/api/types';
import { amountText } from '../src/lib/whatIf';
import { LIMITATION_LINE, settings } from '../src/lib/settings';
import { fakePlotly } from './plotlyFake';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const LATE = { timeout: 3000 };
/** The recorded E9 answer for sent amounts at the lab's default time. */
const recordedCurve = WHAT_IF_RECORDED.curves[0].body as WhatIfCurve;

afterEach(() => {
  // The same check as the journeys: no banned word on whatever the test left on screen.
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

function openLab(direction: 'in' | 'out' | '' = 'out') {
  window.location.hash = `#/address/${ex.mainAddress}/what-if${direction ? `?direction=${direction}` : ''}`;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const amountField = () => screen.findByLabelText('Amount (BTC)');
const dateField = () => screen.getByLabelText('Date');
const clockField = () => screen.getByLabelText('Time of day');
/** What chart G5 was last given (the lab also draws G3, which is another chart on the page). */
const curveDraw = () => [...fakePlotly.chartDraws()].reverse().find((d) => d.layout.xaxis?.type === 'log')!;
const verdict = () => screen.findByTestId('verdict-card', undefined, LATE);

async function typeAmount(user: ReturnType<typeof userEvent.setup>, text: string) {
  const field = await amountField();
  await user.clear(field);
  await user.type(field, text);
}

function setTime(date: string, clock = '12:00') {
  fireEvent.change(dateField(), { target: { value: date } });
  fireEvent.change(clockField(), { target: { value: clock } });
}

describe('J4: the running example', () => {
  test('0.05 BTC sent at 2026-10-20 12:00 UTC is flagged by the baseline with score 5.98, with the reason and the limitation line', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    setTime('2026-10-20');
    const card = await verdict();
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(/^Flagged by Robust z baseline/);
    expect(card).toHaveTextContent('Score 5.98 against a flag line of 5.00');
    const why = within(card).getByTestId('flag-explanation');
    expect(within(why).getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(within(why).getByTestId('limitation-line')).toHaveTextContent(LIMITATION_LINE);
    // The request that gave this answer was the typed one.
    expect(await mockApi.whatIf(ex.mainAddress, { amountBtc: '0.05', direction: 'out', time: '2026-10-20T12:00:00Z' })).toMatchObject({ flagged: true });
  });

  test('every method that can score is listed with its flag line, and TxGPT says it is not available for a hypothetical transaction', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    await verdict();
    const table = await screen.findByRole('table', { name: /each method for this hypothetical transaction/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    const txgpt = within(table).getByRole('rowheader', { name: /TxGPT surprisal/ }).closest('tr')!;
    expect(txgpt).toHaveTextContent('Not available for a hypothetical transaction');
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('Deciding method');
    await waitFor(() => expect(within(rows[0]).getAllByRole('cell')[2]).toHaveTextContent('5.00'));
  });

  test('the amount and the gap are described under their fields once the answer is in', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    await verdict();
    expect(await screen.findByText(/0\.05 BTC is about 95 times this address's usual sent amount/)).toBeInTheDocument();
    expect(screen.getByText(/after this address's previous transaction/)).toBeInTheDocument();
  });

  test('changing the amount changes the verdict, and the curve gets the marker where the answer is', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    expect(await verdict()).toHaveTextContent('Flagged by');
    await typeAmount(user, '0.0005');
    await waitFor(() => expect(screen.getByTestId('verdict-card')).toHaveTextContent('Not flagged'), LATE);
    await waitFor(() => {
      const marker = (curveDraw().data as any[]).find((t) => t.name === 'Amount in the form');
      expect(marker.x).toEqual([0.0005]);
      expect(marker.marker.symbol).toBe('diamond-open');
    }, LATE);
  });

  test('the sentence under the curve is read from it', async () => {
    openLab();
    const reading = await screen.findByTestId('curve-reading', undefined, LATE);
    expect(reading).toHaveTextContent(/^On this address, a sent amount would be flagged from about 0\.\d+ BTC upwards, and below about 0\.0000\d+ BTC\.$/);
  });
});

describe('the form', () => {
  test('three invalid amounts are each refused in the browser with the server\'s words, and none is sent', async () => {
    const send = vi.spyOn(mockApi, 'whatIf');
    const user = openLab();
    const field = await amountField();
    for (const [text, message] of [
      ['0', 'Must be greater than 0.'],
      ['abc', 'Enter an amount in BTC, such as 0.05.'],
      ['0.123456789', 'Use at most 8 decimal places.'],
      ['1,000.5', 'Write the amount without thousands separators, such as 1250.5.'],
    ]) {
      await user.clear(field);
      await user.type(field, text);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveAccessibleDescription(expect.stringContaining(message));
      expect(field).toHaveValue(text);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(send).not.toHaveBeenCalled();
  });

  test('a time before the first transaction, or too far ahead, is refused with its message', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    setTime('2024-05-01');
    expect(await screen.findByRole('alert')).toHaveTextContent("Must not be before this address's first transaction (16 May 2024, 05:16 UTC).");
    setTime('2040-01-01');
    expect(await screen.findByRole('alert')).toHaveTextContent("At most 5 years after this address's last transaction.");
  });

  test('"Score it" on an invalid form puts the focus on the field and keeps what was typed', async () => {
    const user = openLab();
    const field = await amountField();
    await user.type(field, 'abc');
    await user.click(screen.getByRole('button', { name: 'Score it' }));
    expect(field).toHaveFocus();
    expect(field).toHaveValue('abc');
  });

  test('direction is a two-way switch that starts as the link says and changes the curve and the verdict', async () => {
    const user = openLab('in');
    await amountField();
    expect(screen.getByRole('radio', { name: 'Received' })).toBeChecked();
    await typeAmount(user, '0.0005');
    await verdict();
    expect(await screen.findByTestId('curve-reading', undefined, LATE)).toHaveTextContent(/a received amount/);
    await user.click(screen.getByRole('radio', { name: 'Sent' }));
    await waitFor(() => expect(screen.getByTestId('curve-reading')).toHaveTextContent(/a sent amount/), LATE);
  });

  test('the amount chips set the usual amount and its multiples, and the slider moves along the curve', async () => {
    const user = openLab();
    const usual = recordedCurve.usualBtc!;
    await user.click(await screen.findByRole('button', { name: '10 × usual' }, LATE));
    expect(await amountField()).toHaveValue(amountText(usual * 10));
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '0' } });
    expect(await amountField()).toHaveValue(amountText(Number(recordedCurve.amountsBtc[0].toPrecision(3))));
  });

  test('the time chips jump to quiet days after the last transaction', async () => {
    const user = openLab();
    await amountField();
    await user.click(screen.getByRole('button', { name: 'After 30 quiet days' }));
    expect(dateField()).toHaveValue('2026-11-18');
    await user.click(screen.getByRole('button', { name: 'The day after its last transaction' }));
    expect(dateField()).toHaveValue('2026-10-20');
  });

  test('selecting a point of the curve puts its amount in the form', async () => {
    openLab();
    await screen.findByTestId('curve-reading', undefined, LATE);
    await waitFor(() => expect(fakePlotly.handlers.has('plotly_click')).toBe(true));
    const amounts = recordedCurve.amountsBtc;
    act(() => fakePlotly.emit('plotly_click', { points: [{ curveNumber: 0, pointNumber: 7 }] }));
    await waitFor(() => expect(screen.getByLabelText('Amount (BTC)')).toHaveValue(amountText(amounts[7])));
  });
});

describe('real time (R1)', () => {
  test('typing is answered once, after the quiet time: the older request is cancelled and the previous answer stays, dimmed and marked', async () => {
    const signals: AbortSignal[] = [];
    const real = mockApi.whatIf;
    vi.spyOn(mockApi, 'whatIf').mockImplementation((address, body, opts) => {
      signals.push(opts!.signal!);
      return real(address, body, opts);
    });
    const user = openLab();
    await typeAmount(user, '0.05');
    await verdict();
    const first = signals.length;

    // Two values in quick succession: one request, for the last of them.
    const field = await amountField();
    await user.clear(field);
    await user.type(field, '12');
    expect(screen.getByText('Updating…', { selector: '.whatif-status' })).toBeInTheDocument();
    expect(screen.getByTestId('verdict-card')).toHaveTextContent('Flagged by');
    expect(screen.getByTestId('verdict-card').closest('.whatif-result')).toHaveClass('is-updating');
    await waitFor(() => expect(signals.length).toBe(first + 1), LATE);
    // Nothing more is sent afterwards.
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(signals).toHaveLength(first + 1);
  });

  test('a request still in flight is cancelled when a newer one is made', async () => {
    const signals: AbortSignal[] = [];
    vi.spyOn(mockApi, 'whatIf').mockImplementation((_address, _body, opts) => {
      signals.push(opts!.signal!);
      return new Promise(() => {});
    });
    const user = openLab();
    await typeAmount(user, '0.05');
    await waitFor(() => expect(signals).toHaveLength(1), LATE);
    await typeAmount(user, '0.5');
    await waitFor(() => expect(signals).toHaveLength(2), LATE);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
  });

  test('when the answer has arrived the result is no longer dimmed', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    const card = await verdict();
    await waitFor(() => expect(card.closest('.whatif-result')).not.toHaveClass('is-updating'), LATE);
    expect(screen.getByText('The verdict below is for these values.')).toBeInTheDocument();
  });

  test('a network failure keeps every value in the form and offers another try', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    await verdict();
    vi.spyOn(mockApi, 'whatIf').mockRejectedValue(new (await import('../src/api/types')).ApiError(0, { status: 'network', message: 'The explorer service did not respond.' }));
    await typeAmount(user, '0.5');
    expect(await screen.findByText("Couldn't reach the explorer service", undefined, LATE)).toBeInTheDocument();
    expect(await amountField()).toHaveValue('0.5');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // The old answer is gone: it would no longer describe the form.
    expect(screen.queryByTestId('verdict-card')).not.toBeInTheDocument();
  });
});

describe('states', () => {
  test('before an amount is typed the lab says what to do, and the curve is already drawn', async () => {
    openLab();
    expect(await screen.findByTestId('state-whatif-empty')).toHaveTextContent('Enter an amount to score it');
    expect(await screen.findByTestId('curve-reading', undefined, LATE)).toBeInTheDocument();
  });

  test('422: says how much history there was and what scoring needs, and one button sets the first date that works', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    setTime('2024-06-01', '00:00');
    const panel = await screen.findByTestId('state-insufficient', undefined, LATE);
    expect(panel).toHaveTextContent(/At that time this address had 2 earlier transactions, over 15 days; scoring needs 10 over 14 days\./);
    expect(screen.queryByTestId('verdict-card')).not.toBeInTheDocument();
    const send = vi.spyOn(mockApi, 'whatIf');
    await user.click(within(panel).getByRole('button', { name: 'Use the first date that works (11 Jul 2024)' }));
    expect(dateField()).toHaveValue('2024-07-11');
    expect(await amountField()).toHaveValue('0.05');
    await waitFor(() => expect(send).toHaveBeenCalledWith(ex.mainAddress, { amountBtc: '0.05', direction: 'out', time: '2024-07-11T00:00:00Z' }, expect.anything()), LATE);
  });

  test('a 400 on direction from the default curve is followed by a range around the typed amount, and the screen says so', async () => {
    const curve = vi.spyOn(mockApi, 'whatIfCurve');
    const user = openLab();
    await typeAmount(user, '0.001');
    setTime('2024-07-11');
    expect(await screen.findByText(/has not sent anything before this time/, undefined, LATE)).toBeInTheDocument();
    expect(curve).toHaveBeenCalledWith(ex.mainAddress, expect.objectContaining({ minBtc: 0.00001, maxBtc: 1, points: 41 }), expect.anything());
    expect(await verdict()).toHaveTextContent(/Not flagged|Flagged by/);
    await waitFor(() => expect((curveDraw().data as any[])[0].x[0]).toBe(0.00001), LATE);
  });
});

describe('V2 links to the lab', () => {
  test('the address page has a What-if tab, and a flagged transaction offers "Try a what-if from here" with its direction', async () => {
    window.location.hash = `#/address/${ex.mainAddress}`;
    render(<App />);
    const tab = await screen.findByRole('link', { name: 'What-if' });
    expect(tab).toHaveAttribute('href', `#/address/${ex.mainAddress}/what-if`);
  });

  test('V3 links to the lab with the transaction\'s direction', async () => {
    window.location.hash = `#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}`;
    render(<App />);
    const link = await screen.findByRole('link', { name: 'Try a what-if from here' });
    expect(link.getAttribute('href')).toMatch(new RegExp(`^#/address/${ex.mainAddress}/what-if\\?direction=(in|out)$`));
  });
});
