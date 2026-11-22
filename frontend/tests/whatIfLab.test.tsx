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
const statusLine = () => document.querySelector('.whatif-status') as HTMLElement;

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
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(/^Would be flagged/);
    expect(within(card).getByTestId('verdict-score')).toHaveTextContent('Score 5.98 flag line 5.00');
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
    const table = await screen.findByRole('table', { name: /each model for this hypothetical transaction/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    const txgpt = within(table).getByRole('rowheader', { name: /TxGPT/ }).closest('tr')!;
    expect(txgpt).toHaveTextContent('Not available for a hypothetical transaction');
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('Deciding');
    await waitFor(() => expect(within(rows[0]).getAllByRole('cell')[2]).toHaveTextContent('5.00'));
  });

  test('the amount and the gap are described under their fields once the answer is in', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    await verdict();
    expect(await screen.findByTestId('amount-figure')).toHaveTextContent('95× usual its usual sent amount');
    expect(screen.getByTestId('gap-figure')).toHaveTextContent(/^\d+(\.\d+)? (min|hours?|days) since its last transaction$/);
  });

  test('the ratio figure follows the Direction field: received for Received, sent for Sent', async () => {
    const user = openLab('in');
    await typeAmount(user, '0.0005');
    await verdict();
    expect(await screen.findByTestId('amount-figure')).toHaveTextContent(/^\d+(\.\d+)?× usual its usual received amount$/);
    expect(screen.getByTestId('gap-figure')).toHaveTextContent(/since its last transaction$/);
    await user.click(screen.getByRole('radio', { name: 'Sent' }));
    await waitFor(() => expect(screen.getByTestId('amount-figure')).toHaveTextContent(/^\d+(\.\d+)?× usual its usual sent amount$/), LATE);
  });

  test('changing the amount changes the verdict, and the curve gets the marker where the answer is', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    expect(within(await verdict()).getByRole('heading', { level: 2 })).toHaveTextContent('Would be flagged');
    await typeAmount(user, '0.0005');
    await waitFor(() => expect(within(screen.getByTestId('verdict-card')).getByRole('heading', { level: 2 })).toHaveTextContent('Would not be flagged'), LATE);
    await waitFor(() => {
      const marker = (curveDraw().data as any[]).find((t) => t.name === 'Amount in the form');
      expect(marker.x).toEqual([0.0005]);
      expect(marker.marker.symbol).toBe('diamond-open');
    }, LATE);
  });

  test('the sentence under the curve is read from it', async () => {
    openLab();
    const reading = await screen.findByTestId('curve-reading', undefined, LATE);
    expect(reading).toHaveTextContent(/^Flagged from 0\.\d+ BTC and below 0\.0000\d+ BTC$/);
  });
});

