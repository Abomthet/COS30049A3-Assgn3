import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { WHAT_IF_RECORDED } from '../src/api/mock/fixtures';
import type { MethodId, WhatIfCurve } from '../src/api/types';
import { G5WhatIfResponse } from '../src/charts/G5WhatIfResponse';
import { crossings, flaggedRuns } from '../src/lib/curve';
import { formatBtc } from '../src/lib/format';
import { fakePlotly } from './plotlyFake';

// G5 draws the score of one method against the amount. The curve is the recorded E9 answer for the
// running example (sent amounts), so the numbers below are the service's own.

const curve = WHAT_IF_RECORDED.curves[0].body as WhatIfCurve;
const baseline = curve.methods.find((m) => m.id === 'baseline')!;
const ADDRESS = curve.address;

interface Over {
  curve?: WhatIfCurve;
  methodId?: MethodId;
  marker?: Parameters<typeof G5WhatIfResponse>[0]['marker'];
  onPickAmount?: (btc: number) => void;
  onMethodChange?: (id: MethodId) => void;
}

async function draw(over: Over = {}) {
  render(
    <G5WhatIfResponse
      curve={over.curve ?? curve}
      address={ADDRESS}
      methodId={over.methodId ?? 'baseline'}
      onMethodChange={over.onMethodChange ?? (() => {})}
      marker={over.marker ?? null}
      onPickAmount={over.onPickAmount ?? (() => {})}
    />,
  );
  await waitFor(() => expect(fakePlotly.chartDraws().length).toBeGreaterThan(0));
  const { data, layout, config } = fakePlotly.lastChartDraw();
  return { data: data as any[], layout, config };
}

describe('the curve', () => {
  test('is one line of the method\'s score against the amount, on a log amount axis with labelled axes', async () => {
    await draw();
    // The method's name comes from E11 (useMethods), which can answer after the first draw; the chart then
    // redraws with it. Wait for that redraw rather than reading whichever draw came first (flaky under load).
    await waitFor(() => expect(fakePlotly.lastChartDraw().layout.yaxis.title.text).toBe(`Score of ${baseline.name}`));
    const { data, layout } = fakePlotly.lastChartDraw() as { data: any[]; layout: any };
    expect(data[0]).toMatchObject({ type: 'scatter', mode: 'lines+markers', x: curve.amountsBtc, y: baseline.scores });
    expect(layout.xaxis).toMatchObject({ type: 'log', title: { text: 'Amount (BTC, log scale)' } });
    expect(layout.showlegend).toBe(true);
  });

  test('the amount labels are chosen for the room there is, and the same labels are never crowded at any width', async () => {
    // A phone, and the chart card beside the form on a desktop, where it is about 700 px wide.
    const widths = [340, 700, 1280];
    const ticks: number[][] = [];
    for (const width of widths) {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width } as DOMRect);
      fakePlotly.reset();
      document.body.innerHTML = '';
      const { layout } = await draw();
      expect(layout.xaxis.tickmode).toBe('array');
      ticks.push(layout.xaxis.tickvals);
      vi.restoreAllMocks();
    }
    // A wider chart has at least as many labels as a narrower one; the five decades in a 700 px card get only the powers of ten
    // (1, 2 and 5 of each is what collided), and a phone fewer still.
    expect(ticks[0].length).toBeLessThan(ticks[1].length);
    expect(ticks[1].length).toBeLessThanOrEqual(ticks[2].length);
    expect(ticks[1]).toEqual([0.00001, 0.0001, 0.001, 0.01, 0.1]);
  });

  test('a crossing near either end of the curve labels itself towards the middle, so it is not cut off', async () => {
    const { data } = await draw();
    const marks = data.find((t) => t.name === 'Crosses the flag line');
    expect(marks.textposition).toEqual(['top right', 'top left']);
  });

  test('flagged amounts are orange triangles and the others blue circles, so the shape says it as well as the colour', async () => {
    const { data } = await draw();
    expect(data[0].marker.symbol).toEqual(baseline.flags.map((f) => (f ? 'triangle-up' : 'circle')));
  });

  test('a dashed line sits at the method\'s flag line and the flagged stretches are shaded', async () => {
    const { layout } = await draw();
    const line = layout.shapes.find((s: any) => s.type === 'line' && s.yref === 'y');
    expect(line).toMatchObject({ y0: baseline.threshold, y1: baseline.threshold, line: { dash: 'dash' } });
    const shaded = layout.shapes.filter((s: any) => s.type === 'rect');
    expect(shaded).toHaveLength(flaggedRuns(baseline.flags).length);
    // The baseline flags the smallest and the largest amounts here: one stretch from each edge.
    expect(shaded[0].x0).toBe(curve.amountsBtc[0]);
    expect(shaded[shaded.length - 1].x1).toBe(curve.amountsBtc[curve.amountsBtc.length - 1]);
  });

  test('every place the curve meets the flag line is marked, with its amount in words', async () => {
    const { data } = await draw();
    const marks = data.find((t) => t.name === 'Crosses the flag line');
    const expected = crossings({ amounts: curve.amountsBtc, scores: baseline.scores, flags: baseline.flags, threshold: baseline.threshold });
    expect(expected).toHaveLength(2);
    expect(marks.x).toEqual(expected);
    expect(marks.y).toEqual([baseline.threshold, baseline.threshold]);
    expect(marks.text.every((t: string) => /BTC$/.test(t))).toBe(true);
  });

  test('the usual amount is a dotted vertical line, and is left out when the amounts were given', async () => {
    const { layout } = await draw();
    expect(layout.shapes.find((s: any) => s.x0 === curve.usualBtc && s.line.dash === 'dot')).toBeDefined();
    // The label sits on the line: an annotation on a log axis is placed by the logarithm.
    expect(layout.annotations.find((a: any) => a.text === 'usual').x).toBeCloseTo(Math.log10(curve.usualBtc!), 10);
    fakePlotly.reset();
    document.body.innerHTML = '';
    const ranged = WHAT_IF_RECORDED.curves[4].body as WhatIfCurve;
    const second = await draw({ curve: ranged });
    expect(second.layout.shapes.some((s: any) => s.line?.dash === 'dot')).toBe(false);
    expect(second.data.some((t) => t.name === 'Usual amount')).toBe(false);
  });

  test('the legend names the flag line with its value', async () => {
    const { data } = await draw();
    expect(data.map((t) => t.name)).toContain(`Flag line, ${baseline.threshold.toFixed(2)}`);
  });
});

