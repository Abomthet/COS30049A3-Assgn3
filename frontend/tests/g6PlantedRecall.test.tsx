// G6 draws E11's recall on planted test transactions: a bar for each pattern of each method, with its
// 95% interval, and a diamond for the mean. Every number is the service's, so these tests read the figure Plotly gets
// and compare it with E11.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { METHODS_ANSWER } from '../src/api/mock/fixtures';
import { G6PlantedRecall } from '../src/charts/G6PlantedRecall';
import { formatInterval } from '../src/lib/format';
import { fakePlotly } from './plotlyFake';

const methods = METHODS_ANSWER.methods;

async function draw() {
  render(<G6PlantedRecall methods={methods} />);
  await waitFor(() => expect(fakePlotly.chartDraws().length).toBeGreaterThan(0));
  const { data, layout, config } = fakePlotly.lastChartDraw();
  const [spike, burst, dormant, mean] = data as any[];
  return { spike, burst, dormant, mean, layout, config };
}

describe('the bars', () => {
  test('three bar traces, one for each planted pattern, with E11\'s recall for every method and its interval as the error bar', async () => {
    const { spike, burst, dormant } = await draw();
    for (const [trace, pattern] of [[spike, 'spike'], [burst, 'burst'], [dormant, 'dormant']] as const) {
      const results = methods.map((m) => m.evaluation.recallByPattern[pattern]);
      expect(trace.type).toBe('bar');
      expect(trace.x).toHaveLength(methods.length);
      expect(trace.y).toEqual(results.map((r) => r.value));
      expect(trace.error_y.symmetric).toBe(false);
      trace.y.forEach((value: number, i: number) => {
        expect(value + trace.error_y.array[i]).toBeCloseTo(results[i].ciHigh, 12);
        expect(value - trace.error_y.arrayminus[i]).toBeCloseTo(results[i].ciLow, 12);
      });
    }
  });

  test('the groups are side by side, and the methods are named as E11 names them', async () => {
    const { spike, layout } = await draw();
    expect(layout.barmode).toBe('group');
    methods.forEach((m, i) => expect(spike.x[i].replace(/<br>/g, ' ')).toBe(m.name));
  });

  test('a diamond marks each method\'s mean recall, with its interval', async () => {
    const { mean } = await draw();
    expect(mean).toMatchObject({ type: 'scatter', mode: 'markers', name: 'Mean of the three' });
    expect(mean.y).toEqual(methods.map((m) => m.evaluation.meanRecall.value));
    expect(mean.marker.symbol).toBe('diamond');
    expect(mean.hovertext[0]).toContain(formatInterval(methods[0].evaluation.meanRecall));
  });

  test('the patterns differ by hatching as well as by colour', async () => {
    const { spike, burst, dormant } = await draw();
    const shapes = [spike, burst, dormant].map((t) => t.marker.pattern.shape);
    expect(new Set(shapes).size).toBe(3);
  });
});

describe('the contract', () => {
  test('both axes are labelled, the scale is a share from 0 and the caption says it is not about real activity', async () => {
    const { layout } = await draw();
    expect(layout.xaxis.title.text).toBe('Method');
    expect(layout.yaxis.title.text).toBe('Planted transactions flagged');
    expect(layout.yaxis.range[0]).toBe(0);
    expect(layout.yaxis.tickformat).toBe('.0%');
    expect(screen.getByRole('heading', { level: 2, name: 'How often each method catches each planted pattern' })).toBeInTheDocument();
    expect(screen.getByText(/Measured on planted test transactions .* not on real activity, which has no labels/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Grouped bar chart of the share of planted test transactions flagged by each of 9 methods/ })).toBeInTheDocument();
  });

  test('the table view repeats every interval, and PNG and CSV can be downloaded', async () => {
    const user = userEvent.setup();
    await draw();
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'How often each method catches each planted pattern' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Method', 'All three patterns', 'Spike', 'Burst', 'Dormant']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(methods.length);
    methods.forEach((m, i) => {
      expect(within(rows[i]).getByRole('rowheader')).toHaveTextContent(m.name);
      expect(within(rows[i]).getAllByRole('cell').map((c) => c.textContent)).toEqual([
        formatInterval(m.evaluation.meanRecall),
        formatInterval(m.evaluation.recallByPattern.spike),
        formatInterval(m.evaluation.recallByPattern.burst),
        formatInterval(m.evaluation.recallByPattern.dormant),
      ]);
    });
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PNG' })).toBeEnabled());
  });

  test('on a phone the names are not wrapped but turned', async () => {
    expect((await draw()).layout.xaxis.tickangle).toBe(0);
    cleanup();
    fakePlotly.reset();
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390 } as DOMRect);
    const { layout, spike } = await draw();
    expect(layout.xaxis.tickangle).toBe(-60);
    expect(spike.x[0]).toBe(methods[0].name);
  });
});
