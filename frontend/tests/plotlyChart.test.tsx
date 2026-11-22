import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { chooseTraceTypes, everyCategoryLabelled, mergeLayout } from '../src/charts/chartFigure';
import { fileStem, tableToCsv, type ChartTable } from '../src/charts/chartTable';
import { PlotlyChart, type PointClick } from '../src/charts/PlotlyChart';
import { useTheme } from '../src/hooks/useTheme';
import { LIMITATION_LINE } from '../src/lib/settings';
import { fakePlotly } from './plotlyFake';

// The wrapper's contract (plan section 9), tested once for every chart: what it hands to Plotly,
// the table view, the exports, the theme, the states and the controls. Plotly itself is replaced
// by plotlyFake.ts, so these tests read the figure the wrapper passes in.

const TABLE: ChartTable = {
  columns: [{ label: 'Date (UTC)' }, { label: 'Transactions', numeric: true }],
  rows: [
    [{ text: '1 Sep 2026', href: '#/day/1' }, { text: '3' }],
    [{ text: '2 Sep 2026, "late"', href: '#/day/2' }, { text: '5' }],
  ],
};

const figure = ({ palette }: { palette: { ordinary: string } }) => ({
  data: [{ type: 'bar' as const, x: ['2026-09-01', '2026-09-02'], y: [3, 5], marker: { color: palette.ordinary } }],
  layout: { xaxis: { title: { text: 'Date (UTC)' } } },
});

function chart(props: Partial<React.ComponentProps<typeof PlotlyChart>> = {}) {
  return (
    <PlotlyChart
      fileName={['daily-activity', 'bc1qexample', '2026-10-05']}
      title="Transactions per day"
      subtitle="Taller bars are busier days."
      footnote="Test source · snapshot of 5 Oct 2026"
      summary="Bar chart of two days."
      tableLine="Two days with activity."
      figure={figure}
      table={TABLE}
      {...props}
    />
  );
}

