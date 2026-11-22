import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { mockApi } from '../src/api/mock/mockApi';
import ex from '../src/api/mock/fixtures/examples.json';
import type { TimelineResponse } from '../src/api/types';
import { G1DailyActivity } from '../src/charts/G1DailyActivity';
import { dayKey } from '../src/lib/dates';
import { paths } from '../src/lib/router';
import { settings } from '../src/lib/settings';
import { fakePlotly } from './plotlyFake';

// G1 builds its figure from E5's per-day counts. These tests read the figure it passes to
// Plotly: the marks, the range controls, the padding, the click and the keyboard.

const timeline = (address = ex.mainAddress) => mockApi.timeline(address);

async function draw(data: TimelineResponse, onOpenDay = vi.fn()) {
  render(<G1DailyActivity timeline={data} onOpenDay={onOpenDay} />);
  await waitFor(() => expect(fakePlotly.chartDraws().length).toBeGreaterThan(0));
  return { ...fakePlotly.lastChartDraw(), onOpenDay };
}

/** A timeline with the given days (txCount, flaggedCount) and range, for the edge cases. */
function withDays(base: TimelineResponse, days: Array<[string, number, number]>, range?: { start: string; end: string }): TimelineResponse {
  const rows = days.map(([date, txCount, flaggedCount]) => ({ date, txCount, flaggedCount }));
  return { ...base, days: rows, range: range ?? { start: `${rows[0].date}T08:15:00Z`, end: `${rows[rows.length - 1].date}T17:40:00Z` } };
}