describe('the amount in the form', () => {
  test('is a diamond on the curve; E8\'s own score is used when it has answered', async () => {
    const answer = { scores: { baseline: 5.9755 }, flags: { baseline: true } };
    const { data } = await draw({ marker: { amountBtc: 0.05, answer } });
    const mark = data.find((t) => t.name === 'Amount in the form');
    expect(mark).toMatchObject({ x: [0.05], y: [5.9755], marker: { symbol: 'diamond' } });
  });

  test('before E8 answers it sits where the curve passes, outlined when that amount is not flagged', async () => {
    const { data } = await draw({ marker: { amountBtc: curve.usualBtc!, answer: null } });
    const mark = data.find((t) => t.name === 'Amount in the form');
    expect(mark.marker.symbol).toBe('diamond-open');
    expect(mark.y[0]).toBeGreaterThan(0);
    expect(mark.y[0]).toBeLessThan(baseline.threshold);
  });

  test('is not drawn when it is outside the curve and E8 has not answered', async () => {
    const { data } = await draw({ marker: { amountBtc: 1000, answer: null } });
    expect(data.some((t) => t.name === 'Amount in the form')).toBe(false);
  });
});

describe('interaction', () => {
  test('a menu switches the method, and each has its own flag line', async () => {
    const onMethodChange = vi.fn();
    const user = userEvent.setup();
    await draw({ onMethodChange });
    const menu = screen.getByLabelText('Model drawn');
    expect(within(menu).getAllByRole('option')).toHaveLength(curve.methods.length);
    expect(screen.getByRole('option', { name: /Baseline.*\(deciding\)/ })).toBeInTheDocument();
    await user.selectOptions(menu, 'kmeans');
    expect(onMethodChange).toHaveBeenCalledWith('kmeans');
  });

  test('another method is drawn with its own scores and flag line', async () => {
    const kmeans = curve.methods.find((m) => m.id === 'kmeans')!;
    const { data, layout } = await draw({ methodId: 'kmeans' });
    expect(data[0].y).toEqual(kmeans.scores);
    expect(layout.shapes.find((s: any) => s.yref === 'y').y0).toBe(kmeans.threshold);
  });

  test('selecting a point of the curve reports its amount; a click on anything else does nothing', async () => {
    const onPickAmount = vi.fn();
    await draw({ onPickAmount });
    fakePlotly.emit('plotly_click', { points: [{ curveNumber: 0, pointNumber: 3 }] });
    expect(onPickAmount).toHaveBeenCalledWith(curve.amountsBtc[3]);
    fakePlotly.emit('plotly_click', { points: [{ curveNumber: 1, pointNumber: 0 }] });
    expect(onPickAmount).toHaveBeenCalledTimes(1);
  });

  test('the keyboard walks the amounts and Enter uses one', async () => {
    const onPickAmount = vi.fn();
    const user = userEvent.setup();
    await draw({ onPickAmount });
    const group = screen.getByRole('group', { name: /Line chart of the Baseline.* score/ });
    group.focus();
    await user.keyboard('{Home}{ArrowRight}{ArrowRight}{Enter}');
    expect(onPickAmount).toHaveBeenCalledWith(curve.amountsBtc[2]);
  });
});

