import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockApi } from '../src/api/mock/mockApi';
import ex from '../src/api/mock/fixtures/examples.json';
import type { FeatureDetail, SnapshotInfo } from '../src/api/types';
import { G3FeatureDeviation } from '../src/charts/G3FeatureDeviation';
import { CONFIG } from '../src/api/mock/fixtures';
import { settings } from '../src/lib/settings';
import { formatFeatureValue, formatZ } from '../src/lib/format';
import { fakePlotly } from './plotlyFake';

// G3 draws one transaction's robust z for each feature. The flag line and the units come from E2 (the
// settings), and the feature names from the response, so these tests change both and read the figure
// Plotly gets.

const thresholds = { flagAbsZ: 4.25, contributingAbsZ: 1.5 };
const current = { thresholds: thresholds as typeof thresholds | null, features: CONFIG.features, snapshot: null as SnapshotInfo | null };

vi.mock('../src/hooks/useSettings', async () => {
  const { BUNDLED_SETTINGS: bundled } = await import('../src/lib/settings');
  return { useSettings: () => ({ settings: { ...bundled, ...current }, origin: 'service' }) };
});

const feature = (over: Partial<FeatureDetail> & Pick<FeatureDetail, 'id' | 'name'>): FeatureDetail => ({
  description: 'what it measures',
  value: 1,
  usual: 1,
  z: 0,
  role: 'within-usual',
  ...over,
});

async function draw(features: FeatureDetail[]) {
  render(<G3FeatureDeviation features={features} address={ex.mainAddress} />);
  await waitFor(() => expect(fakePlotly.chartDraws().length).toBeGreaterThan(0));
  const { data, layout, config } = fakePlotly.lastChartDraw();
  const [bars, ...keys] = data as any[];
  return { bars, keys, layout, config };
}

beforeEach(() => {
  current.thresholds = thresholds;
  current.features = CONFIG.features;
  current.snapshot = null;
});

describe('the bars', () => {
  test('one horizontal bar per feature, from 0 to its robust z, in the order the response gives', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    const { bars, layout } = await draw(tx.features);
    expect(bars).toMatchObject({ type: 'bar', orientation: 'h' });
    expect(bars.x).toEqual(tx.features.map((f) => f.z));
    expect(bars.y).toHaveLength(tx.features.length);
    // The first feature is at the top.
    expect(layout.yaxis.autorange).toBe('reversed');
  });

  test('names come from the response, never from the chart: a renamed feature is a renamed row', async () => {
    const { bars } = await draw([feature({ id: 'F1', name: 'Zebra amount', z: 1.2 })]);
    expect(bars.y[0]).toContain('Zebra amount');
  });

  test('each row says its role in words, and the colour only repeats it', async () => {
    const TOKENS: Record<string, string> = { '--series-1': 'blue', '--series-2': 'orange', '--bar-neutral': 'grey' };
    vi.spyOn(window, 'getComputedStyle').mockImplementation(() => ({ getPropertyValue: (token: string) => TOKENS[token] ?? '' }) as CSSStyleDeclaration);
    const { bars } = await draw([
      feature({ id: 'F1', name: 'Size', z: 5.9, role: 'flag' }),
      feature({ id: 'F2', name: 'Burst', z: 2.4, role: 'contributing' }),
      feature({ id: 'F3', name: 'Gap', z: 0.2, role: 'within-usual' }),
      feature({ id: 'F4', name: 'Relative size', z: null, role: 'no-comparison', value: null, usual: null }),
    ]);
    expect(bars.y).toEqual([
      'Size<br><i>▲ flag level</i>',
      'Burst<br><i>contributing</i>',
      'Gap<br><i>within usual</i>',
      'Relative size<br><i>no comparison</i>',
    ]);
    // Orange for flag, blue for contributing, grey for the rest (the palette comes from the CSS tokens).
    expect(bars.marker.color).toEqual(['orange', 'blue', 'grey', 'grey']);
  });

  test('the hover reads like the plan: feature, value, usual value and z', async () => {
    const f = feature({ id: 'F1', name: 'Size', value: 0.05, usual: 0.000525, z: 5.9, role: 'flag' });
    const { bars } = await draw([f]);
    expect(bars.hovertext[0]).toBe('Size: 0.05000000 BTC, against a usual 0.00052500 BTC (z +5.9)');
    expect(bars.hoverinfo).toBe('text');
  });

  test('a feature with no comparison has no bar and says so in its row', async () => {
    const { bars, layout } = await draw([feature({ id: 'F4', name: 'Relative size', z: null, role: 'no-comparison', value: null, usual: null })]);
    expect(bars.x).toEqual([null]);
    expect(bars.text).toEqual(['']);
    expect(layout.annotations).toHaveLength(1);
    expect(layout.annotations[0]).toMatchObject({ text: 'no comparison', x: 0, y: bars.y[0] });
    expect(bars.hovertext[0]).toMatch(/^Relative size: no comparison/);
  });

  test('a z beyond 20 is drawn at the edge with an arrow, and still shows its real value', async () => {
    const { bars, layout } = await draw([
      feature({ id: 'F1', name: 'Size', z: 31.4, role: 'flag' }),
      feature({ id: 'F2', name: 'Burst', z: -26, role: 'flag' }),
      feature({ id: 'F3', name: 'Gap', z: 19.5, role: 'flag' }),
    ]);
    expect(bars.x).toEqual([20, -20, 19.5]);
    expect(bars.text).toEqual([`${formatZ(31.4)} ▶`, `◀ ${formatZ(-26)}`, formatZ(19.5)]);
    expect(bars.hovertext[0]).toMatch(/Drawn at the edge/);
    expect(bars.hovertext[2]).not.toMatch(/Drawn at the edge/);
    // The axis leaves room for the label past the edge.
    expect(layout.xaxis.range[1]).toBeGreaterThan(20);
  });
});

