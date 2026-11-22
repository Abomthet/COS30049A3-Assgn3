// S-07, linked selection: chart G2's box and lasso tools, and a span of days for keyboard users, make a selection that the
// table shows alone, with a summary line and "Clear selection". The selection is not a filter, so the address never changes.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { RECORDED } from '../src/api/mock/fixtures';
import { dayKey } from '../src/lib/dates';
import { rowsInSpan, selectionPage, sortRows, summarise } from '../src/lib/selection';
import { settings } from '../src/lib/settings';
import { fakePlotly } from './plotlyFake';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const base = `#/address/${ex.mainAddress}/transactions`;
const rows = RECORDED[0].transactionPages.flatMap((p) => p.transactions);
const LATE = { timeout: 3000 };

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
  vi.restoreAllMocks();
});

describe('the selection helpers', () => {
  test('a span takes the transactions on its days, both ends included', () => {
    const [a, b] = [rows[10], rows[20]].sort((x, y) => Date.parse(x.time) - Date.parse(y.time));
    const span = rowsInSpan(rows, dayKey(a.time), dayKey(b.time));
    expect(span.every((r) => dayKey(r.time) >= dayKey(a.time) && dayKey(r.time) <= dayKey(b.time))).toBe(true);
    expect(span).toEqual(expect.arrayContaining([a, b]));
  });

  test('the summary counts what came in, what went out and what is unusual, with the totals in satoshis', () => {
    const picked = rows.filter((r) => r.status === 'flagged');
    const s = summarise(picked);
    expect(s.count).toBe(3);
    expect(s.unusual).toBe(3);
    expect(s.received + s.sent).toBe(3);
    expect(s.receivedSats).toBe(picked.filter((r) => r.direction === 'in').reduce((n, r) => n + r.netSats, 0));
    expect(summarise([])).toMatchObject({ count: 0, receivedSats: 0, sentSats: 0 });
  });

  test('the rows are sorted as the sort menu says, and make one page', () => {
    const picked = rows.slice(0, 40);
    const times = sortRows(picked, '-time').map((r) => Date.parse(r.time));
    expect(times).toEqual([...times].sort((x, y) => y - x));
    const amounts = sortRows(picked, '-amount').map((r) => Math.abs(r.netSats));
    expect(amounts).toEqual([...amounts].sort((x, y) => y - x));
    expect(selectionPage('a', picked, 'time')).toMatchObject({ page: 1, total: 40, pageSize: 40 });
  });
});

async function openTab() {
  window.location.hash = base;
  const user = userEvent.setup();
  render(<App />);
  await screen.findByRole('heading', { level: 2, name: 'Selection' }, LATE);
  // The chart draws once every page of rows has arrived.
  await waitFor(() => {
    const { data, config } = fakePlotly.lastChartDraw();
    expect((config as { modeBarButtons?: string[][] }).modeBarButtons?.[0]).toContain('lasso2d');
    expect((data as Array<{ x: unknown[] }>).reduce((n, t) => n + t.x.length, 0)).toBe(rows.length);
  }, LATE);
  return user;
}

/** The points of the traces whose name says unusual, as Plotly reports a selection. */
function unusualPoints() {
  const traces = fakePlotly.lastChartDraw().data as Array<{ name: string; x: unknown[] }>;
  return traces.flatMap((t, curveNumber) => (/Unusual/.test(t.name) ? t.x.map((_, pointNumber) => ({ curveNumber, pointNumber })) : []));
}

