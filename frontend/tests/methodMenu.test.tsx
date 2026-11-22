// S-01, the method menu: the nine methods by E11's names, the choice in the link and remembered, and
// every screen following it. The mock replays what the real service said under Regression
// and TxGPT (E5, E6 and some E7), so the numbers below are the service's.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { METHODS_ANSWER, METHOD_RUNS } from '../src/api/mock/fixtures';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { METHODS } from '../src/lib/methods';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const regression = METHOD_RUNS.runs.regression!;
const described = (id: string) => METHODS_ANSWER.methods.find((m) => m.id === id)!;
const regressionName = described('regression').name;

function start(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const menu = () => screen.findByRole('combobox', { name: 'Deciding model' });
const stored = () => JSON.parse(localStorage.getItem('explorer.preferences.v1') ?? '{}');
const unusualTile = () => screen.getByText('Unusual', { selector: 'dt' });
/** The first transaction a method flags in a recorded run, with its detail. */
const flaggedIn = (run: NonNullable<typeof regression>) => {
  const [txid, detail] = Object.entries(run.details).find(([, d]) => d.status === 200 && d.body.flagged)!;
  if (detail.status !== 200) throw new Error('The fixture has no flagged detail.');
  return { txid, tx: detail.body };
};

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
  vi.restoreAllMocks();
});

describe('the menu', () => {
  test('lists the nine methods by their E11 names, in one order, with the baseline marked as the default', async () => {
    start(`#/address/${ex.mainAddress}`);
    const select = await menu();
    await waitFor(() => expect(within(select).getAllByRole('option')[0]).toHaveTextContent(`${METHODS_ANSWER.methods[0].name} (default)`));
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('value'))).toEqual(METHODS.map((m) => m.id));
    options.forEach((o, i) => expect(o.textContent).toContain(METHODS_ANSWER.methods[i].name));
    expect(options.filter((o) => /\(default\)/.test(o.textContent ?? ''))).toHaveLength(1);
    expect(select).toHaveValue('baseline');
  });

  test('a choice goes into the link and into the preferences; going back to the default leaves it out of the link', async () => {
    const user = start(`#/address/${ex.mainAddress}`);
    await user.selectOptions(await menu(), 'regression');
    expect(window.location.hash).toBe(`#/address/${ex.mainAddress}?method=regression`);
    expect(stored().method).toBe('regression');
    await user.selectOptions(await menu(), 'baseline');
    expect(window.location.hash).toBe(`#/address/${ex.mainAddress}`);
    expect(stored().method).toBe('baseline');
  });

  test('a link that names a method that does not exist opens with the default', async () => {
    start(`#/address/${ex.mainAddress}?method=bogus`);
    expect(await menu()).toHaveValue('baseline');
  });

  test('the next address opens with the method last chosen', async () => {
    localStorage.setItem('explorer.preferences.v1', JSON.stringify({ theme: null, method: 'fusion' }));
    start('#/');
    const link = await screen.findByRole('link', { name: new RegExp(`full address ${ex.mainAddress}`) });
    expect(link.getAttribute('href')).toBe(`#/address/${ex.mainAddress}?method=fusion`);
  });

  test('a preference that is not a method is ignored', async () => {
    localStorage.setItem('explorer.preferences.v1', JSON.stringify({ theme: null, method: 'bogus' }));
    start('#/');
    const link = await screen.findByRole('link', { name: new RegExp(`full address ${ex.mainAddress}`) });
    expect(link.getAttribute('href')).toBe(`#/address/${ex.mainAddress}`);
  });
});