describe('the threshold lines', () => {
  test('the flag line is drawn at plus and minus flagAbsZ from the settings', async () => {
    const { layout } = await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    const lines = layout.shapes.filter((s: any) => s.type === 'line');
    expect(lines.map((s: any) => s.x0).sort((a: number, b: number) => a - b)).toEqual([-4.25, 4.25]);
    // Dashed, running the height of the plot.
    expect(lines.every((s: any) => s.line.dash === 'dash' && s.y0 === 0 && s.y1 === 1 && s.yref === 'paper')).toBe(true);
  });

  test('a shaded band marks plus and minus contributingAbsZ', async () => {
    const { layout } = await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    const band = layout.shapes.find((s: any) => s.type === 'rect');
    expect([band.x0, band.x1]).toEqual([-1.5, 1.5]);
    expect(band.layer).toBe('below');
  });

  test('the legend names both marks with the numbers from the settings', async () => {
    const { keys } = await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    expect(keys.map((k: any) => k.name)).toEqual(['Within ±1.5: does not stand out', 'Flag line, ±4.25']);
    expect(keys.every((k: any) => k.hoverinfo === 'skip')).toBe(true);
  });

  test('with the service unreachable no flag line is drawn: no lines, no band, no legend', async () => {
    current.thresholds = null;
    const { layout, keys } = await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    expect(layout.shapes).toEqual([]);
    expect(keys).toEqual([]);
  });

  test('the line is the one E2 reports, not the 3.5 of settings.json (D-W-10)', async () => {
    current.thresholds = CONFIG.thresholds;
    const { layout } = await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    expect(layout.shapes.filter((s: any) => s.type === 'line').map((s: any) => s.x0).sort((a: number, b: number) => a - b)).toEqual([-5, 5]);
    expect(settings.baseline.flagAbsZ).toBe(3.5);
  });

  test('the axis always shows the flag line, even when every bar is short', async () => {
    const { layout } = await draw([feature({ id: 'F1', name: 'Size', z: 0.3 })]);
    expect(layout.xaxis.range[1]).toBeGreaterThan(4.25);
    expect(layout.xaxis.range[0]).toBeLessThan(-4.25);
  });
});

