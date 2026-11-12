import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ex from '../src/api/mock/fixtures/examples.json';
import { RECORDED } from '../src/api/mock/fixtures';
import type { SnapshotInfo, TransactionRow } from '../src/api/types';
import { G2TransactionsOverTime } from '../src/charts/G2TransactionsOverTime';
import { formatBtc } from '../src/lib/format';
import { settings } from '../src/lib/settings';
import { fakePlotly } from './plotlyFake';

// G2 draws one point for each transaction of the rows it is given. The status of a point is its colour
// and shape, its direction filled or outlined, its score the size. These tests read the figure Plotly gets.

const current = { snapshot: null as SnapshotInfo | null };

vi.mock('../src/hooks/useSettings', async () => {
  const { BUNDLED_SETTINGS: bundled } = await import('../src/lib/settings');
  return { useSettings: () => ({ settings: { ...bundled, ...current }, origin: 'service' }) };
});

const TOKENS: Record<string, string> = { '--series-1': 'blue', '--series-2': 'orange', '--bar-neutral': 'grey' };
const allRows = (): TransactionRow[] => RECORDED[0].transactionPages.flatMap((p) => p.transactions);

const row = (over: Partial<TransactionRow>): TransactionRow => ({
  txid: 'a'.repeat(64),
  time: '2026-01-01T00:00:00Z',
  direction: 'in',
  netSats: 100_000,
  status: 'not-flagged',
  score: 1,
  mainReason: 'Larger amount than usual',
  mainZ: 1,
  flaggedBy: 0,
  ...over,
});

interface Options {
  rows?: TransactionRow[];
  loading?: { loaded: number; total: number } | null;
  onOpenTransaction?: (row: TransactionRow) => void;
  onZoomDays?: (days: { from: string; to: string } | null) => void;
}

async function draw({ rows = allRows(), loading = null, onOpenTransaction = () => {}, onZoomDays = () => {} }: Options = {}) {
  vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ getPropertyValue: (token: string) => TOKENS[token] ?? '' }) as CSSStyleDeclaration);
  render(
    <G2TransactionsOverTime address={ex.mainAddress} rows={rows} loading={loading} revision="r1" onOpenTransaction={onOpenTransaction} onZoomDays={onZoomDays} />,
  );
  await waitFor(() => expect(fakePlotly.chartDraws().length).toBeGreaterThan(0));
  const { data, layout, config } = fakePlotly.lastChartDraw();
  return { traces: data as any[], layout, config };
}

beforeEach(() => {
  current.snapshot = null;
});