async function drawn() {
  await waitFor(() => expect(fakePlotly.chartDraws().length).toBeGreaterThan(0));
  return fakePlotly.lastChartDraw();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('what the wrapper hands to Plotly', () => {
  test('words on the chart, shared layout and a cut-down tool bar', async () => {
    render(chart());
    expect(screen.getByRole('heading', { name: 'Transactions per day' })).toBeInTheDocument();
    expect(screen.getByText('Taller bars are busier days.')).toBeInTheDocument();
    // The footnote is one small line under the chart, not in the header, and the figure is described by it.
    const footnote = screen.getByText('Test source · snapshot of 5 Oct 2026');
    expect(footnote.closest('.pchart-head')).toBeNull();
    expect(footnote.tagName).toBe('FIGCAPTION');
    expect(screen.getByRole('img', { name: 'Bar chart of two days.' })).toHaveAttribute('aria-describedby', footnote.id);
    const { layout, config } = await drawn();
    // The chart's own axis title survives the merge with the shared layout.
    expect(layout.xaxis.title.text).toBe('Date (UTC)');
    expect(layout.xaxis.automargin).toBe(true);
    expect(layout.uirevision).toBe('daily-activity/bc1qexample/2026-10-05');
    expect(layout.dragmode).toBe('zoom');
    expect(config).toMatchObject({ displaylogo: false, displayModeBar: true, doubleClick: 'reset', modeBarButtons: [['zoom2d', 'pan2d', 'resetScale2d']] });
  });

  test('a chart with nothing to zoom has fixed axes and no tool bar', async () => {
    render(chart({ zoomable: false }));
    const { layout, config } = await drawn();
    expect(layout.xaxis.fixedrange).toBe(true);
    expect(layout.dragmode).toBe(false);
    expect(config.displayModeBar).toBe(false);
  });

  test('a redraw with new data keeps the zoom by keeping the revision', async () => {
    const { rerender } = render(chart());
    await drawn();
    rerender(chart({ figure: ({ palette }) => ({ ...figure({ palette }), data: [{ type: 'bar', x: ['2026-09-03'], y: [9] }] }) }));
    await waitFor(() => expect(fakePlotly.chartDraws().length).toBe(2));
    const [first, second] = fakePlotly.chartDraws();
    expect(second.layout.uirevision).toBe(first.layout.uirevision);
    expect(second.el).toBe(first.el);
  });

  test('a phone-sized container gets fewer ticks, touch panning and its tools in a menu', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 390 } as DOMRect);
    render(chart());
    const { layout, config } = await drawn();
    expect(layout.xaxis.nticks).toBe(4);
    expect(layout.dragmode).toBe('pan');
    expect(config.displayModeBar).toBe(false);
    expect(screen.getByText('Chart tools')).toBeInTheDocument();
  });

  test('a touch screen of any width drops the tool bar and pans, and the legend only names the marks', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query.includes('pointer: coarse'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    render(chart());
    const { layout, config } = await drawn();
    // Plotly's tool bar buttons and legend entries are smaller than a finger needs and cannot be enlarged.
    expect(config.displayModeBar).toBe(false);
    expect(layout.dragmode).toBe('pan');
    expect(layout.legend).toMatchObject({ itemclick: false, itemdoubleclick: false });
    // The wrapper's own tools are ordinary buttons, in the row rather than a menu, on a screen this wide.
    expect(screen.queryByText('Chart tools')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument();
  });

  test('with a mouse, the legend toggles marks and the tool bar is there', async () => {
    render(chart());
    const { layout, config } = await drawn();
    expect(layout.legend.itemclick).toBeUndefined();
    expect(config.displayModeBar).toBe(true);
  });

  test('a chart is told how wide it is, to choose labels that fit', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 777 } as DOMRect);
    const seen: number[] = [];
    render(chart({ figure: (context) => (seen.push(context.width), figure(context)) }));
    await drawn();
    expect(seen).toContain(777);
  });

  test('the shared layout starts with no animation when the system asks for reduced motion', async () => {
    const matches = (query: string) => query.includes('reduced-motion');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: matches(query), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    render(chart());
    expect((await drawn()).layout.transition.duration).toBe(0);
  });

  test('a container resize redraws once it settles', async () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const size = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 700 } as DOMRect);
    render(chart());
    await drawn();
    const resize = fakePlotly.api.Plots.resize as ReturnType<typeof vi.fn>;
    resize.mockClear();
    vi.useFakeTimers();
    size.mockReturnValue({ width: 500 } as DOMRect);
    notify();
    notify();
    await act(async () => vi.advanceTimersByTime(200));
    expect(resize).toHaveBeenCalledTimes(1);
  });

  test('a chart scrolled off screen still resizes, so a narrowed window does not keep its old width', async () => {
    // Found by hand on 18 Nov: shrinking the window left the what-if chart (below the form on a phone) at its
    // desktop width, the page became wider than the screen and the phone zoomed out.
    let notify: () => void = () => {};
    let seen: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          seen = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const size = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 700 } as DOMRect);
    render(chart());
    act(() => seen([{ isIntersecting: true }]));
    await drawn();
    act(() => seen([{ isIntersecting: false }]));
    const resize = fakePlotly.api.Plots.resize as ReturnType<typeof vi.fn>;
    resize.mockClear();
    vi.useFakeTimers();
    size.mockReturnValue({ width: 324 } as DOMRect);
    notify();
    await act(async () => vi.advanceTimersByTime(200));
    expect(resize).toHaveBeenCalledTimes(1);
  });
});

describe('WebGL above the point threshold', () => {
  const scatter = (n: number) => ({ type: 'scatter' as const, x: Array.from({ length: n }, (_, i) => i), y: [] });

  test('scatter traces become WebGL traces at the threshold and stay SVG below it', () => {
    expect(chooseTraceTypes([scatter(1000)], 1000, () => true)[0].type).toBe('scattergl');
    expect(chooseTraceTypes([scatter(999)], 1000, () => true)[0].type).toBe('scatter');
  });

  test('the points of all scatter traces count together', () => {
    const traces = chooseTraceTypes([scatter(600), scatter(600)], 1000, () => true);
    expect(traces.map((t) => t.type)).toEqual(['scattergl', 'scattergl']);
  });

  test('bars never change, and SVG is kept where WebGL is missing', () => {
    const bar = { type: 'bar' as const, x: Array.from({ length: 5000 }, (_, i) => i), y: [] };
    expect(chooseTraceTypes([bar], 1000, () => true)[0].type).toBe('bar');
    expect(chooseTraceTypes([scatter(5000)], 1000, () => false)[0].type).toBe('scatter');
  });
});