describe('the contract', () => {
  test('both axes are labelled, nothing zooms and there is no tool bar', async () => {
    const { layout, config } = await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    expect(layout.xaxis.title.text).toMatch(/^Robust z-score/);
    expect(layout.yaxis.title.text).toBe('Feature');
    expect(layout.xaxis.fixedrange).toBe(true);
    expect(layout.yaxis.fixedrange).toBe(true);
    expect(config.displayModeBar).toBe(false);
  });

  test('title, caption and a text summary that names every feature', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    await draw(tx.features);
    expect(screen.getByRole('heading', { name: 'How this transaction compares with usual' })).toBeInTheDocument();
    expect(screen.getByText(/Data: .*compared with this address's own earlier transactions/)).toBeInTheDocument();
    const img = screen.getByRole('img', { name: /Distance from usual for each feature \(robust z-score\)/ });
    for (const f of tx.features) expect(img.getAttribute('aria-label')).toContain(`${f.name} ${formatZ(f.z!)}`);
  });

  test('the table under the chart repeats every number, with the role, and offers CSV', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    await draw(tx.features);
    const table = screen.getByRole('table');
    expect(table.closest('.sr-only')).toBeNull();
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Feature', 'This transaction', 'Usual', 'z', 'Role']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(tx.features.length);
    tx.features.forEach((f, i) => {
      const cells = within(rows[i]).getAllByRole('cell').map((c) => c.textContent);
      const unit = CONFIG.features.find((u) => u.id === f.id)!.unit;
      expect(cells[0]).toBe(formatFeatureValue(f.value, unit));
      expect(cells[1]).toBe(formatFeatureValue(f.usual, unit));
      expect(cells[2]).toBe(f.z === null ? '—' : formatZ(f.z));
      expect(within(rows[i]).getByRole('rowheader')).toHaveTextContent(f.name);
    });
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  test('every cell names its column, so the phone layout can stack a row as a card instead of clipping the last column', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    await draw(tx.features);
    const cells = within(screen.getAllByRole('row')[1]).getAllByRole('cell');
    expect(cells.map((c) => c.getAttribute('data-label'))).toEqual(['This transaction', 'Usual', 'z', 'Role']);
  });

  test('units come from E2 by feature, and a unit not yet known shows the bare number', async () => {
    const f = feature({ id: 'F3', name: 'Gap', value: 47.9230555556, usual: 144.151944444, z: -1.8 });
    await draw([f]);
    expect(within(screen.getByRole('table')).getAllByRole('cell').map((c) => c.textContent).slice(0, 2)).toEqual(['48 hours', '6 days']);
    cleanup();
    current.features = [];
    await draw([f]);
    expect(within(screen.getByRole('table')).getAllByRole('cell').map((c) => c.textContent).slice(0, 2)).toEqual(['47.9', '144']);
  });

  test('the PNG is named from the chart, the address and the snapshot date', async () => {
    current.snapshot = { snapshotDate: '2026-10-05', source: 'Test source', sourceUrl: '', illustrative: false } as SnapshotInfo;
    await draw([feature({ id: 'F1', name: 'Size', z: 2 })]);
    const button = await screen.findByRole('button', { name: 'Download PNG' });
    await waitFor(() => expect(button).toBeEnabled());
    button.click();
    await waitFor(() => expect(fakePlotly.api.downloadImage).toHaveBeenCalled());
    const options = (fakePlotly.api.downloadImage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.filename).toBe(`feature-deviation_${ex.mainAddress}_2026-10-05`);
    expect(screen.getByText('Data: Test source, snapshot of 5 Oct 2026 · compared with this address\'s own earlier transactions')).toBeInTheDocument();
  });

  test('no banned word anywhere in the chart or its table', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    const { bars, keys, layout } = await draw(tx.features);
    const text = JSON.stringify({ bars, keys, layout }) + document.body.textContent;
    expect(text).not.toMatch(new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i'));
  });
});
