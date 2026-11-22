// The plan's chart contract (NFR-01) on every screen that draws a chart: V2 (G1, G2), V3 (G3, G4), V4 (G5) and the
// models screen (G6). Each chart has a title, a label on both axes and a footnote with its source and date (or the live
// wording, or the test-results wording for G6); no caption carries "Data:", "days in UTC", "times in UTC" or "flagged by";
// and the picture a chart exports carries its title and that same footnote.
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { exportLayout } from '../src/charts/chartFigure';
import type { ChartPalette } from '../src/charts/chartTheme';
import { snapshotCaption } from '../src/charts/caption';
import { noteOrigin } from '../src/lib/liveOrigin';
import { fakePlotly } from './plotlyFake';

const SNAPSHOT_FOOTNOTE = /^Blockstream Esplora · snapshot of \d{1,2} \w{3} \d{4}$/;
const G6_FOOTNOTE = 'Bars show the 95% range.';

const ROUTES: Array<{ name: string; hash: string; titles: string[]; footnote: (text: string) => boolean }> = [
  { name: 'V2 overview (G1)', hash: `#/address/${ex.mainAddress}`, titles: ['Transactions per day'], footnote: (t) => SNAPSHOT_FOOTNOTE.test(t) },
  { name: 'V2 transactions (G2)', hash: `#/address/${ex.mainAddress}/transactions`, titles: ['Transactions over time'], footnote: (t) => SNAPSHOT_FOOTNOTE.test(t) },
  {
    name: 'V3 transaction (G3, G4)',
    hash: `#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}`,
    titles: ['How this transaction compares with usual', 'Where each model ranks it'],
    footnote: (t) => SNAPSHOT_FOOTNOTE.test(t),
  },
  { name: 'V4 what-if (G5)', hash: `#/address/${ex.mainAddress}/what-if?direction=out`, titles: ['How the score changes with the amount'], footnote: (t) => SNAPSHOT_FOOTNOTE.test(t) },
  { name: 'Models (G6)', hash: '#/models', titles: ['How often each model catches a test pattern'], footnote: (t) => t === G6_FOOTNOTE },
];

describe('every chart keeps the contract: title, labelled axes, footnote', () => {
  for (const route of ROUTES) {
    test(route.name, async () => {
      window.location.hash = route.hash;
      render(<App />);
      for (const title of route.titles) {
        const heading = await screen.findByRole('heading', { name: title }, { timeout: 4000 });
        const figure = heading.closest('figure.pchart') as HTMLElement;
        // The footnote is one line under the chart with the source and the date; it waits for the snapshot to be known.
        await waitFor(() => expect(route.footnote(figure.querySelector('.pchart-footnote')!.textContent ?? '')).toBe(true), { timeout: 4000 });
        expect(figure.querySelector('.pchart-footnote')!.textContent).not.toMatch(/Data:|days in UTC|times in UTC|flagged by/);
        expect(figure.querySelector('.pchart-head .pchart-footnote')).toBeNull();
        await waitFor(() => expect(fakePlotly.chartDraws().some((d) => d.el.closest('figure') === figure)).toBe(true), { timeout: 4000 });
        const draw = fakePlotly.chartDraws().filter((d) => d.el.closest('figure') === figure).at(-1)!;
        expect(draw.layout.xaxis.title.text).toMatch(/\S/);
        expect(draw.layout.yaxis.title.text).toMatch(/\S/);
      }
      expect(document.body.textContent).not.toMatch(/Data: |days in UTC · |times in UTC · /);
    });
  }
});

describe('the footnote wording', () => {
  test('a snapshot, an illustrative snapshot and a live address', () => {
    const snapshot = { snapshotDate: '2026-10-22', source: 'Blockstream Esplora', sourceUrl: '', illustrative: false } as Parameters<typeof snapshotCaption>[0];
    expect(snapshotCaption(snapshot)).toBe('Blockstream Esplora · snapshot of 22 Oct 2026');
    expect(snapshotCaption({ ...snapshot!, illustrative: true })).toBe('Blockstream Esplora · snapshot of 22 Oct 2026 · illustrative data');
    noteOrigin({ address: 'bc1qlive', live: { fetchedAt: '2026-11-21T10:00:00Z' } } as Parameters<typeof noteOrigin>[0]);
    expect(snapshotCaption(snapshot, 'bc1qlive')).toBe('Live data from the public blockchain service · fetched 21 Nov 2026');
    noteOrigin({ address: 'bc1qlive', live: null } as Parameters<typeof noteOrigin>[0]);
  });

  test('the exported picture carries the title and the same footnote, and keeps the chart\'s own notes', () => {
    const palette = { surface: '#fff', text: '#000', axisInk: '#444' } as ChartPalette;
    const layout = exportLayout({ annotations: [{ text: 'usual' }] }, palette, 'Transactions per day', 'Blockstream Esplora · snapshot of 22 Oct 2026', 'Orange bars (▲) are days with an unusual transaction.') as any;
    expect(layout.title.text).toBe('<b>Transactions per day</b>');
    expect(layout.title.subtitle.text).toBe('Orange bars (▲) are days with an unusual transaction.');
    expect(layout.annotations.map((a: { text: string }) => a.text)).toEqual(['usual', 'Blockstream Esplora · snapshot of 22 Oct 2026']);
    // No subtitle: no empty subtitle line is drawn.
    expect((exportLayout({}, palette, 'T', 'Bars show the 95% range.') as any).title.subtitle).toBeUndefined();
  });
});