describe('the theme', () => {
  const TOKENS: Record<string, Record<string, string>> = {
    light: { '--series-1': '#2a78d6', '--text': '#0b0b0b', '--surface': '#fcfcfb' },
    dark: { '--series-1': '#3987e5', '--text': '#f4f4f2', '--surface': '#1a1a19' },
  };

  function ThemedChart() {
    const { toggle } = useTheme();
    return (
      <>
        <button onClick={toggle}>Switch theme</button>
        {chart()}
      </>
    );
  }

  test('colours come from the CSS tokens and follow a theme switch in place', async () => {
    vi.spyOn(window, 'getComputedStyle').mockImplementation(
      () => ({ getPropertyValue: (token: string) => TOKENS[document.documentElement.dataset.theme ?? 'light'][token] ?? '' }) as CSSStyleDeclaration,
    );
    const user = userEvent.setup();
    render(<ThemedChart />);
    let draw = await drawn();
    expect((draw.data[0] as any).marker.color).toBe('#2a78d6');
    expect(draw.layout.font.color).toBe('#0b0b0b');

    await user.click(screen.getByRole('button', { name: 'Switch theme' }));
    await waitFor(() => expect((fakePlotly.lastChartDraw().data[0] as any).marker.color).toBe('#3987e5'));
    draw = fakePlotly.lastChartDraw();
    expect(draw.layout.font.color).toBe('#f4f4f2');
    expect(draw.layout.hoverlabel.bgcolor).toBe('#1a1a19');
    // The same element is redrawn in place, so the zoom is kept.
    expect(draw.el).toBe(fakePlotly.chartDraws()[0].el);
  });
});

describe('the table view', () => {
  test('a screen reader gets the table while the chart is shown, without links that cannot be seen', async () => {
    render(chart());
    await drawn();
    const table = screen.getByRole('table', { name: 'Transactions per day' });
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).queryByRole('link')).toBeNull();
    expect(table.closest('.sr-only')).not.toBeNull();
  });

  test('the switch shows the table with its one-sentence summary and its links, and offers CSV', async () => {
    const user = userEvent.setup();
    render(chart());
    await drawn();
    const toggle = screen.getByRole('button', { name: 'View as table' });
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull();

    await user.click(toggle);
    const table = screen.getByRole('table');
    expect(table.closest('.sr-only')).toBeNull();
    // The line above the table is the table line, which does not name the chart type; the footnote stays under it.
    expect(screen.getByText('Two days with activity.', { selector: '.pchart-summary' })).toBeInTheDocument();
    expect(screen.queryByText(/chart of/i, { selector: '.pchart-summary' })).toBeNull();
    expect(screen.getByText('Test source · snapshot of 5 Oct 2026')).toBeVisible();
    expect(within(table).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['#/day/1', '#/day/2']);
    expect(document.querySelector('.pchart-stage')).toHaveAttribute('hidden');

    await user.click(toggle);
    expect(document.querySelector('.pchart-stage')).not.toHaveAttribute('hidden');
  });

  test('the switch says what a press does: View as table, then View as chart, and is not a pressed toggle', async () => {
    const user = userEvent.setup();
    render(chart());
    await drawn();
    const stage = () => document.querySelector('.pchart-stage')!;
    const toggle = screen.getByRole('button', { name: 'View as table' });
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(stage()).not.toHaveAttribute('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('View as chart');
    expect(toggle).not.toHaveAttribute('aria-pressed');
    expect(toggle).toHaveFocus();
    expect(screen.getByRole('table').closest('.sr-only')).toBeNull();
    expect(stage()).toHaveAttribute('hidden');

    await user.click(toggle);
    expect(toggle).toHaveAccessibleName('View as table');
    expect(toggle).toHaveFocus();
    expect(stage()).not.toHaveAttribute('hidden');
    expect(screen.getByRole('table').closest('.sr-only')).not.toBeNull();
  });

  test('"always" keeps the table under the chart with no switch', async () => {
    render(chart({ tableView: 'always' }));
    await drawn();
    expect(screen.queryByRole('button', { name: 'View as table' })).toBeNull();
    expect(screen.getByRole('table').closest('.sr-only')).toBeNull();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
  });

  test('CSV is written from the same rows, named from the chart, address and snapshot date', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:csv');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    let download = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      download = this.download;
    });
    render(chart());
    await drawn();
    await user.click(screen.getByRole('button', { name: 'View as table' }));
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download).toBe('daily-activity_bc1qexample_2026-10-05.csv');
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(await blob.text()).toBe(
      `Date (UTC),Transactions,limitation\r\n1 Sep 2026,3,"${LIMITATION_LINE}"\r\n"2 Sep 2026, ""late""",5,"${LIMITATION_LINE}"\r\n`,
    );
  });

  test('CSV quoting and file names', () => {
    expect(tableToCsv({ columns: [{ label: 'a' }], rows: [[{ text: 'x,y', sub: 'ignored' }]] })).toBe('a\r\n"x,y"\r\n');
    expect(tableToCsv({ columns: [{ label: 'a' }], rows: [[{ text: 'x,y' }], [{ text: 'z' }]] }, 'Line, with a comma.')).toBe(
      'a,limitation\r\n"x,y","Line, with a comma."\r\nz,"Line, with a comma."\r\n',
    );
    expect(fileStem(['daily activity', 'bc1QAbC', '2026-10-05', ''])).toBe('daily-activity_bc1QAbC_2026-10-05');
  });
});