describe('the marks', () => {
  test('one trace for each status and direction that has a transaction, and every transaction is a point', async () => {
    const { traces } = await draw();
    expect(traces.map((t) => t.name)).toEqual([
      '▲ Unusual, received',
      '▲ Unusual, sent',
      'Not unusual, received',
      'Not unusual, sent',
      'Not scored, received',
    ]);
    expect(traces.reduce((n, t) => n + t.x.length, 0)).toBe(377);
  });

  test('status is colour and shape: an unusual one is an orange triangle, never colour alone', async () => {
    const { traces } = await draw();
    const [flaggedIn, flaggedOut, plainIn, , unscoredIn] = traces;
    expect(flaggedIn.marker).toMatchObject({ symbol: 'triangle-up', color: 'orange' });
    expect(plainIn.marker).toMatchObject({ symbol: 'circle', color: 'blue' });
    expect(unscoredIn.marker).toMatchObject({ symbol: 'diamond', color: 'grey' });
    // The legend names the word as well as the mark.
    expect(flaggedOut.name).toContain('Unusual');
  });

  test('direction is filled for received and an outline of the same colour and shape for sent', async () => {
    const { traces } = await draw();
    const [flaggedIn, flaggedOut, plainIn, plainOut] = traces;
    expect(flaggedOut.marker).toMatchObject({ symbol: 'triangle-up-open', color: flaggedIn.marker.color });
    expect(plainOut.marker).toMatchObject({ symbol: 'circle-open', color: plainIn.marker.color });
  });

  test('the size grows with the score, and a transaction without a score gets the smallest mark', async () => {
    const { traces } = await draw({
      rows: [row({ txid: '1'.repeat(64), score: 0.5 }), row({ txid: '2'.repeat(64), score: 5.1, time: '2026-01-02T00:00:00Z' }), row({ txid: '3'.repeat(64), status: 'not-scored', score: null, mainReason: null, time: '2026-01-03T00:00:00Z' })],
    });
    const [plain, unscored] = [traces[0].marker.size as number[], traces[1].marker.size as number[]];
    expect(plain[1]).toBeGreaterThan(plain[0]);
    expect(unscored[0]).toBeLessThan(plain[0]);
  });

  test('amount is the absolute value in BTC on a log axis, time is UTC, and both axes carry units', async () => {
    const { traces, layout } = await draw({ rows: [row({ netSats: -250_000, direction: 'out', time: '2026-03-04T05:06:07Z' })] });
    expect(traces[0].y).toEqual([0.0025]);
    expect(traces[0].x).toEqual(['2026-03-04 05:06:07']);
    expect(layout.yaxis).toMatchObject({ type: 'log', title: { text: 'Amount (BTC, log scale)' } });
    expect(layout.xaxis).toMatchObject({ type: 'date', title: { text: 'Time (UTC)' } });
  });

  test('a single transaction still draws a legend, and its time axis is padded to a readable span', async () => {
    const { layout } = await draw({ rows: [row({ time: '2026-03-04T05:06:07Z' })] });
    expect(layout.showlegend).toBe(true);
    const [from, to] = layout.xaxis.range.map((t: string) => Date.parse(`${t.replace(' ', 'T')}Z`));
    expect((to - from) / 86_400_000).toBeGreaterThanOrEqual(2);
  });

  test('a net amount of zero sits on the axis floor, below every real amount, and is labelled 0', async () => {
    const { traces, layout } = await draw({
      rows: [row({ txid: '1'.repeat(64), netSats: 1_000 }), row({ txid: '2'.repeat(64), netSats: 0, direction: 'none', time: '2026-01-02T00:00:00Z' }), row({ txid: '3'.repeat(64), netSats: 10_000_000, time: '2026-01-03T00:00:00Z' })],
    });
    const zero = traces.find((t) => t.name === 'Not unusual, no net change');
    expect(zero.y[0]).toBeGreaterThan(0);
    expect(zero.y[0]).toBeLessThan(0.00001);
    expect(layout.yaxis.tickvals[0]).toBe(zero.y[0]);
    expect(layout.yaxis.ticktext[0]).toBe('0');
    expect(layout.yaxis.ticktext.slice(1)).toEqual(['0.00001', '0.0001', '0.001', '0.01', '0.1']);
  });

  test('the hover gives the time, direction, exact amount and status; the reason only for an unusual one', async () => {
    const { traces } = await draw();
    const flagged = allRows().find((r) => r.txid === ex.flagged.txid)!;
    const text = traces[0].hovertext[0] as string;
    expect(text).toBe(
      `11 Jul 2024, 03:32 UTC<br>Received ${formatBtc(flagged.netSats)}<br>Unusual: ${flagged.mainReason}<br>Score ${flagged.score!.toFixed(2)}<br>Select to open`,
    );
    const plain = (traces[2].hovertext as string[])[0];
    expect(plain).toContain('Not unusual');
    expect(plain).not.toContain('than usual<br>');
    expect(traces.every((t) => t.hoverinfo === 'text')).toBe(true);
  });
});

