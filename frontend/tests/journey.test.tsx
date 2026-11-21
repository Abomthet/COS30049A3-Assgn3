// End-to-end journeys through the real UI (with the mock API, which replays the real service's
// recorded answers). The first tests are the usability-walkthrough tasks from the plan; the rest
// cover every state of the catalogue that a view can reach.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { METHODS_ANSWER, RECORDED } from '../src/api/mock/fixtures';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { ApiError, type TimelineResponse } from '../src/api/types';
import { METHODS } from '../src/lib/methods';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

function start(hash = '#/') {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const detailHash = (r: { address: string; date: string; txid: string }) => `#/address/${r.address}/day/${r.date}/tx/${r.txid}`;

afterEach(() => {
  // NFR-01 pass condition 3, on whatever each test left on screen.
  expect(document.body.textContent ?? '').not.toMatch(banned);
  vi.restoreAllMocks();
});

describe('usability walkthrough tasks', () => {
  test('1. open a sample address: timeline with date range and source (AC-01)', async () => {
    const user = start();
    await user.click(await screen.findByRole('link', { name: new RegExp(`full address ${ex.mainAddress}`) }));
    expect(await screen.findByRole('heading', { level: 1, name: ex.mainAddress })).toBeInTheDocument();
    expect(screen.getByText(/Source: Blockstream Esplora · snapshot of 22 Oct 2026/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
    expect(screen.getByText('Active').nextElementSibling).toHaveTextContent('16 May 2024 – 19 Oct 2026');
    expect(screen.getByText('Scored').nextElementSibling).toHaveTextContent('367 of 377');
    expect(screen.getByText('Unusual', { selector: 'dt' }).nextElementSibling).toHaveTextContent('3on 3 days');
  });

  test('2. find a highlighted date and open it', async () => {
    const user = start(`#/address/${ex.flagged.address}`);
    const heading = await screen.findByRole('heading', { name: 'Days with unusual transactions' });
    await user.click(within(heading.closest('section')!).getByRole('link', { name: /11 Jul 2024/ }));
    expect(await screen.findByRole('heading', { level: 1, name: '11 Jul 2024' })).toBeInTheDocument();
  });

  test('3. locate the unusual transaction and see why it is flagged (AC-03)', async () => {
    const user = start(`#/address/${ex.flagged.address}/day/${ex.flagged.date}`);
    expect(await screen.findByTestId('state-empty-detail')).toBeInTheDocument();
    await user.click((await screen.findAllByRole('link', { name: /Unusual/ }))[0]);
    const why = await screen.findByTestId('flag-explanation');
    expect(within(why).getByRole('heading', { name: /Why this transaction stands out/ })).toBeInTheDocument();
    expect(within(why).getAllByRole('listitem').length).toBeGreaterThan(1);
    expect(within(why).getByText('Compared with')).toBeInTheDocument();
    expect(within(why).getByTestId('limitation-line')).toHaveTextContent(LIMITATION_LINE);
    expect(screen.getByRole('img', { name: /Distance from usual for each feature/ })).toBeInTheDocument();
  });

  test('4. recover from an unsupported input', async () => {
    const user = start();
    await user.type(await screen.findByLabelText('Bitcoin address'), ex.unsupported);
    await user.click(screen.getByRole('button', { name: /Look up/ }));
    const panel = await screen.findByTestId('state-unsupported');
    expect(panel).toHaveTextContent("This address isn't in the snapshot");
    const examples = within(panel).getAllByRole('link');
    expect(examples).toHaveLength(3);
    for (const link of examples) expect(link.getAttribute('href')).toMatch(/^#\/address\//);
    await user.click(within(panel).getByRole('button', { name: 'Clear and try another address' }));
    expect(screen.queryByTestId('state-unsupported')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bitcoin address')).toHaveValue('');
  });
});

describe('the address list (V1)', () => {
  test('every address has its type, counts and unusual count; a short history says so', async () => {
    start();
    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(28);
    const main = rows.find((r) => within(r).queryByRole('link', { name: new RegExp(`full address ${ex.mainAddress}`) }))!;
    expect(main).toHaveTextContent('Legacy (P2PKH)');
    expect(within(main).getByText('377')).toBeInTheDocument();
    expect(within(main).getByText('367')).toBeInTheDocument();
    expect(main).toHaveTextContent('3 (1% of scored)');
    expect(within(table).getAllByText('Short history, not scored')).toHaveLength(3);
  });
});

describe('the overview (V2)', () => {
  test('each flagged day names its strongest reason, from E6', async () => {
    start(`#/address/${ex.flagged.address}`);
    const [top] = (await mockApi.transactions(ex.flagged.address, { status: ['flagged'], sort: '-score' })).transactions;
    const link = await screen.findByRole('link', { name: /11 Jul 2024/ });
    await waitFor(() => expect(link).toHaveTextContent(top.mainReason!));
    expect(link).toHaveTextContent('1 of 1 transaction');
  });

  test('the list shows eight days and "Show all" opens the rest', async () => {
    const real = await mockApi.timeline(ex.mainAddress);
    const days = Array.from({ length: 12 }, (_, i) => ({ date: `2025-03-${String(i + 1).padStart(2, '0')}`, txCount: 2, flaggedCount: 1 }));
    const many: TimelineResponse = { ...real, days, totals: { ...real.totals, flaggedDays: 12, flaggedCount: 12 } };
    vi.spyOn(mockApi, 'timeline').mockResolvedValue(many);
    const user = start(`#/address/${ex.mainAddress}`);
    const heading = await screen.findByRole('heading', { name: 'Days with unusual transactions' });
    const section = heading.closest('section')!;
    expect(within(section).getAllByRole('link')).toHaveLength(8);
    expect(within(section).getAllByRole('link')[0]).toHaveTextContent('12 Mar 2025');
    await user.click(within(section).getByRole('button', { name: 'Show all 12 days' }));
    expect(within(section).getAllByRole('link')).toHaveLength(12);
    await user.click(within(section).getByRole('button', { name: 'Show fewer days' }));
    expect(within(section).getAllByRole('link')).toHaveLength(8);
  });

  test('the flagged days are still listed, without reasons, when E6 fails', async () => {
    vi.spyOn(mockApi, 'transactions').mockRejectedValue(new ApiError(500, { status: 'server_error', message: 'Oops.' }));
    start(`#/address/${ex.mainAddress}`);
    expect(await screen.findByRole('link', { name: /11 Jul 2024/ })).toHaveTextContent('1 of 1 transaction');
    expect(screen.getByRole('link', { name: /11 Jul 2024/ })).not.toHaveTextContent('·');
  });
});

describe('the transaction detail (V3)', () => {
  const flaggedIds = RECORDED.flatMap((r) => Object.values(r.details).flatMap((d) => (d.status === 200 && d.body.flagged ? [d.body] : [])));

  test.each(flaggedIds.map((tx) => [tx.txid, tx] as const))('FR-04: flagged %s shows its explanation and the limitation line', async (_id, tx) => {
    start(detailHash({ address: tx.address, date: tx.time.slice(0, 10), txid: tx.txid }));
    const why = await screen.findByTestId('flag-explanation');
    // The explanation's own lines are shown; its last line, the limitation, is shown once in its own place.
    const lines = tx.explanation.split('\n');
    for (const line of lines.slice(0, -1)) expect(why).toHaveTextContent(line.replace(/^- /, ''));
    expect(within(why).getAllByText(LIMITATION_LINE)).toHaveLength(1);
    expect(within(why).getByTestId('limitation-line')).toHaveTextContent(LIMITATION_LINE);
  });

  test('every model is named: nine rows, the deciding one marked, and a flag where a method flags', async () => {
    start(detailHash(ex.flagged));
    const table = await screen.findByRole('table', { name: /Score, flag line and verdict of each of the nine methods/ });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    // Each method's flag line is the threshold E11 gives it, so a score such as K-Means' 6.69 is read against its own.
    await waitFor(() => expect(within(rows[3]).getAllByRole('cell')[2]).not.toHaveTextContent('—'));
    METHODS.forEach((m, i) => {
      expect(within(rows[i]).getByRole('rowheader')).toHaveTextContent(m.name);
      const cells = within(rows[i]).getAllByRole('cell');
      expect(cells[1]).toHaveTextContent(tx.scores[m.id]!.toFixed(2));
      expect(cells[2]).toHaveTextContent(METHODS_ANSWER.methods.find((e) => e.id === m.id)!.threshold.toFixed(2));
      expect(cells[3]).toHaveTextContent(tx.flags[m.id] ? 'Flag' : 'Not flagged');
    });
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('Deciding method');
    expect(within(rows[0]).getByText('Flag')).toBeInTheDocument();
  });

  test('a transaction that is not flagged says so, with the flag line from the service, and still lists the models', async () => {
    start(detailHash(ex.scored));
    expect(await screen.findByText(/No feature was 5 or more/)).toBeInTheDocument();
    expect(screen.queryByTestId('flag-explanation')).not.toBeInTheDocument();
    expect(screen.getByRole('table', { name: /nine methods/ })).toBeInTheDocument();
  });

  test('a method that cannot score shows "Not available" and no verdict', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    vi.spyOn(mockApi, 'transaction').mockResolvedValue({ ...tx, scores: { ...tx.scores, txgpt_method: null }, flags: { ...tx.flags, txgpt_method: false } });
    start(detailHash(ex.flagged));
    const verdicts = await screen.findByRole('table', { name: /nine methods/ });
    const row = within(verdicts).getByRole('rowheader', { name: /TxGPT surprisal/ }).closest('tr')!;
    expect(row).toHaveTextContent('Not available');
    expect(row).not.toHaveTextContent('Flag');
  });

  test('a day with more rows than the page says how many it shows', async () => {
    const day = await mockApi.transactions(ex.flagged.address, { date: ex.flagged.date });
    vi.spyOn(mockApi, 'transactions').mockResolvedValue({ ...day, total: 260 });
    start(`#/address/${ex.flagged.address}/day/${ex.flagged.date}`);
    expect(await screen.findByRole('heading', { name: '260 transactions' })).toBeInTheDocument();
    expect(screen.getByText('Showing the first 1, in time order.')).toBeInTheDocument();
  });
});

describe('FR-05 states', () => {
  test('invalid: a typo is caught in the browser and never sent to the API', async () => {
    const lookup = vi.spyOn(mockApi, 'lookup');
    const user = start();
    const input = await screen.findByLabelText('Bitcoin address');
    await user.type(input, `${ex.typo}{Enter}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(/fails its checksum/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveFocus();
    expect(lookup).not.toHaveBeenCalled();
  });

  test('invalid: an empty submit asks for an address', async () => {
    const user = start();
    await user.click(await screen.findByRole('button', { name: /Look up/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a Bitcoin address.');
  });

  test('invalid: a 400 from the service shows its message, and a missing hint is not printed as "null"', async () => {
    vi.spyOn(mockApi, 'lookup').mockRejectedValue(new ApiError(400, { status: 'invalid', message: 'One value needs correcting.', hint: null }));
    const user = start();
    await user.type(await screen.findByLabelText('Bitcoin address'), `${ex.mainAddress}{Enter}`);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('One value needs correcting.');
    expect(alert).not.toHaveTextContent('null');
  });

  test('a supported address typed in goes straight to its timeline', async () => {
    const user = start();
    await user.type(await screen.findByLabelText('Bitcoin address'), `  ${ex.mainAddress} {Enter}`);
    expect(await screen.findByRole('heading', { level: 1, name: ex.mainAddress })).toBeInTheDocument();
  });

  test('loading: every request shows a loading message first', async () => {
    mockControls.latencyMs = 50;
    start(`#/address/${ex.mainAddress}`);
    expect(screen.getByText("Loading this address's activity…")).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
  });

  test('empty: nothing selected yet on the day screen', async () => {
    start(`#/address/${ex.flagged.address}/day/${ex.flagged.date}`);
    expect(await screen.findByTestId('state-empty-detail')).toHaveTextContent('Select a transaction');
  });

  test('empty: a day without transactions', async () => {
    start(`#/address/${ex.mainAddress}/day/2020-01-01`);
    expect(await screen.findByText('No transactions on this day')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the timeline' })).toBeInTheDocument();
  });

  test('insufficient history: an address too short to score lists its transactions unscored', async () => {
    start(`#/address/${ex.shortHistory}`);
    const panel = await screen.findByTestId('state-insufficient');
    expect(panel).toHaveTextContent('Not enough history to score this address');
    expect(panel).toHaveTextContent('8 transactions spanning under a day');
    expect(within(panel).getByRole('link', { name: 'Browse its transactions anyway' })).toBeInTheDocument();
    expect(screen.getByText('Unusual', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Not scored');
  });

  test('insufficient history: a transaction of a short address keeps its facts and explains why it is not scored (422)', async () => {
    start(detailHash(ex.notScored));
    const panel = await screen.findByTestId('state-insufficient');
    expect(panel).toHaveTextContent('Not enough history to score this transaction');
    expect(panel).toHaveTextContent(/at least 10 earlier transactions over at least 14 days/);
    expect(screen.getByText(ex.notScored.txid)).toBeInTheDocument();
  });

  test('insufficient history: an early transaction of a normal address is handled the same way, per transaction (422)', async () => {
    start(detailHash(ex.earlyUnscored));
    const panel = await screen.findByTestId('state-insufficient');
    expect(panel).toHaveTextContent('Not enough history to score this transaction');
    expect(panel).toHaveTextContent('0 confirmed transactions, with a history spanning under a day');
    expect(screen.getByText(ex.earlyUnscored.txid)).toBeInTheDocument();
    // The address itself is fine, so the next step is its first scored day.
    expect(within(panel).getByRole('link', { name: /Go to the first scored day \(11 Jul 2024\)/ })).toHaveAttribute('href', `#/address/${ex.mainAddress}/day/2024-07-11`);
  });

  test('not found: a transaction that is not the address\'s', async () => {
    start(detailHash({ address: ex.mainAddress, date: ex.flagged.date, txid: '0'.repeat(64) }));
    expect(await screen.findByText("There's nothing at this link")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to 11 Jul 2024/ })).toBeInTheDocument();
  });

  test('unsupported: a link to an address outside the snapshot', async () => {
    start(`#/address/${ex.unsupported}`);
    expect(await screen.findByTestId('state-unsupported')).toBeInTheDocument();
  });

  test('network failure: a clear message and a working retry', async () => {
    mockControls.offline = true;
    const user = start(`#/address/${ex.mainAddress}`);
    expect(await screen.findByText("Couldn't reach the explorer service")).toBeInTheDocument();
    mockControls.offline = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
  });

  test.each([
    ['too_large', 413, 'That request was too large'],
    ['server_error', 500, 'Something went wrong on our side'],
    ['unavailable', 503, 'The service is starting'],
  ] as const)('a %s answer from the service has its own wording', async (status, code, title) => {
    vi.spyOn(mockApi, 'timeline').mockRejectedValue(new ApiError(code, { status, message: 'From the service.', hint: 'Hint.' }));
    start(`#/address/${ex.mainAddress}`);
    expect(await screen.findByText(title)).toBeInTheDocument();
  });

  test('unknown page', async () => {
    start('#/somewhere/else');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('the shell of a finished product', () => {
  test('there is no prototype banner and no prototype tools', async () => {
    start();
    await screen.findByRole('table');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/prototype/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/illustrative/i)).not.toBeInTheDocument();
  });
});

describe('keyboard and labelling', () => {
  test('the timeline chart can be used from the keyboard', async () => {
    const user = start(`#/address/${ex.mainAddress}`);
    const chart = await screen.findByRole('group', { name: /Bar chart of transactions per day/ });
    act(() => chart.focus());
    await user.keyboard('{Home}{ArrowRight}{Enter}');
    expect(await screen.findByText(/Transactions confirmed on this day/)).toBeInTheDocument();
  });

  test('every flagged-day link is reachable without the chart', async () => {
    start(`#/address/${ex.mainAddress}`);
    const heading = await screen.findByRole('heading', { name: 'Days with unusual transactions' });
    const links = within(heading.closest('section')!).getAllByRole('link');
    const timeline = await mockApi.timeline(ex.mainAddress);
    expect(links).toHaveLength(timeline.totals.flaggedDays);
  });
});