describe('PNG export', () => {
  test('draws a titled, captioned copy offscreen at a fixed size and downloads it', async () => {
    const user = userEvent.setup();
    render(chart());
    await drawn();
    const live = fakePlotly.lastChartDraw();
    // The user has zoomed: the picture shows what is on screen.
    Object.assign(live.el, { layout: { ...live.layout, xaxis: { ...live.layout.xaxis, range: ['2026-09-01', '2026-09-02'], rangeslider: { visible: true } } } });

    await user.click(screen.getByRole('button', { name: 'Download PNG' }));
    await waitFor(() => expect(fakePlotly.api.downloadImage).toHaveBeenCalled());

    const [host, options] = (fakePlotly.api.downloadImage as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(options).toEqual({ format: 'png', filename: 'daily-activity_bc1qexample_2026-10-05', width: 1200, height: 675 });
    const copy = fakePlotly.draws.find((d) => d.el === host)!;
    expect(copy.layout.title.text).toBe('<b>Transactions per day</b>');
    expect(copy.layout.title.subtitle.text).toBe('Taller bars are busier days.');
    // The footnote, the same line as on the page, is printed at the foot of the picture.
    expect(copy.layout.annotations.map((a: { text: string }) => a.text)).toContain('Test source · snapshot of 5 Oct 2026');
    expect(copy.layout.xaxis.range).toEqual(['2026-09-01', '2026-09-02']);
    expect(copy.layout.xaxis.rangeslider.visible).toBe(false);
    expect(copy.config).toMatchObject({ staticPlot: true });
    // The offscreen copy is cleaned up afterwards.
    expect(fakePlotly.api.purge).toHaveBeenCalledWith(host);
    expect(host.isConnected).toBe(false);
  });

  test('the button waits until there is a chart to export', () => {
    render(chart());
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeDisabled();
  });
});

describe('loading and failing', () => {
  test('a skeleton of the chart size holds the place until Plotly has drawn', async () => {
    render(chart({ height: 400 }));
    expect(document.querySelector('.pchart-skeleton')).toBeInTheDocument();
    expect(document.querySelector('.pchart-box')).toHaveStyle({ height: '400px' });
    expect(screen.getByRole('status')).toHaveTextContent('Loading the chart');
    await drawn();
    await waitFor(() => expect(document.querySelector('.pchart-skeleton')).toBeNull());
  });

  test('Plotly is only ever imported by its loader, so the first screen does not carry it', () => {
    const root = join(__dirname, '..', 'src');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, name.name);
        if (name.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name.name) && /from 'plotly\.js-cartesian-dist-min'|import\('plotly\.js-cartesian-dist-min'\)/.test(readFileSync(path, 'utf8'))) {
          importers.push(path.replace(root, '').replace(/\\/g, '/'));
        }
      }
    };
    walk(root);
    expect(importers).toEqual(['/charts/plotlyLoader.ts']);
    expect(readFileSync(join(root, 'charts', 'plotlyLoader.ts'), 'utf8')).not.toMatch(/^import .* from 'plotly\.js-cartesian-dist-min'/m);
  });

  test('if Plotly fails to load, the table stands in and Try again loads it afresh', async () => {
    fakePlotly.failLoad = true;
    const user = userEvent.setup();
    render(chart());
    const panel = await screen.findByTestId('state-chart-failed');
    expect(panel).toHaveTextContent('The chart could not be drawn');
    // The table is visible, with its links, and there is no switch: no chart to go back to.
    expect(screen.getByRole('table').closest('.sr-only')).toBeNull();
    expect(screen.queryByRole('button', { name: /View as/ })).toBeNull();

    fakePlotly.failLoad = false;
    await user.click(within(panel).getByRole('button', { name: 'Try again' }));
    await drawn();
    await waitFor(() => expect(screen.queryByTestId('state-chart-failed')).toBeNull());
  });

  test('if Plotly fails to draw, the same fallback appears', async () => {
    fakePlotly.failDraw = true;
    render(chart());
    expect(await screen.findByTestId('state-chart-failed')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeVisible();
  });

  test('an empty chart says so, offers a next step and never loads Plotly', async () => {
    render(chart({ empty: { title: 'No activity to chart', body: 'Nothing to draw.', action: <a href="#/">Choose another address</a> } }));
    const panel = screen.getByTestId('state-empty-chart');
    expect(within(panel).getByRole('link', { name: 'Choose another address' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fakePlotly.draws).toHaveLength(0);
  });
});

describe('click-through, touch and keyboard', () => {
  const hit = { points: [{ curveNumber: 1, pointNumber: 4, customdata: '2026-09-02' }] };

  test('a click reports which point was hit', async () => {
    const onPointClick = vi.fn<(click: PointClick) => void>();
    render(chart({ onPointClick }));
    await drawn();
    act(() => fakePlotly.emit('plotly_click', hit));
    expect(onPointClick).toHaveBeenCalledWith({ curve: 1, point: 4, customdata: '2026-09-02' });
  });

  test('on a touch screen the first tap shows the tooltip and the second opens the point', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: query.includes('coarse'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList,
    );
    const onPointClick = vi.fn();
    render(chart({ onPointClick }));
    await drawn();
    act(() => fakePlotly.emit('plotly_click', hit));
    expect(onPointClick).not.toHaveBeenCalled();
    act(() => fakePlotly.emit('plotly_click', hit));
    expect(onPointClick).toHaveBeenCalledTimes(1);
  });

  const keyboard = {
    points: [
      { curve: 0, point: 0, label: '1 Sep: 3 transactions.' },
      { curve: 1, point: 0, label: '2 Sep: 5 transactions.' },
      { curve: 0, point: 1, label: '4 Sep: 1 transaction.' },
    ],
    onOpen: vi.fn(),
    instructions: 'Use the arrow keys.',
  };

  test('the chart is one focusable group named from the summary and the instructions', async () => {
    render(chart({ keyboard }));
    await drawn();
    const group = screen.getByRole('group', { name: 'Bar chart of two days. Use the arrow keys.' });
    expect(group).toHaveAttribute('tabindex', '0');
    expect(group).toHaveAttribute('aria-roledescription', 'chart');
  });

  test('arrow keys move between stops, showing Plotly\'s tooltip and announcing each; Enter opens', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(chart({ keyboard: { ...keyboard, onOpen } }));
    await drawn();
    const hover = fakePlotly.api.Fx.hover as ReturnType<typeof vi.fn>;
    act(() => screen.getByRole('group').focus());
    // Focusing starts on the newest stop, as the prototype's chart did.
    await waitFor(() => expect(hover).toHaveBeenLastCalledWith(expect.anything(), [{ curveNumber: 0, pointNumber: 1 }]));
    await user.keyboard('{Home}');
    await waitFor(() => expect(hover).toHaveBeenLastCalledWith(expect.anything(), [{ curveNumber: 0, pointNumber: 0 }]));
    await user.keyboard('{ArrowRight}');
    await waitFor(() => expect(hover).toHaveBeenLastCalledWith(expect.anything(), [{ curveNumber: 1, pointNumber: 0 }]));
    expect(screen.getByRole('status')).toHaveTextContent('2 Sep: 5 transactions.');
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledWith(1);
    await user.keyboard('{End}{ArrowRight}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('4 Sep: 1 transaction.'));
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 Sep: 3 transactions.'));
  });

  test('leaving the chart clears the tooltip', async () => {
    render(chart({ keyboard }));
    await drawn();
    act(() => screen.getByRole('group').focus());
    await waitFor(() => expect(fakePlotly.api.Fx.hover).toHaveBeenCalled());
    act(() => screen.getByRole('group').blur());
    await waitFor(() => expect(fakePlotly.api.Fx.unhover).toHaveBeenCalled());
  });

  test('a chart without stops is a labelled picture, not a focus stop', async () => {
    render(chart());
    expect(screen.getByRole('img', { name: 'Bar chart of two days.' })).not.toHaveAttribute('tabindex');
  });
});