describe('the overview follows the method', () => {
  test('the tiles, the flagged days and the chart are the chosen method\'s; the old answer stays, dimmed, while the new one loads', async () => {
    const user = start(`#/address/${ex.mainAddress}`);
    const heading = await screen.findByRole('heading', { name: 'Days with unusual transactions' });
    expect(unusualTile().nextElementSibling).toHaveTextContent('3on 3 days');

    mockControls.latencyMs = 80;
    await user.selectOptions(await menu(), 'regression');
    // At once: the choice is shown, the status says it is working and the old figures are dimmed, not removed.
    expect(screen.getByText('Updating…')).toBeInTheDocument();
    expect(unusualTile().nextElementSibling).toHaveTextContent('3on 3 days');
    expect(unusualTile().closest('dl')).toHaveClass('is-updating');

    const { totals, days } = regression.timeline!;
    await waitFor(() => expect(unusualTile().nextElementSibling).toHaveTextContent(`${totals.flaggedCount}on ${totals.flaggedDays} days by ${regressionName}`));
    expect(screen.queryByText('Updating…')).not.toBeInTheDocument();
    const section = heading.closest('section')!;
    const flaggedDays = days.filter((d) => d.flaggedCount > 0).length;
    expect(within(section).getByText(`${flaggedDays} days, newest first. Open one to see which transactions stand out and why.`)).toBeInTheDocument();
    // G1's footnote is the source and date only (the model menu is on the screen), and the links to a day keep the method.
    expect(await screen.findByText(/^Blockstream Esplora · snapshot of /, { selector: '.pchart-footnote' })).toBeInTheDocument();
    expect(document.querySelector('.pchart-footnote')!.textContent).not.toMatch(/flagged by|days in UTC/);
    expect(within(section).getAllByRole('link')[0].getAttribute('href')).toMatch(/\?method=regression$/);
  });

  test('every request that takes a method sends it', async () => {
    const timeline = vi.spyOn(mockApi, 'timeline');
    const rows = vi.spyOn(mockApi, 'transactions');
    const user = start(`#/address/${ex.mainAddress}`);
    await screen.findByRole('heading', { name: 'Days with unusual transactions' });
    expect(timeline.mock.calls[0][1]?.method).toBe('baseline');
    await user.selectOptions(await menu(), 'regression');
    await waitFor(() => expect(timeline).toHaveBeenLastCalledWith(ex.mainAddress, expect.objectContaining({ method: 'regression' })));
    await waitFor(() => expect(rows).toHaveBeenLastCalledWith(ex.mainAddress, expect.objectContaining({ status: ['flagged'], method: 'regression' }), expect.anything()));
  });

  test('the lab says it decides with the default method, and the tabs keep the method', async () => {
    start(`#/address/${ex.mainAddress}/what-if?method=regression`);
    expect(await menu()).toHaveValue('regression');
    expect(await screen.findByText(/The lab always decides with the default model/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('href')).toBe(`#/address/${ex.mainAddress}?method=regression`);
  });
});

describe('the transactions tab follows the method', () => {
  test('the table and the chart ask for it, and a row opens the transaction under it', async () => {
    const rows = vi.spyOn(mockApi, 'transactions');
    start(`#/address/${ex.mainAddress}/transactions?method=regression&status=flagged`);
    const table = await screen.findByRole('table', { name: /Transactions of this address/ });
    const flagged = regression.transactionPages.flatMap((p) => p.transactions).filter((r) => r.status === 'flagged');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(Math.min(flagged.length, settings.web.lists.pageSize) + 1));
    expect(rows.mock.calls.every((c) => c[1].method === 'regression')).toBe(true);
    expect(within(table).getAllByRole('link')[0].getAttribute('href')).toMatch(/\/tx\/[0-9a-f]{64}\?method=regression$/);
    expect(screen.getByText(/^Blockstream Esplora · snapshot of /, { selector: '.pchart-footnote' })).toBeInTheDocument();
    expect(document.querySelector('.pchart-footnote')!.textContent).not.toMatch(/flagged by|times in UTC/);
  });

  test('changing the method keeps the filters and returns to page 1', async () => {
    const user = start(`#/address/${ex.mainAddress}/transactions?status=flagged&page=2`);
    await user.selectOptions(await menu(), 'regression');
    expect(window.location.hash).toBe(`#/address/${ex.mainAddress}/transactions?status=flagged&method=regression`);
  });
});

describe('a transaction follows the method', () => {
  test('under the chosen method it is flagged with that method\'s explanation, and the limitation line stays on the flag', async () => {
    const { txid, tx } = flaggedIn(regression);
    start(`#/address/${ex.mainAddress}/day/${tx.time.slice(0, 10)}/tx/${txid}?method=regression`);
    const why = await screen.findByTestId('flag-explanation');
    expect(within(why).getByTestId('limitation-line')).toHaveTextContent(LIMITATION_LINE);
    const table = await screen.findByRole('table', { name: /nine models for this transaction/ });
    expect(within(table).getAllByRole('rowheader').find((h) => /Deciding/.test(h.textContent ?? ''))).toHaveTextContent(regressionName);
  });

  test('a transaction the baseline flags can be unremarkable to another method, and the page says by how much', async () => {
    start(`#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}?method=regression`);
    const run = regression.details[ex.flagged.txid];
    if (run.status !== 200) throw new Error('The fixture has no detail for it.');
    expect(run.body.flagged).toBe(false);
    const note = (await screen.findByText(/^Score \d/)).closest('p');
    expect(note).toHaveTextContent(`Score ${run.body.score.toFixed(2)}, below the flag line of ${described('regression').threshold.toFixed(2)}.`);
    expect(screen.queryByTestId('flag-explanation')).not.toBeInTheDocument();
  });

  test('TxGPT, which cannot score a new amount, scores a snapshot transaction', async () => {
    const { txid, tx } = flaggedIn(METHOD_RUNS.runs.txgpt_method!);
    start(`#/address/${ex.mainAddress}/day/${tx.time.slice(0, 10)}/tx/${txid}?method=txgpt_method`);
    expect(await screen.findByTestId('flag-explanation')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /nine models for this transaction/ });
    expect(within(table).getAllByRole('rowheader').find((h) => /Deciding/.test(h.textContent ?? ''))).toHaveTextContent(described('txgpt_method').name);
  });

  test('the day\'s list and the links out of the screen keep the method', async () => {
    start(`#/address/${ex.flagged.address}/day/${ex.flagged.date}?method=regression`);
    expect(await menu()).toHaveValue('regression');
    await screen.findByRole('heading', { level: 2, name: /^\d+ transactions?$/ });
    const links = screen.getAllByRole('link').filter((l) => /\/tx\//.test(l.getAttribute('href') ?? ''));
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/\?method=regression$/);
    expect(screen.getByRole('link', { name: new RegExp(ex.flagged.address.slice(0, 8)) }).getAttribute('href')).toBe(`#/address/${ex.flagged.address}?method=regression`);
  });
});
