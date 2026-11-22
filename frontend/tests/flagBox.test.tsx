// The flag box (FR-04, components/FlagCallout.tsx), the not-flagged line and its Details, the not-scored lead, and the
// words "model" and "method", through the real UI on the mock. E12 is controlled in every test, so what is shown is the same each time.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { METHODS_ANSWER } from '../src/api/mock/fixtures';
import { mockApi } from '../src/api/mock/mockApi';
import { ApiError, type Reason, type TransactionDetail } from '../src/api/types';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const LATE = { timeout: 3000 };
const detailHash = (r: { address: string; date: string; txid: string }) => `#/address/${r.address}/day/${r.date}/tx/${r.txid}`;
const baselineFlagLine = METHODS_ANSWER.methods.find((m) => m.id === 'baseline')!.threshold.toFixed(2);

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

/** E12 never answers (nothing is asked of it until a button is pressed; this is a guard). */
const noAnswer = () => vi.spyOn(mockApi, 'explain').mockReturnValue(new Promise(() => {}));

/** The recorded flagged transaction with its reasons replaced. */
async function flaggedWith(reasons: Reason[]): Promise<TransactionDetail> {
  const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
  vi.spyOn(mockApi, 'transaction').mockResolvedValue({ ...tx, reasons });
  return tx;
}

const F4: Reason = { feature: 'F4', label: 'Small for a received amount', level: 'flag', valueText: '0.4×', usualText: '1.4×' };
const F1: Reason = { feature: 'F1', label: 'Smaller amount than usual', level: 'contributing', valueText: '0.00111260 BTC', usualText: '0.00291708 BTC' };
const F3: Reason = { feature: 'F3', label: 'Longer gap than usual', level: 'contributing', valueText: '6 days', usualText: '10 hours' };