describe('"How to read this chart", the key and the status', () => {
  test('the disclosure is under the header, closed until it is opened, and a chart without help has none', async () => {
    const user = userEvent.setup();
    const { unmount } = render(chart({ guide: <p>Drag to zoom.</p>, hint: 'Select a bar to open that day.' }));
    await drawn();
    const details = document.querySelector('details.pchart-guide') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = screen.getByText('How to read this chart');
    expect(summary.tagName).toBe('SUMMARY');
    expect(details.previousElementSibling).toBe(document.querySelector('.pchart-head'));
    // The one action hint stays visible; the help is behind the disclosure.
    expect(screen.getByText('Select a bar to open that day.')).toBeVisible();
    await user.click(summary);
    expect(details.open).toBe(true);
    expect(screen.getByText('Drag to zoom.')).toBeVisible();
    unmount();
    render(chart());
    await drawn();
    expect(document.querySelector('details.pchart-guide')).toBeNull();
  });

  test('a lead sits right under the header, before the help and the chart; a status is shown apart from the footnote', async () => {
    render(chart({ lead: <p data-testid="lead">Flagged from 0.023 BTC</p>, guide: <p>Help.</p>, status: 'Drawing 120 of 377…' }));
    await drawn();
    const lead = screen.getByTestId('lead').parentElement!;
    expect(lead.previousElementSibling).toBe(document.querySelector('.pchart-head'));
    expect(lead.nextElementSibling).toBe(document.querySelector('details.pchart-guide'));
    expect(screen.getByText('Drawing 120 of 377…')).toBeInTheDocument();
    expect(screen.getByText('Test source · snapshot of 5 Oct 2026')).not.toHaveTextContent(/Drawing/);
    expect(document.querySelector('.pchart-footnote')!.nextElementSibling).toBeNull();
  });
});

test('mergeLayout lays a chart layout over the shared one without losing either side', () => {
  const merged = mergeLayout({ xaxis: { automargin: true, title: { font: { size: 12 } } }, margin: { t: 36, b: 40 } }, { xaxis: { title: { text: 'Date' } }, margin: { t: 80 } });
  expect(merged).toEqual({ xaxis: { automargin: true, title: { font: { size: 12 }, text: 'Date' } }, margin: { t: 80, b: 40 } });
});

test('a category axis labels every category; other axes keep their thinning', () => {
  const layout = everyCategoryLabelled({ xaxis: { type: 'category', nticks: 6 }, yaxis: { type: 'log', nticks: 6 } }) as any;
  expect(layout.xaxis).toMatchObject({ type: 'category', nticks: 0, dtick: 1 });
  expect(layout.yaxis).toEqual({ type: 'log', nticks: 6 });
});
