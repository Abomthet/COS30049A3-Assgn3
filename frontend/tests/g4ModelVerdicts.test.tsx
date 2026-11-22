// G4 places this transaction on each method's own rank scale: where its score sits among the address's own scored
// transactions. The ranks, scores and flags are the service's (E7 and E8, recorded), and the names are E11's, which
// arrive in a second request, so a test that reads the figure waits for a draw that carries them.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { METHODS_ANSWER, RECORDED, WHAT_IF_RECORDED } from '../src/api/mock/fixtures';
import { G4ModelVerdicts } from '../src/charts/G4ModelVerdicts';
import type { TransactionDetail, WhatIfResult } from '../src/api/types';
import { METHODS } from '../src/lib/methods';
import { fakePlotly } from './plotlyFake';

const flaggedTx = RECORDED[0].details[ex.flagged.txid].body as TransactionDetail;
const whatIf = WHAT_IF_RECORDED.results.find((r) => r.status === 200)!.body as WhatIfResult;
const e11Name = (id: string) => METHODS_ANSWER.methods.find((m) => m.id === id)!.name;

/** The figure drawn once E11's names are in it (the first draw has the short names). */
async function draw(ui: React.ReactElement) {
  render(ui);
  await waitFor(() => {
    const ticks = fakePlotly.lastChartDraw()?.layout.yaxis.ticktext as string[] | undefined;
    expect(ticks?.[0]).toContain(e11Name('baseline'));
  });
  const { data, layout } = fakePlotly.lastChartDraw();
  const trace = (name: RegExp) => (data as any[]).find((t) => name.test(t.name ?? ''));
  return { data: data as any[], layout, trace };
}

const real = (tx: TransactionDetail) => (
  <G4ModelVerdicts ranks={tx.ranks} scores={tx.scores} flags={tx.flags} deciding={tx.method.id} subject="transaction" address={tx.address} txid={tx.txid} />
);

describe('a real transaction (V3)', () => {
  test('one row for each method in the table order, named as E11 names them, grouped by family', async () => {
    const { layout } = await draw(real(flaggedTx));
    expect(layout.yaxis.autorange).toBe('reversed');
    expect(layout.yaxis.tickvals).toEqual(METHODS.map((_, i) => i));
    METHODS.forEach((m, i) => expect(layout.yaxis.ticktext[i]).toContain(e11Name(m.id)));
    // A rule falls between two families, never inside one: statistics | outlier | clustering | regression | combination | language.
    expect(layout.shapes).toHaveLength(5);
  });

  test('every dot sits at its method\'s rank, a flagged one is an orange triangle that says "Flagged", the others blue circles', async () => {
    const { trace } = await draw(real(flaggedTx));
    const flagged = trace(/Flagged/);
    expect(flagged.marker.symbol).toBe('triangle-up');
    expect(flagged.text).toEqual(['Flagged']);
    expect(flagged.x).toEqual([flaggedTx.ranks.baseline]);
    expect(flagged.y).toEqual([0]);
    const plain = trace(/Not flagged/);
    expect(plain.marker.symbol).toBe('circle');
    expect(plain.x).toEqual(METHODS.filter((m) => !flaggedTx.flags[m.id]).map((m) => flaggedTx.ranks[m.id]));
    expect(plain.marker.symbol).not.toBe(flagged.marker.symbol);
  });

  test('the deciding method wears a ring, and the axis runs from 0 to 100%', async () => {
    const { trace, layout } = await draw(real(flaggedTx));
    const ring = trace(/Deciding model/);
    expect(ring.marker.symbol).toBe('circle-open');
    expect(ring.x).toEqual([flaggedTx.ranks[flaggedTx.method.id]]);
    expect(layout.xaxis.tickformat).toBe('.0%');
    expect(layout.xaxis.range[0]).toBeLessThan(0);
    expect(layout.xaxis.range[1]).toBeGreaterThan(1);
    expect(layout.yaxis.ticktext[0]).toContain('<b>');
  });

  test('the caption says each model is compared on its own scale, and the chart has a name for a screen reader', async () => {
    await draw(real(flaggedTx));
    expect(screen.getByRole('heading', { level: 3, name: 'Where each model ranks it' })).toBeInTheDocument();
    expect(screen.getByText(/Each model is compared on its own scale/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Dot plot of where this transaction ranks .* under each of 9 models\. 1 of 9 flag it: Baseline/ })).toBeInTheDocument();
  });

  test('the table view says each verdict in words, with the rank, and PNG and CSV can be downloaded', async () => {
    const user = userEvent.setup();
    await draw(real(flaggedTx));
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'Where each model ranks it' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(9);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent(/Baseline.*Deciding model/);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Statistics', flaggedTx.scores.baseline!.toFixed(2), '100%', 'Flagged']);
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('Not flagged');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PNG' })).toBeEnabled());
  });
});

describe('a hypothetical transaction (V4)', () => {
  const lab = (
    <G4ModelVerdicts ranks={whatIf.ranks} scores={whatIf.scores} flags={whatIf.flags} deciding={whatIf.method.id} subject="what-if" address={RECORDED[0].address} />
  );

  test('TxGPT has no rank and says "Not available" in the chart and the table, with no dot', async () => {
    const user = userEvent.setup();
    const { trace } = await draw(lab);
    const note = trace(/^$/);
    expect(note.mode).toBe('text');
    expect(note.text).toEqual(['Not available']);
    expect(note.y).toEqual([8]);
    for (const dots of [trace(/Not flagged/), trace(/Flagged/)]) expect(dots?.y ?? []).not.toContain(8);
    expect(screen.getByRole('img', { name: /this hypothetical transaction ranks .* under each of 8 models/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const row = screen.getByRole('rowheader', { name: /TxGPT/ }).closest('tr')!;
    expect(row).toHaveTextContent('Not available');
  });
});

describe('where it is used', () => {
  const lastTitled = (title: string) => fakePlotly.chartDraws().filter((d) => d.el.closest('figure')?.querySelector('h3')?.textContent === title).at(-1);

  test('V3 draws it under the verdict table for the transaction that is open, with that transaction\'s ranks', async () => {
    window.location.hash = `#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}`;
    render(<App />);
    expect(await screen.findByRole('heading', { level: 3, name: 'Where each model ranks it' })).toBeInTheDocument();
    await waitFor(() => expect(lastTitled('Where each model ranks it')).toBeDefined());
    const flagged = (lastTitled('Where each model ranks it')!.data as any[]).find((t) => /Flagged/.test(t.name));
    expect(flagged.x).toEqual([flaggedTx.ranks.baseline]);
  });

  test('V4 draws it for the hypothetical transaction once it is scored, and TxGPT is not on it', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    const user = userEvent.setup();
    render(<App />);
    const amount = await screen.findByLabelText('Amount (BTC)');
    await user.clear(amount);
    await user.type(amount, '0.05');
    expect(await screen.findByRole('heading', { level: 3, name: 'Where each model ranks it' }, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /this hypothetical transaction ranks .* under each of 8 models/ })).toBeInTheDocument();
  });
});