describe('the marks', () => {
  test('one bar per active day: ordinary days blue, days with an unusual transaction orange', async () => {
    const data = await timeline(ex.flagged.address);
    const { data: traces } = await draw(data);
    const [ordinary, unusual] = traces as any[];
    expect(ordinary.type).toBe('bar');
    expect(unusual.type).toBe('bar');

    const flagged = data.days.filter((d) => d.flaggedCount > 0);
    expect(unusual.x).toEqual(flagged.map((d) => d.date));
    expect(unusual.y).toEqual(flagged.map((d) => d.txCount));
    expect(ordinary.x).toEqual(data.days.filter((d) => d.flaggedCount === 0).map((d) => d.date));
    // Every transaction is in exactly one bar.
    const total = [...ordinary.y, ...unusual.y].reduce((a: number, b: number) => a + b, 0);
    expect(total).toBe(data.totals.txCount);
    expect(ordinary.customdata).toEqual(ordinary.x);
  });

  test('a day with an unusual transaction also gets a triangle, and the legend says what it means', async () => {
    const data = await timeline(ex.flagged.address);
    const { data: traces } = await draw(data);
    const [, unusual, triangles] = traces as any[];
    expect(triangles).toMatchObject({ type: 'scatter', mode: 'markers', hoverinfo: 'skip', showlegend: false, legendgroup: 'unusual' });
    expect(triangles.marker.symbol).toBe('triangle-up');
    expect(triangles.x).toEqual(unusual.x);
    // Each triangle sits above its bar.
    triangles.y.forEach((y: number, i: number) => expect(y).toBeGreaterThan(unusual.y[i]));
    expect(unusual.name).toMatch(/unusual transaction ▲/);
    expect(unusual.legendgroup).toBe('unusual');
  });

  test('an address with no unusual day has one series, no triangles and so no legend', async () => {
    const data = withDays(await timeline(), [['2026-08-01', 2, 0], ['2026-08-02', 1, 0]]);
    const { data: traces } = await draw(data);
    expect(traces).toHaveLength(1);
  });

  test('the hover gives the day, the counts and the next step in words', async () => {
    const data = withDays(await timeline(), [['2026-08-01', 1, 0], ['2026-08-05', 4, 2]]);
    const { data: traces } = await draw(data);
    const [ordinary, unusual] = traces as any[];
    expect(ordinary.hovertext[0]).toBe('1 Aug 2026 (UTC)<br>1 transaction, none unusual<br>Select to open this day');
    expect(unusual.hovertext[0]).toBe('5 Aug 2026 (UTC)<br>4 transactions, 2 unusual<br>Select to open this day');
    expect(unusual.hoverinfo).toBe('text');
  });

  test('no title, label or tooltip uses a banned word', async () => {
    const data = await timeline(ex.flagged.address);
    const { data: traces, layout } = await draw(data);
    const text = JSON.stringify({ traces, layout }) + document.body.textContent;
    expect(text).not.toMatch(new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i'));
  });
});

describe('the axes and range controls', () => {
  test('both axes carry units, the counts are whole numbers and only dates zoom', async () => {
    const { layout } = await draw(await timeline());
    expect(layout.xaxis).toMatchObject({ type: 'date', title: { text: 'Date (UTC)' } });
    expect(layout.yaxis).toMatchObject({ title: { text: 'Transactions per day' }, rangemode: 'tozero', fixedrange: true, tickformat: ',d' });
  });

  test('a range slider shows the whole history, and Plotly draws no range buttons of its own', async () => {
    const data = await timeline();
    const { layout } = await draw(data);
    const { rangeslider, rangeselector, range } = layout.xaxis;
    expect(rangeselector).toBeUndefined();
    expect(rangeslider.visible).toBe(true);
    expect(rangeslider.range).toEqual(range);
    // E5 gives the range as times; the axis is drawn from their days.
    expect(range[0] <= `${dayKey(data.range.start)} 00:00:00`).toBe(true);
    expect(range[1] >= `${dayKey(data.range.end)} 00:00:00`).toBe(true);
  });

  test('five range buttons count back from the end of the axis, as ordinary buttons', async () => {
    const user = userEvent.setup();
    const { layout } = await draw(withDays(await timeline(), [['2024-01-10', 1, 0], ['2026-08-14', 2, 0]]));
    const group = screen.getByRole('group', { name: 'Zoom to a period' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['1 month', '3 months', '6 months', '1 year', 'All']);
    await waitFor(() => expect(buttons[0]).toBeEnabled());

    const end = layout.xaxis.range[1];
    const relayout = fakePlotly.api.relayout as ReturnType<typeof vi.fn>;
    await user.click(buttons[3]);
    expect(relayout).toHaveBeenLastCalledWith(expect.anything(), { 'xaxis.range': ['2025-08-14 12:00:00', end] });
    await user.click(buttons[0]);
    expect(relayout).toHaveBeenLastCalledWith(expect.anything(), { 'xaxis.range': ['2026-07-14 12:00:00', end] });
    await user.click(buttons[4]);
    expect(relayout).toHaveBeenLastCalledWith(expect.anything(), { 'xaxis.range': layout.xaxis.rangeslider.range });
  });

  test('a period longer than the history stops at the first day', async () => {
    const user = userEvent.setup();
    const { layout } = await draw(withDays(await timeline(), [['2026-07-01', 1, 0], ['2026-08-14', 2, 0]]));
    const buttons = within(screen.getByRole('group', { name: 'Zoom to a period' })).getAllByRole('button');
    await waitFor(() => expect(buttons[0]).toBeEnabled());
    await user.click(buttons[3]);
    expect((fakePlotly.api.relayout as ReturnType<typeof vi.fn>).mock.lastCall![1]['xaxis.range'][0]).toBe(layout.xaxis.range[0]);
  });

  test('a history shorter than 21 days is padded to 21 days, as in the prototype', async () => {
    const data = withDays(await timeline(), [['2026-08-10', 1, 0], ['2026-08-14', 2, 0]]);
    const { layout } = await draw(data);
    const [from, to] = layout.xaxis.range.map((t: string) => Date.parse(`${t.replace(' ', 'T')}Z`));
    expect(Math.round((to - from) / 86_400_000)).toBe(21);
  });

  test('one active day still draws, padded the same way', async () => {
    const { layout, data } = await draw(withDays(await timeline(), [['2026-08-10', 3, 0]]));
    expect((data[0] as any).y).toEqual([3]);
    const [from, to] = layout.xaxis.range.map((t: string) => Date.parse(`${t.replace(' ', 'T')}Z`));
    expect((to - from) / 86_400_000).toBeGreaterThanOrEqual(21);
    // With a maximum of 3 the count axis steps by one.
    expect(layout.yaxis.dtick).toBe(1);
  });

  test('on a phone a long history opens on the last six months while the slider shows all of it', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390 } as DOMRect);
    const days: Array<[string, number, number]> = [['2025-01-02', 1, 0], ['2025-06-01', 2, 1], ['2026-03-01', 1, 0], ['2026-09-30', 5, 0]];
    const { layout } = await draw(withDays(await timeline(), days));
    const [from, to] = layout.xaxis.range;
    expect(to).toBe(layout.xaxis.rangeslider.range[1]);
    expect(from > layout.xaxis.rangeslider.range[0]).toBe(true);
    expect(from.slice(0, 10)).toBe('2026-03-31');
  });

  test('on a desktop the same history opens on all of it', async () => {
    const days: Array<[string, number, number]> = [['2025-01-02', 1, 0], ['2026-09-30', 5, 0]];
    const { layout } = await draw(withDays(await timeline(), days));
    expect(layout.xaxis.range).toEqual(layout.xaxis.rangeslider.range);
  });
});