describe('the words around it', () => {
  test('the reading under the curve is a big number: Flagged from the amount, and below the low amount', async () => {
    await draw();
    const stat = screen.getByTestId('curve-reading');
    expect(stat).toHaveClass('stat-block');
    expect(stat.querySelector('.stat-label')).toHaveTextContent('Flagged from');
    expect(stat.querySelector('.stat-value')).toHaveTextContent(/^0\.\d+ BTC$/);
    expect(stat.querySelector('.stat-note')).toHaveTextContent(/^and below 0\.0000\d+ BTC$/);
    // The chart's own accessible name still carries the full sentence.
    expect(screen.getByRole('group', { name: /On this address, a sent amount would be flagged from about .* upwards, and below about / })).toBeInTheDocument();
  });

  test('the four readings of the curve: nothing, everything, only the top, only the middle', async () => {
    const withFlags = (flags: boolean[]) => ({ ...curve, methods: curve.methods.map((m) => ({ ...m, flags })) });
    const n = curve.amountsBtc.length;
    const run = (from: number, to: number) => Array.from({ length: n }, (_, i) => i >= from && i <= to);
    const cases: Array<[boolean[], RegExp | string]> = [
      [run(0, -1), 'No amount in this range is flagged.'],
      [run(0, n - 1), 'Every amount in this range is flagged.'],
      [run(20, n - 1), /^Flagged from 0\.\d+ BTC$/],
      [run(10, 20), /^Flagged between \d[\d.]* BTC and \d[\d.]* BTC$/],
    ];
    for (const [flags, expected] of cases) {
      const { unmount } = render(
        <G5WhatIfResponse curve={withFlags(flags)} address={ADDRESS} methodId="baseline" onMethodChange={() => {}} marker={null} onPickAmount={() => {}} />,
      );
      const stat = screen.getByTestId('curve-reading');
      const text = (stat.querySelector('.stat-label')?.textContent ?? '') + ' ' + stat.querySelector('.stat-value')!.textContent;
      if (typeof expected === 'string') expect(text.trim()).toBe(expected);
      else expect(text.trim()).toMatch(expected);
      expect(stat.querySelector('.stat-note')).toBeNull();
      unmount();
    }
  });

  test('the subtitle, footnote and hint are short; the help is in the closed disclosure; the table line has no chart type', async () => {
    const user = userEvent.setup();
    await draw();
    expect(screen.getByText('Flagged amounts are shaded.')).toBeInTheDocument();
    expect(screen.getByText('Select a point to use that amount.')).toBeInTheDocument();
    expect(document.querySelector('.pchart-footnote')!.textContent).not.toMatch(/Data:|hypothetical|history before/);
    expect((document.querySelector('details.pchart-guide') as HTMLDetailsElement).open).toBe(false);
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    expect(document.querySelector('.pchart-summary')!.textContent).toMatch(/^Scores for sent amounts from [\d.]+ to [\d.]+ BTC \(log scale\)\.$/);
  });

  test('the table view lists every amount with its score and verdict, and downloads as CSV', async () => {
    const user = userEvent.setup();
    await draw();
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const rows = within(screen.getByRole('table', { name: 'How the score changes with the amount' })).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(41);
    expect(rows[0]).toHaveTextContent(formatBtc(Math.round(curve.amountsBtc[0] * 1e8)));
    expect(rows[0]).toHaveTextContent(baseline.scores[0]!.toFixed(2));
    expect(rows[0]).toHaveTextContent(baseline.flags[0] ? 'Flagged' : 'Not flagged');
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  test('PNG export is the wrapper\'s, named from the chart, the address and the direction', async () => {
    const user = userEvent.setup();
    await draw();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PNG' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Download PNG' }));
    await waitFor(() => expect(fakePlotly.api.downloadImage).toHaveBeenCalled());
    expect((fakePlotly.api.downloadImage as any).mock.calls[0][1].filename).toMatch(/^what-if-response_1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz_out/);
  });

  test('says in words when no amount in the range is flagged', async () => {
    const quiet = { ...curve, methods: curve.methods.map((m) => ({ ...m, flags: m.flags.map(() => false) })) };
    await draw({ curve: quiet });
    expect(screen.getByTestId('curve-reading')).toHaveTextContent('No amount in this range is flagged.');
  });
});