/** The order of the box's parts: each part must come before the next in the document. */
function inOrder(...parts: Array<Element | null>) {
  parts.forEach((p, i) => {
    expect(p).not.toBeNull();
    if (i > 0) expect(parts[i - 1]!.compareDocumentPosition(p!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
}

describe('the flag box', () => {
  test('F4 first: title, big figure "0.4× its usual size", the other reason, Compared with, the limitation line, the Assistant control', async () => {
    noAnswer();
    const tx = await flaggedWith([F4, F1]);
    open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation');
    expect(within(why).getByRole('heading', { level: 3, name: 'Why it stands out' })).toBeInTheDocument();
    const figure = within(why).getByTestId('flag-figure');
    expect(figure.querySelector('.stat-label')).toHaveTextContent('Small for a received amount');
    expect(figure.querySelector('.stat-figure')).toHaveTextContent('0.4× its usual size');
    expect(figure.querySelector('.stat-note')).toBeNull();
    const reasons = await within(why).findByTestId('reason-lines');
    expect(within(reasons).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Smaller amount than usual: 0.00111260 BTC (usual 0.00291708 BTC)']);
    const bases = within(why).getAllByRole('listitem').filter((li) => li.closest('ul.bases'));
    expect(bases).toHaveLength(tx.comparison.length);
    expect(bases[0]).toHaveTextContent(tx.comparison[0].description);
    expect(why).not.toHaveTextContent(tx.comparison[0].label);
    expect(why).not.toHaveTextContent(/Template|Flagged by|What stands out/);
    const control = await within(why).findByRole('button', { name: 'Ask the Assistant to explain' }, LATE);
    inOrder(why.querySelector('h3'), figure, reasons, within(why).getByRole('heading', { name: 'Compared with' }), within(why).getByTestId('limitation-line'), control);
    expect(screen.getAllByText(LIMITATION_LINE)).toHaveLength(1);
  });

  test('F1 first: the big figure has the usual value as its qualifier, and F4 as another line reads "its usual size"', async () => {
    noAnswer();
    await flaggedWith([F1, F4, F3]);
    open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation');
    const figure = within(why).getByTestId('flag-figure');
    expect(figure.querySelector('.stat-label')).toHaveTextContent('Smaller amount than usual');
    expect(figure.querySelector('.stat-figure')).toHaveTextContent('0.00111260 BTC');
    expect(figure.querySelector('.stat-unit')).toBeNull();
    expect(figure.querySelector('.stat-note')).toHaveTextContent('usual 0.00291708 BTC');
    const reasons = await within(why).findByTestId('reason-lines');
    expect(within(reasons).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Small for a received amount: 0.4× its usual size',
      'Longer gap than usual: 6 days (usual 10 hours)',
    ]);
    expect(within(why).getByTestId('limitation-line')).toHaveTextContent(LIMITATION_LINE);
    expect(screen.getAllByText(LIMITATION_LINE)).toHaveLength(1);
  });

  test('a flag with one reason has a big figure and no list of other reasons', async () => {
    noAnswer();
    await flaggedWith([F3]);
    open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation');
    expect(within(why).getByTestId('flag-figure')).toHaveTextContent('6 days');
    expect(within(why).queryByTestId('reason-lines')).not.toBeInTheDocument();
  });

  test('the Assistant tag is over an answer the Assistant wrote, and the figure, the comparison and the limitation line stay', async () => {
    await flaggedWith([F4, F1]);
    const user = open(detailHash(ex.flagged));
    const why = await screen.findByTestId('flag-explanation');
    await user.click(await within(why).findByRole('button', { name: 'Ask the Assistant to explain' }, LATE));
    expect(await within(why).findByText('Written by the Assistant. Checked by code before it is shown.', undefined, LATE)).toBeInTheDocument();
    expect(within(why).queryByTestId('reason-lines')).not.toBeInTheDocument();
    expect(within(why).getByTestId('flag-figure')).toBeInTheDocument();
    expect(within(why).getByRole('heading', { name: 'Compared with' })).toBeInTheDocument();
    expect(within(why).getAllByText(LIMITATION_LINE)).toHaveLength(1);
  });

  test('the what-if lab uses the same box: title, big figure from E8 and the limitation line once', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    noAnswer();
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Amount (BTC)'), '0.05');
    const why = await screen.findByTestId('flag-explanation', undefined, LATE);
    expect(within(why).getByRole('heading', { name: 'Why it stands out' })).toBeInTheDocument();
    expect(within(why).getByTestId('flag-figure')).toHaveTextContent('Large for a sent amount 95.2× its usual size');
    expect(screen.getAllByText(LIMITATION_LINE)).toHaveLength(1);
  });
});

describe('a transaction that is not flagged', () => {
  test('V3 says the score against the flag line in one line and keeps the reasons in a closed Details disclosure', async () => {
    open(detailHash(ex.scored));
    const tx = await mockApi.transaction(ex.scored.txid, ex.scored.address);
    const line = await screen.findByText(`Score ${tx.score.toFixed(2)}, below the flag line of ${baselineFlagLine}.`);
    expect(line).toBeInTheDocument();
    expect(screen.queryByText(/Not unusual\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/No feature was/)).not.toBeInTheDocument();
    const details = screen.getByTestId('not-flagged-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')).toHaveTextContent('Details');
    expect(within(details).getByRole('heading', { name: 'Closest to the flag line' })).toBeInTheDocument();
    expect(within(details).getAllByTestId('reason-lines')[0]).toBeInTheDocument();
    expect(details).not.toHaveTextContent(/stands out/);
    inOrder(line, details);
  });

  test('V4 shows the score once, as the figure with its flag line, and no repeating sentence', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Amount (BTC)'), '0.0005');
    const card = await screen.findByTestId('verdict-card', undefined, LATE);
    expect(within(card).getByTestId('verdict-score')).toHaveTextContent(/Score\s*\d+\.\d\d\s*flag line \d+\.\d\d/);
    expect(card).not.toHaveTextContent(/below the flag line/);
    expect(card).not.toHaveTextContent(/No feature was|Not flagged\./);
    const details = within(card).getByTestId('not-flagged-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });
});

describe('a transaction that cannot be scored', () => {
  async function notScored(earlierTx: number, spanDays: number) {
    const tx = await mockApi.transaction(ex.scored.txid, ex.scored.address);
    const transaction = { txid: tx.txid, time: tx.time, blockHeight: tx.blockHeight, direction: tx.direction, netSats: tx.netSats, receivedSats: tx.receivedSats, sentSats: tx.sentSats, sourceUrl: tx.sourceUrl, address: tx.address };
    vi.spyOn(mockApi, 'transaction').mockRejectedValue(
      new ApiError(422, { status: 'insufficient_history', message: 'x', transaction, history: { earlierTx, spanDays, required: { minTx: 10, minSpanDays: 14 } }, firstScoredDate: null }),
    );
    open(detailHash(ex.scored));
    return screen.findByTestId('state-insufficient');
  }

  test.each([
    [9, 53.4, '9 earlier transactions, 53 days'],
    [1, 0.2, '1 earlier transaction'],
    [0, 0, 'No earlier transactions'],
  ])('E7 says %j earlier transactions over %j days: the lead is "%s"', async (earlierTx, spanDays, lead) => {
    const panel = await notScored(earlierTx, spanDays);
    expect(within(panel).getByRole('heading', { name: 'Too little history to score' })).toBeInTheDocument();
    expect(within(panel).getByTestId('not-scored-lead').textContent).toBe(lead);
    expect(panel).toHaveTextContent('Scoring needs 10 transactions over 14 days.');
    expect(within(panel).getByRole('link', { name: 'Back to the timeline' })).toBeInTheDocument();
  });
});

describe('"model", not "method", in what a reader sees', () => {
  const visibleText = () => (document.body.innerText ?? document.body.textContent ?? '') + ' ' + [...document.querySelectorAll('[aria-label],[title],caption')].map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''} ${e.tagName === 'CAPTION' ? e.textContent : ''}`).join(' ');

  test('V3, flagged: no "method" in the text, the table captions or the accessible names', async () => {
    open(detailHash(ex.flagged));
    await screen.findByRole('table', { name: /nine models/ });
    await screen.findByTestId('flag-explanation');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Deciding model' })).toBeInTheDocument());
    expect(visibleText()).not.toMatch(/\bmethods?\b/i);
  });

  test('V3, not flagged: no "method" either', async () => {
    open(detailHash(ex.scored));
    await screen.findByTestId('not-flagged-details');
    expect(visibleText()).not.toMatch(/\bmethods?\b/i);
  });

  test('V4: no "method" in the lab with a flag, its table and its chart menu', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('Amount (BTC)'), '0.05');
    await screen.findByTestId('flag-explanation', undefined, LATE);
    await screen.findByLabelText('Model drawn', undefined, LATE);
    expect(visibleText()).not.toMatch(/\bmethods?\b/i);
  });

  test('the Models page: no "method" in its lede, its list or its limits', async () => {
    open('#/models');
    await screen.findByRole('list', { name: 'The models' });
    expect(visibleText()).not.toMatch(/\bmethods?\b/i);
  });
});