describe('the form', () => {
  test('three invalid amounts are each refused in the browser with the server\'s words, and none is sent', async () => {
    const send = vi.spyOn(mockApi, 'whatIf');
    const user = openLab();
    const field = await amountField();
    for (const [text, message] of [
      ['0', 'Enter more than 0 BTC.'],
      ['abc', 'Enter an amount in BTC, such as 0.05.'],
      ['0.123456789', 'Use at most 8 decimal places.'],
      ['1,000.5', 'Leave out thousands separators: 1250.5.'],
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a time after its first transaction (16 May 2024, 05:16 UTC).');
    setTime('2040-01-01');
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a time within 5 years of its last transaction.');
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
    // The reading under the curve is a big number now; the direction is in the chart's accessible name and its table line.
    expect(await screen.findByRole('group', { name: /score for received amounts from/ }, LATE)).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Sent' }));
    await waitFor(() => expect(screen.getByRole('group', { name: /score for sent amounts from/ })).toBeInTheDocument(), LATE);
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
    await user.click(screen.getByRole('button', { name: '30 days later' }));
    expect(dateField()).toHaveValue('2026-11-18');
    await user.click(screen.getByRole('button', { name: '1 day later' }));
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
    expect(within(screen.getByTestId('verdict-card')).getByRole('heading', { level: 2 })).toHaveTextContent('Would be flagged');
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
    expect(statusLine()).toHaveTextContent(/^$/);
  });

  test('a network failure keeps every value in the form and offers another try', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    await verdict();
    vi.spyOn(mockApi, 'whatIf').mockRejectedValue(new (await import('../src/api/types')).ApiError(0, { status: 'network', message: "Can't reach the Explorer." }));
    await typeAmount(user, '0.5');
    expect(await screen.findByText("Can't reach the Explorer", undefined, LATE)).toBeInTheDocument();
    expect(await amountField()).toHaveValue('0.5');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // The old answer is gone: it would no longer describe the form.
    expect(screen.queryByTestId('verdict-card')).not.toBeInTheDocument();
  });
});

describe('states', () => {
  test('before an amount is typed the lab says what to do, and the curve is already drawn', async () => {
    openLab();
    expect(await screen.findByTestId('state-whatif-empty')).toHaveTextContent('Enter an amount to see the verdict');
    expect(await screen.findByTestId('curve-reading', undefined, LATE)).toBeInTheDocument();
  });

  test('422: says how much history there was and what scoring needs, and one button sets the first date that works', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    setTime('2024-06-01', '00:00');
    const panel = await screen.findByTestId('state-insufficient', undefined, LATE);
    expect(within(panel).getByTestId('insufficient-lead')).toHaveTextContent('2 earlier transactions over 15 days');
    expect(panel).toHaveTextContent('Scoring needs 10 transactions over 14 days.');
    expect(within(panel).getByRole('heading', { level: 2 })).toHaveTextContent('Too little history at that time');
    expect(screen.queryByTestId('verdict-card')).not.toBeInTheDocument();
    const send = vi.spyOn(mockApi, 'whatIf');
    await user.click(within(panel).getByRole('button', { name: 'Use 11 Jul 2024, the first that works' }));
    expect(dateField()).toHaveValue('2024-07-11');
    expect(await amountField()).toHaveValue('0.05');
    await waitFor(() => expect(send).toHaveBeenCalledWith(ex.mainAddress, { amountBtc: '0.05', direction: 'out', time: '2024-07-11T00:00:00Z' }, expect.anything()), LATE);
  });

  test('a 400 on direction from the default curve is followed by a range around the typed amount, and the screen says so', async () => {
    const curve = vi.spyOn(mockApi, 'whatIfCurve');
    const user = openLab();
    await typeAmount(user, '0.001');
    setTime('2024-07-11');
    expect(await screen.findByText('No usual amount yet, so the curve is centred on your amount.', undefined, LATE)).toBeInTheDocument();
    expect(curve).toHaveBeenCalledWith(ex.mainAddress, expect.objectContaining({ minBtc: 0.00001, maxBtc: 1, points: 41 }), expect.anything());
    expect(await verdict()).toHaveTextContent(/Would (not )?be flagged/);
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

describe('the wording pass (R6)', () => {
  const POSITION = /\b(above|below|on the (left|right)|to the (left|right))\b/i;
  /** The visible text of the lab's own parts (intro, form, verdict or state panel, scenarios), less the not-flagged line, which compares a score with the flag line ("below the flag line of 5.00"). The charts and their "How to read" help are not the lab's wording. */
  const labText = () =>
    [...document.querySelectorAll('.whatif-note, .whatif-form, .whatif-result > .verdict-card, .whatif-result > .state-panel, .scenarios')]
      .map((part) => {
        const copy = part.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('.not-flagged-note').forEach((n) => n.remove());
        return copy.textContent ?? '';
      })
      .join(' ');

  test('the intro is one plain line, and says which model decides only when the menu holds another one', async () => {
    openLab();
    expect(await screen.findByText('See whether an amount would be flagged. Nothing is sent to the Bitcoin network.')).toBeInTheDocument();
    expect(document.querySelector('.whatif-note')).not.toHaveTextContent('Verdicts here always come from');
  });

  test('the status line in its four states: fresh says nothing, invalid says what to do, updating says so, settled says nothing', async () => {
    const user = openLab();
    await amountField();
    expect(statusLine()).toHaveTextContent(/^$/);
    expect(statusLine()).toHaveAttribute('role', 'status');

    await user.type(await amountField(), 'abc');
    expect(statusLine()).toHaveTextContent('Fix the marked fields to update the verdict.');

    await typeAmount(user, '0.05');
    expect(statusLine()).toHaveTextContent('Updating…');
    const card = await verdict();
    await waitFor(() => expect(card.closest('.whatif-result')).not.toHaveClass('is-updating'), LATE);
    expect(statusLine()).toHaveTextContent(/^$/);
  });

  test('the verdict card: the heading says what the model would do, the score is a figure against the flag line, and the amount line and the note are gone', async () => {
    const user = openLab();
    await typeAmount(user, '0.05');
    let card = await verdict();
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(/^Would be flagged/);
    expect(within(card).getByText('Unusual')).toBeInTheDocument();
    expect(within(card).getByTestId('verdict-score')).toHaveTextContent('Score 5.98 flag line 5.00');
    expect(within(card).getByTestId('score-bar')).toHaveAttribute('aria-hidden', 'true');
    expect(card).not.toHaveTextContent(/A hypothetical transaction, compared with/);
    expect(card).not.toHaveTextContent(/UTC\./);

    await typeAmount(user, '0.0005');
    await waitFor(() => expect(within(screen.getByTestId('verdict-card')).getByRole('heading', { level: 2 })).toHaveTextContent('Would not be flagged'), LATE);
    card = screen.getByTestId('verdict-card');
    expect(within(card).getByText('Not unusual')).toBeInTheDocument();
    expect(within(card).getByTestId('verdict-score')).toHaveTextContent(/^Score \d+\.\d\d flag line 5\.00$/);
    expect(card).not.toHaveTextContent(/A hypothetical transaction, compared with/);
  });

  test('no position word anywhere in the lab, fresh, flagged or not flagged', async () => {
    const user = openLab();
    await screen.findByTestId('curve-reading', undefined, LATE);
    expect(labText()).not.toMatch(POSITION);
    await typeAmount(user, '0.05');
    await verdict();
    expect(labText()).not.toMatch(POSITION);
    await typeAmount(user, '0.0005');
    await waitFor(() => expect(screen.getByTestId('verdict-card')).toHaveTextContent('Would not be flagged'), LATE);
    expect(labText()).not.toMatch(POSITION);
    await user.clear(await amountField());
    await user.type(await amountField(), '0');
    expect(labText()).not.toMatch(POSITION);
  });

  describe('the history panel lead', () => {
    /** E8's real 422 for a too early time, with the counts replaced. */
    async function tooLittle(earlierTx: number, spanDays: number) {
      const real = await mockApi.whatIf(ex.mainAddress, { amountBtc: '0.05', direction: 'out', time: ex.whatIf.tooEarlyTime }).catch((e) => e);
      const body = { ...real.body, history: { ...real.body.history, earlierTx, spanDays } };
      vi.spyOn(mockApi, 'whatIf').mockRejectedValue(new (await import('../src/api/types')).ApiError(422, body));
    }

    test('one earlier transaction: "1 earlier transaction within a day" or over its days, then what scoring needs', async () => {
      await tooLittle(1, 4.2);
      const user = openLab();
      await typeAmount(user, '0.05');
      const panel = await screen.findByTestId('state-insufficient', undefined, LATE);
      expect(within(panel).getByTestId('insufficient-lead')).toHaveTextContent('1 earlier transaction over 4 days');
      expect(panel).toHaveTextContent('Scoring needs 10 transactions over 14 days.');
      expect(panel).not.toHaveTextContent(/Nothing is scored/);
    });

    test('many earlier transactions, and none', async () => {
      await tooLittle(9, 53.4);
      const user = openLab();
      await typeAmount(user, '0.05');
      expect(await screen.findByTestId('insufficient-lead', undefined, LATE)).toHaveTextContent('9 earlier transactions over 53 days');
    });

    test('a span under a day does not read "over less than a day"', async () => {
      await tooLittle(1, 0.2);
      const user = openLab();
      await typeAmount(user, '0.05');
      expect(await screen.findByTestId('insufficient-lead', undefined, LATE)).toHaveTextContent('1 earlier transaction within a day');
    });
  });
});