describe('the words around the chart', () => {
  test('title, subtitle, footnote with source and snapshot date, hint, summary and the visible table line', async () => {
    const data = await timeline(ex.flagged.address);
    await draw(data);
    expect(screen.getByRole('heading', { level: 2, name: 'Transactions per day' })).toBeInTheDocument();
    expect(screen.getByText('Orange bars (▲) are days with an unusual transaction.')).toBeInTheDocument();
    // The footnote is the source and the date, with no "Data:", no "days in UTC" and no model name.
    expect(screen.getByText('Blockstream Esplora · snapshot of 22 Oct 2026')).toBeInTheDocument();
    expect(document.querySelector('.pchart-footnote')!.textContent).not.toMatch(/Data:|days in UTC|flagged by/);
    const flaggedDays = data.days.filter((d) => d.flaggedCount > 0).length;
    expect(screen.getByRole('group', { name: new RegExp(`Bar chart of transactions per day from .*: ${data.days.length} days with activity, ${flaggedDays} days with unusual transactions`) })).toBeInTheDocument();
    expect(screen.getByText('Select a bar to open that day.')).toBeInTheDocument();
    // The zoom and keyboard help is in the closed disclosure, not under the chart.
    expect(screen.queryByText(/Drag to zoom, double-click/, { selector: '.chart-hint' })).toBeNull();
    expect((document.querySelector('details.pchart-guide') as HTMLDetailsElement).open).toBe(false);
  });

  test('the line above the table says how many days, with no chart type, and the legend is in plain words', async () => {
    const user = userEvent.setup();
    const data = await timeline(ex.flagged.address);
    const { data: traces } = await draw(data);
    const flaggedDays = data.days.filter((d) => d.flaggedCount > 0).length;
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const line = document.querySelector('.pchart-summary')!.textContent!;
    expect(line).toMatch(new RegExp(`^${data.days.length} days with activity, ${flaggedDays} with unusual transactions, \\d+ \\w+ \\d{4} – \\d+ \\w+ \\d{4}\\.$`));
    expect(line).not.toMatch(/chart of/i);
    expect((traces as any[]).filter((t) => t.name).map((t) => t.name)).toEqual(['No unusual transaction', 'Has an unusual transaction ▲']);
  });

  test('the table lists every active day with a link to its day view', async () => {
    const user = userEvent.setup();
    const data = await timeline(ex.flagged.address);
    await draw(data);
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    const table = screen.getByRole('table', { name: 'Transactions per day' });
    expect(within(table).getAllByRole('row')).toHaveLength(data.days.length + 1);
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Date (UTC)', 'Transactions', 'Unusual']);

    // A day with an unusual transaction shows its count; an ordinary day shows a dash.
    const cells = (date: string) => {
      const link = table.querySelector(`a[href="${paths.day(data.address, date)}"]`)!;
      return [...link.closest('tr')!.querySelectorAll('td')].map((td) => td.textContent);
    };
    const flagged = data.days.find((d) => d.flaggedCount > 0)!;
    const ordinary = data.days.find((d) => d.flaggedCount === 0)!;
    expect(cells(flagged.date)).toEqual([String(flagged.txCount), String(flagged.flaggedCount)]);
    expect(cells(ordinary.date)).toEqual([String(ordinary.txCount), '—']);
  });

  test('no activity gives the empty state with a way on', async () => {
    const data = { ...(await timeline()), days: [] };
    render(<G1DailyActivity timeline={data} onOpenDay={vi.fn()} />);
    const panel = screen.getByTestId('state-empty-chart');
    expect(within(panel).getByRole('link', { name: 'Choose another address' })).toHaveAttribute('href', '#/');
  });
});

describe('click-through and keyboard', () => {
  test('clicking a day opens it', async () => {
    const data = await timeline(ex.flagged.address);
    const { onOpenDay } = await draw(data);
    act(() => fakePlotly.emit('plotly_click', { points: [{ curveNumber: 1, pointNumber: 0, customdata: '2026-08-14' }] }));
    expect(onOpenDay).toHaveBeenCalledWith('2026-08-14');
  });

  test('arrow keys move between active days and Enter opens one, like the prototype', async () => {
    const user = userEvent.setup();
    const data = withDays(await timeline(), [['2026-08-01', 1, 0], ['2026-08-05', 4, 2], ['2026-08-09', 2, 0]]);
    const { onOpenDay } = await draw(data);
    const hover = fakePlotly.api.Fx.hover as ReturnType<typeof vi.fn>;
    act(() => screen.getByRole('group', { name: /Bar chart of transactions per day/ }).focus());
    await user.keyboard('{Home}');
    await waitFor(() => expect(hover).toHaveBeenLastCalledWith(expect.anything(), [{ curveNumber: 0, pointNumber: 0 }]));
    // The second active day is the one with an unusual transaction: the second bar series.
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(hover).toHaveBeenLastCalledWith(expect.anything(), [{ curveNumber: 1, pointNumber: 0 }]));
    expect(screen.getByRole('status')).toHaveTextContent('5 Aug 2026: 4 transactions, 2 unusual.');
    await user.keyboard('{Enter}');
    expect(onOpenDay).toHaveBeenCalledWith('2026-08-05');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await user.keyboard('{Enter}');
    expect(onOpenDay).toHaveBeenLastCalledWith('2026-08-09');
  });

  test('the keyboard only visits days with activity', async () => {
    const user = userEvent.setup();
    const data = withDays(await timeline(), [['2026-01-01', 1, 0], ['2026-12-31', 1, 0]]);
    const { onOpenDay } = await draw(data);
    act(() => screen.getByRole('group', { name: /Bar chart of transactions per day/ }).focus());
    await user.keyboard('{Home}{ArrowRight}{Enter}');
    expect(onOpenDay).toHaveBeenCalledWith('2026-12-31');
  });
});