describe('selecting in the chart', () => {
  test('the tool bar has the box and the lasso tool', async () => {
    await openTab();
    expect(fakePlotly.lastChartDraw().config.modeBarButtons).toEqual([['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'resetScale2d']]);
  });

  test('a box round the unusual points shows only them in the table, with the summary, and clearing brings the pages back', async () => {
    const user = await openTab();
    expect(screen.getByText('Draw on the chart or pick days to select.')).toBeInTheDocument();
    act(() => fakePlotly.emit('plotly_selected', { points: unusualPoints() }));

    expect(await screen.findByTestId('selection-count')).toHaveTextContent(/^3 selected$/);
    expect(screen.getByText(/^\d+ received · \d+ sent · 3 unusual$/)).toBeInTheDocument();
    expect(screen.getByText(/^\d+\.\d{8} BTC in · \d+\.\d{8} BTC out$/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /Transactions of this address/ });
    expect(within(table).getAllByRole('row').slice(1)).toHaveLength(3);
    expect(screen.getByText('Rows 1 to 3 · page 1 of 1')).toBeInTheDocument();
    // The chart draws the selection, and the address says nothing about it.
    const traces = fakePlotly.lastChartDraw().data as Array<{ selectedpoints?: number[] }>;
    expect(traces.flatMap((t) => t.selectedpoints ?? [])).toHaveLength(3);
    expect(window.location.hash).toBe(base);

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText('Rows 1 to 50 · page 1 of 8')).toBeInTheDocument();
    expect(screen.getByText('Draw on the chart or pick days to select.')).toBeInTheDocument();
    expect((fakePlotly.lastChartDraw().data as Array<{ selectedpoints?: number[] }>).some((t) => t.selectedpoints)).toBe(false);
  });

  test('the empty selection Plotly reports while the chart draws the selection it was given does not clear it', async () => {
    await openTab();
    const react = vi.mocked(fakePlotly.api.react);
    const draw = react.getMockImplementation()!;
    let reported = false;
    react.mockImplementationOnce(async (...args) => {
      fakePlotly.emit('plotly_selected', { points: [] });
      reported = true;
      return draw(...args);
    });
    act(() => fakePlotly.emit('plotly_selected', { points: unusualPoints() }));
    expect(await screen.findByTestId('selection-count')).toHaveTextContent(/^3 selected/);
    await waitFor(() => expect(reported).toBe(true));
    expect(screen.getByTestId('selection-count')).toHaveTextContent(/^3 selected/);
  });

  test('a double-click, which Plotly reports as a deselect, clears the selection', async () => {
    await openTab();
    act(() => fakePlotly.emit('plotly_selected', { points: unusualPoints() }));
    await screen.findByTestId('selection-count');
    act(() => fakePlotly.emit('plotly_deselect', undefined));
    expect(await screen.findByText('Draw on the chart or pick days to select.')).toBeInTheDocument();
  });

  test('a click on a point while a selection tool is chosen selects and does not open the transaction', async () => {
    await openTab();
    Object.assign(fakePlotly.lastChartDraw().el, { layout: { dragmode: 'lasso' } });
    act(() => fakePlotly.emit('plotly_click', { points: [{ curveNumber: 0, pointNumber: 0 }] }));
    expect(window.location.hash).toBe(base);
  });

  test('changing a filter ends the selection', async () => {
    const user = await openTab();
    act(() => fakePlotly.emit('plotly_selected', { points: unusualPoints() }));
    await screen.findByTestId('selection-count');
    await user.click(screen.getByRole('button', { name: 'Received' }));
    expect(await screen.findByText('Draw on the chart or pick days to select.')).toBeInTheDocument();
  });
});

/** The date fields of the selection's own form. */
const spanField = (name: 'From' | 'To') => within(screen.getByRole('region', { name: 'Selection' })).getByLabelText(name);

describe('selecting a span of days without a pointer', () => {
  test('two dates and "Select" select the transactions of those days', async () => {
    const user = await openTab();
    const day = dayKey(rows[0].time);
    const expected = rowsInSpan(rows, day, day).length;
    fireEvent.change(spanField('From'), { target: { value: day } });
    fireEvent.change(spanField('To'), { target: { value: day } });
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(await screen.findByTestId('selection-count')).toHaveTextContent(new RegExp(`^${expected} selected$`));
    expect(within(screen.getByRole('table', { name: /Transactions of this address/ })).getAllByRole('row').slice(1)).toHaveLength(expected);
  });

  test('a span that is the wrong way round, or has nothing on it, is said and selects nothing', async () => {
    const user = await openTab();
    const [from, to] = [spanField('From'), spanField('To')];
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick both days.');
    fireEvent.change(from, { target: { value: '2026-02-02' } });
    fireEvent.change(to, { target: { value: '2026-02-01' } });
    await user.click(screen.getByRole('button', { name: 'Select' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("From can't be after To.");
    expect(screen.getByText('Draw on the chart or pick days to select.')).toBeInTheDocument();
  });
});