describe('interaction', () => {
  test('clicking a point opens that transaction', async () => {
    const open = vi.fn();
    await draw({ onOpenTransaction: open });
    // The second trace holds the one unusual sent transaction.
    fakePlotly.emit('plotly_click', { points: [{ curveNumber: 1, pointNumber: 0 }] });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toMatchObject({ status: 'flagged', direction: 'out', time: '2026-01-09T00:34:37Z' });
  });

  test('the keyboard walks the transactions oldest first and Enter opens the one reached', async () => {
    const open = vi.fn();
    await draw({ onOpenTransaction: open });
    const chart = screen.getByRole('group', { name: /Scatter chart of 377 transactions/ });
    const user = userEvent.setup();
    chart.focus();
    await waitFor(() => expect(fakePlotly.api.Fx.hover).toHaveBeenCalled());
    // Focus lands on the newest transaction; Home goes to the oldest.
    await user.keyboard('{Home}{Enter}');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ time: '2024-05-16T05:16:19Z' }));
  });

  test('zooming the time axis reports the days it covers, and putting the axis back reports null', async () => {
    const zoom = vi.fn();
    const { layout } = await draw({ onZoomDays: zoom });
    fakePlotly.emit('plotly_relayout', { 'xaxis.range[0]': '2024-07-01 03:12:11.5', 'xaxis.range[1]': '2024-09-30 17:00:00' });
    expect(zoom).toHaveBeenLastCalledWith({ from: '2024-07-01', to: '2024-09-30' });
    // A reset (Plotly sends the range as one pair) puts the axis back on the range the figure asked for.
    fakePlotly.emit('plotly_relayout', { 'xaxis.range': layout.xaxis.range });
    expect(zoom).toHaveBeenLastCalledWith(null);
    // Zooming only the amount axis says nothing about dates.
    fakePlotly.emit('plotly_relayout', { 'yaxis.range[0]': -4, 'yaxis.range[1]': -2 });
    expect(zoom).toHaveBeenCalledTimes(2);
  });
});

describe('the contract', () => {
  test('title, caption, a summary that counts each status, and the zoom tool bar', async () => {
    current.snapshot = { snapshotDate: '2026-10-05', source: 'Test source', sourceUrl: '', illustrative: false } as SnapshotInfo;
    const { config } = await draw();
    expect(screen.getByRole('heading', { level: 2, name: 'Transactions over time' })).toBeInTheDocument();
    expect(screen.getByText('Data: Test source, snapshot of 5 Oct 2026 · times in UTC')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /from 16 May 2024 to 19 Oct 2026, by amount on a log scale: 3 unusual, 364 not unusual, 10 not scored\./ })).toBeInTheDocument();
    expect(config.displayModeBar).toBe(true);
  });

  test('while later pages are still arriving, the caption says how many are drawn', async () => {
    await draw({ loading: { loaded: 200, total: 377 } });
    expect(screen.getByText(/loading, 200 of 377 drawn/)).toBeInTheDocument();
  });

  test('the table view lists every transaction oldest first, with links, the status in words and CSV', async () => {
    await draw();
    await userEvent.setup().click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Time (UTC)', 'Direction', 'Amount', 'Score', 'Status', 'Main reason']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(377);
    expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', expect.stringMatching(/#\/address\/.+\/day\/2024-05-16\/tx\/[0-9a-f]{64}$/));
    const unusual = rows.find((r) => within(r).queryByText('Unusual'))!;
    expect(unusual).toHaveTextContent('Smaller amount relative to the usual for this direction');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  test('the PNG is named from the chart, the address and the snapshot date', async () => {
    current.snapshot = { snapshotDate: '2026-10-05', source: 'Test source', sourceUrl: '', illustrative: false } as SnapshotInfo;
    await draw();
    const button = await screen.findByRole('button', { name: 'Download PNG' });
    await waitFor(() => expect(button).toBeEnabled());
    button.click();
    await waitFor(() => expect(fakePlotly.api.downloadImage).toHaveBeenCalled());
    expect((fakePlotly.api.downloadImage as ReturnType<typeof vi.fn>).mock.calls[0][1].filename).toBe(`transactions-over-time_${ex.mainAddress}_2026-10-05`);
  });

  test('no banned word anywhere in the chart or its table', async () => {
    const { traces, layout } = await draw();
    expect(JSON.stringify({ traces, layout }) + document.body.textContent).not.toMatch(new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i'));
  });
});
