import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Data, Layout, PlotMouseEvent, PlotRelayoutEvent, PlotSelectionEvent } from 'plotly.js';
import { StatePanel } from '../components/StatePanel';
import { TableScroll } from '../components/TableScroll';
import { useSettings } from '../hooks/useSettings';
import { useToasts } from '../hooks/useToasts';
import { plural } from '../lib/format';
import {
  COMPACT_BELOW_PX,
  EXPORT_SIZE,
  baseLayout,
  chooseTraceTypes,
  everyCategoryLabelled,
  exportLayout,
  mergeLayout,
  plotlyConfig,
  webglAvailable,
  type Figure,
  type FigureContext,
} from './chartFigure';
import { downloadText, fileStem, tableToCsv, type ChartTable } from './chartTable';
import { useChartPalette } from './chartTheme';
import { loadPlotly, type PlotlyApi } from './plotlyLoader';
import { useElementWidth } from './useElementWidth';
import { useInView } from './useInView';

// The one component that draws every chart (plan section 9, "The chart contract"). A chart
// component supplies its data, its words and a function that builds the Plotly figure; this
// wrapper supplies everything the contract promises for all charts alike: the title and caption,
// the theme, zoom and reset, the PNG and CSV exports, the table view, the loading, empty and
// error states, keyboard control, click-through and resizing.

export interface PointClick {
  /** Index of the trace in the figure's `data`. */
  curve: number;
  /** Index of the point within that trace. */
  point: number;
  customdata: unknown;
}

/** Keyboard stops, in reading order: each is one point of the figure. */
export interface KeyboardStops {
  points: Array<{ curve: number; point: number; /** Read aloud when the stop is reached. */ label: string }>;
  /** Enter or Space on a stop. */
  onOpen: (index: number) => void;
  /** Said in the chart's accessible name, after the summary. */
  instructions: string;
}

interface Props {
  /** The parts of the exported file names, such as the chart, the address and the snapshot date. */
  fileName: string[];
  title: string;
  headingLevel?: 2 | 3 | 4;
  /** One short line under the title: what to look at. */
  subtitle?: string;
  /**
   * The footnote, one small grey line under the chart: the source and the snapshot date (or the fetch time for live
   * data). It is the single source of truth for that fact: the figure's accessible description, the table view and the
   * PNG all carry this same text.
   */
  footnote: string;
  /** One sentence for a screen reader: the chart's accessible name. May name the chart type ("Bar chart of ..."). */
  summary: string;
  /** The line above the table view. It is the summary unless given: it must not name the chart type. */
  tableLine?: string;
  /** The one action hint that stays visible under the chart ("Select a bar to open that day."). */
  hint?: string;
  /** The body of the closed "How to read this chart" disclosure under the header: the mark-by-mark, zoom, select and keyboard help. */
  guide?: ReactNode;
  /** A headline that belongs to the chart (G5's "Flagged from" number): shown right under the subtitle, before the help and the chart. */
  lead?: ReactNode;
  /** A short live status next to the hint ("Drawing 120 of 377…"); not part of the footnote. */
  status?: string;
  /** Builds the figure for the current theme and size. Keep it stable (useCallback) so the chart is not redrawn needlessly. */
  figure: (context: FigureContext) => Figure;
  table: ChartTable;
  /** 'toggle': a switch shows the table instead of the chart. 'always': the table stays under the chart. */
  tableView?: 'toggle' | 'always';
  /** Zoom and pan are kept across redraws while this stays the same; a new address gets a new value. */
  revision?: string;
  /** False for charts with nothing to zoom: no drag, no tool bar. */
  zoomable?: boolean;
  /**
   * False where the data changes many times a second (the replay): Plotly's transitions would overlap, and a
   * transition that adds a trace leaves stale black bars and no legend behind.
   */
  animated?: boolean;
  height?: number;
  onPointClick?: (click: PointClick) => void;
  /**
   * The user zoomed or panned the time axis: its new range as Plotly's date strings (UTC). A reset
   * reports the range the figure itself asked for. Not called for a redraw the page itself asks for.
   */
  onZoom?: (range: [string, string]) => void;
  /**
   * Gives the tool bar its box and lasso tools. The points inside a selection, or null when it is cleared (a double-click,
   * or a drag that takes in nothing). A click while a selection tool is chosen selects and never opens a point.
   */
  onSelect?: (points: Array<{ curve: number; point: number }> | null) => void;
  keyboard?: KeyboardStops;
  /**
   * Buttons that set the time axis to a period (Plotly's own range buttons are 19 px tall and cannot be resized,
   * so the wrapper draws these as ordinary 44 px buttons). A range is Plotly's date strings, in UTC.
   */
  rangeButtons?: Array<{ label: string; range: [string, string] }>;
  /** Replaces the chart when there is nothing to draw. It always offers a next step. */
  empty?: { title: string; body: string; action?: ReactNode };
}

type Phase = 'loading' | 'ready' | 'failed';

/** The shared wrapper for every chart (G1 to G6): a Plotly figure with its title, a table alternative and a next step when there is nothing to draw. */
export function PlotlyChart({
  fileName,
  title,
  headingLevel = 3,
  subtitle,
  footnote,
  summary,
  tableLine,
  hint,
  guide,
  lead,
  status,
  figure,
  table,
  tableView = 'toggle',
  revision = fileName.join('/'),
  zoomable = true,
  animated = true,
  height = 340,
  onPointClick,
  onZoom,
  onSelect,
  keyboard,
  rangeButtons,
  empty,
}: Props) {
  const id = useId();
  const palette = useChartPalette();
  const { settings } = useSettings();
  const { notify } = useToasts();
  const [outerRef, width] = useElementWidth<HTMLElement>();
  const [stageRef, inView] = useInView<HTMLDivElement>();
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotly, setPlotly] = useState<PlotlyApi | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState(0);
  const [tableOpen, setTableOpen] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const listening = useRef(false);
  const tapped = useRef<string | null>(null);
  const clickHandler = useRef<(event: PlotMouseEvent) => void>(() => {});
  const zoomHandler = useRef<(event: PlotRelayoutEvent) => void>(() => {});
  const selectHandler = useRef<(event: PlotSelectionEvent | undefined) => void>(() => {});
  /** True while the page itself is redrawing: Plotly reports the new axis range of such a redraw as if the user had zoomed. */
  const redrawing = useRef(false);
  const compact = width < COMPACT_BELOW_PX;
  const webglMinPoints = settings.web.charts.webglMinPoints;

  // What Plotly is given, rebuilt only when the figure, the theme or the size changes.
  const drawing = useMemo(() => {
    const built = figure({ palette, compact, width });
    const animate = animated && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = compact || window.matchMedia('(pointer: coarse)').matches;
    return {
      data: chooseTraceTypes(built.data, webglMinPoints, webglAvailable),
      layout: everyCategoryLabelled(mergeLayout(baseLayout(palette, { compact, touch, zoomable, revision, animate }), built.layout)),
      config: plotlyConfig({ touch, zoomable, selectable: onSelect !== undefined }),
    };
  }, [figure, palette, compact, width, zoomable, animated, revision, webglMinPoints, onSelect !== undefined]);

  // Fetch Plotly when the first chart mounts. A chart with nothing to draw never needs it.
  const hasChart = !empty;
  useEffect(() => {
    if (!hasChart) return;
    let current = true;
    setPhase('loading');
    loadPlotly().then(
      (api) => current && setPlotly(api),
      () => current && setPhase('failed'),
    );
    return () => {
      current = false;
    };
  }, [attempt, hasChart]);

  // Draw, and redraw in place when the data, theme or size changes. Plotly keeps the zoom (uirevision).
  // A chart that is off screen or hidden is left alone and catches up when it is shown again.
  useEffect(() => {
    const el = plotRef.current;
    if (!plotly || !el || !inView) return;
    let current = true;
    (async () => {
      try {
        redrawing.current = true;
        const root = await plotly.react(el, drawing.data, drawing.layout, drawing.config).finally(() => {
          redrawing.current = false;
        });
        if (!current) return;
        if (!listening.current) {
          root.on('plotly_click', (event) => clickHandler.current(event));
          root.on('plotly_relayout', (event) => zoomHandler.current(event));
          root.on('plotly_selected', (event) => selectHandler.current(event));
          root.on('plotly_deselect', () => selectHandler.current(undefined));
          listening.current = true;
        }
        setPhase('ready');
      } catch {
        if (current) setPhase('failed');
      }
    })();
    return () => {
      current = false;
    };
  }, [plotly, inView, drawing, attempt]);

  useEffect(() => {
    const el = plotRef.current;
    return () => {
      if (plotly && el) plotly.purge(el);
      listening.current = false;
    };
  }, [plotly]);

  // The container changed size (already debounced by useElementWidth). Resized even when scrolled off screen: a
  // drawing left at its old width would stick out of a narrowed page.
  useEffect(() => {
    const el = plotRef.current;
    if (!plotly || !el || phase !== 'ready') return;
    // Typed as void, but Plotly returns a promise, which it rejects for a hidden chart (table view, closed tab).
    (plotly.Plots.resize(el) as unknown as Promise<void> | undefined)?.catch(() => {});
  }, [width]);

  // Click-through. On a touch screen the first tap on a point shows its tooltip and the second opens it (plan section 8).
  useEffect(() => {
    clickHandler.current = (event) => {
      const hit = event.points[0];
      if (!hit || !onPointClick) return;
      // With a selection tool chosen a click selects; it must not also leave the page.
      const tool = (plotRef.current as (HTMLDivElement & { layout?: Partial<Layout> }) | null)?.layout?.dragmode;
      if (onSelect && (tool === 'select' || tool === 'lasso')) return;
      const key = `${hit.curveNumber}:${hit.pointNumber}`;
      if (window.matchMedia('(pointer: coarse)').matches && tapped.current !== key) {
        tapped.current = key;
        return;
      }
      tapped.current = null;
      onPointClick({ curve: hit.curveNumber, point: hit.pointNumber, customdata: hit.customdata });
    };
  });

  // Zoom and pan of the time axis, read from the event Plotly sends: a drag gives the two ends as separate
  // keys, a reset one pair. The ends are typed as numbers, but on a date axis they are text.
  useEffect(() => {
    zoomHandler.current = (event) => {
      if (redrawing.current) return;
      const pair = (event as { 'xaxis.range'?: [string, string] })['xaxis.range'];
      const from = event['xaxis.range[0]'] ?? pair?.[0];
      const to = event['xaxis.range[1]'] ?? pair?.[1];
      if (from !== undefined && to !== undefined) onZoom?.([String(from), String(to)]);
    };
  });

  // A selection: the points Plotly reports, or none when it was cleared.
  useEffect(() => {
    selectHandler.current = (event) => {
      // Drawing the selection we were given makes Plotly report an empty one; that is not the user clearing it.
      if (redrawing.current) return;
      const points = event?.points ?? [];
      onSelect?.(points.length > 0 ? points.map((p) => ({ curve: p.curveNumber, point: p.pointNumber })) : null);
    };
  });

  // Keyboard control: the stop under the cursor is shown with Plotly's own tooltip.
  const stops = keyboard?.points;
  useEffect(() => {
    const el = plotRef.current;
    if (!plotly || !el || phase !== 'ready' || !stops) return;
    const stop = active === null ? undefined : stops[active];
    if (stop) plotly.Fx.hover(el, [{ curveNumber: stop.curve, pointNumber: stop.point }]);
    else plotly.Fx.unhover(el);
  }, [plotly, phase, stops, active]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!keyboard || keyboard.points.length === 0) return;
    const last = keyboard.points.length - 1;
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = Math.min(last, (active ?? -1) + 1);
    else if (event.key === 'ArrowLeft') next = active === null ? last : Math.max(0, active - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if ((event.key === 'Enter' || event.key === ' ') && active !== null) {
      event.preventDefault();
      keyboard.onOpen(active);
      return;
    }
    if (next !== undefined) {
      event.preventDefault();
      setActive(next);
    }
  }

  const stem = fileStem(fileName);

  async function downloadPng() {
    const live = plotRef.current as (HTMLDivElement & { data?: Data[]; layout?: Partial<Layout> }) | null;
    if (!plotly || !live?.data) return;
    // The picture is drawn offscreen, at a fixed size, from what is on screen now.
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${EXPORT_SIZE.width}px;height:${EXPORT_SIZE.height}px`;
    document.body.append(host);
    try {
      await plotly.react(host, live.data, exportLayout(live.layout ?? {}, palette, title, footnote, subtitle), { staticPlot: true, displayModeBar: false });
      await plotly.downloadImage(host, { format: 'png', filename: stem, ...EXPORT_SIZE });
      notify({ message: 'Chart image downloaded', tone: 'success' });
    } catch {
      notify({ message: 'The image could not be made. Try again.', tone: 'error' });
    } finally {
      plotly.purge(host);
      host.remove();
    }
  }

  function downloadCsv() {
    downloadText(`${stem}.csv`, tableToCsv(table, settings.limitationLine), 'text/csv;charset=utf-8');
    notify({ message: `Exported ${plural(table.rows.length, 'row')}`, tone: 'success' });
  }

  if (empty) {
    return (
      <StatePanel tone="empty" title={empty.title} headingLevel={headingLevel === 2 ? 2 : 3} testId="state-empty-chart" actions={empty.action}>
        <p>{empty.body}</p>
      </StatePanel>
    );
  }

  // If the chart cannot be drawn, the table stands in for it.
  const failed = phase === 'failed';
  const tableVisible = tableView === 'always' || tableOpen || failed;
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  // A chart with keyboard stops is one focusable group; any other is a labelled picture.
  const focusProps = keyboard
    ? {
        role: 'group',
        'aria-roledescription': 'chart',
        'aria-label': `${summary} ${keyboard.instructions}`,
        'aria-describedby': `${id}-footnote`,
        tabIndex: 0,
        onKeyDown,
        onFocus: () => active === null && keyboard.points.length > 0 && setActive(keyboard.points.length - 1),
        onBlur: () => setActive(null),
      }
    : { role: 'img', 'aria-label': summary, 'aria-describedby': `${id}-footnote` };

  const tools = (
    <>
      <button type="button" className="btn btn-secondary" onClick={downloadPng} disabled={phase !== 'ready'}>
        Download PNG
      </button>
      {/* The label says what a press does, so it is not also a pressed toggle. A failed chart has no switch:
          there is no chart to go back to. */}
      {tableView === 'toggle' && !failed ? (
        <button type="button" className="btn btn-secondary" aria-controls={`${id}-table`} onClick={() => setTableOpen((open) => !open)}>
          {tableOpen ? 'View as chart' : 'View as table'}
        </button>
      ) : null}
      {tableVisible ? (
        <button type="button" className="btn btn-secondary" onClick={downloadCsv}>
          Download CSV
        </button>
      ) : null}
    </>
  );

  return (
    <figure className="pchart" ref={outerRef} aria-labelledby={`${id}-title`}>
      <header className="pchart-head">
        <Heading id={`${id}-title`} className="pchart-title">
          {title}
        </Heading>
        {subtitle ? <p className="pchart-subtitle">{subtitle}</p> : null}
        {compact ? (
          <details className="pchart-menu">
            <summary>Chart tools</summary>
            <div className="pchart-tools">{tools}</div>
          </details>
        ) : (
          <div className="pchart-tools">{tools}</div>
        )}
      </header>

      {lead ? <div className="pchart-lead">{lead}</div> : null}
      {guide ? (
        <details className="pchart-guide">
          <summary>How to read this chart</summary>
          <div className="pchart-guide-body">{guide}</div>
        </details>
      ) : null}
      <div className="pchart-stage" ref={stageRef} hidden={tableOpen && tableView === 'toggle' && !failed} aria-busy={phase === 'loading'}>
        {rangeButtons && !failed ? (
          <div className="pchart-ranges chips" role="group" aria-label="Zoom to a period">
            {rangeButtons.map(({ label, range }) => (
              <button
                key={label}
                type="button"
                className="chip"
                disabled={phase !== 'ready'}
                onClick={() => plotly && plotRef.current && void plotly.relayout(plotRef.current, { 'xaxis.range': range })}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        {/* A box of the chart's final size from the first paint, so nothing jumps when Plotly arrives. */}
        <div className="pchart-box" style={{ height }}>
          <div className="chart-focus" hidden={failed} {...focusProps}>
            <div ref={plotRef} className="pchart-plot" style={{ height }} />
          </div>
          {phase === 'loading' ? <div className="pchart-skeleton" aria-hidden="true" /> : null}
          {failed ? (
            <StatePanel
              tone="error"
              title="The chart could not be drawn"
              headingLevel={3}
              live="alert"
              testId="state-chart-failed"
              actions={
                <button type="button" className="btn btn-secondary" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </button>
              }
            >
              <p>The same numbers are in the table below.</p>
            </StatePanel>
          ) : null}
        </div>
        {hint && !failed ? <p className="chart-hint">{hint}</p> : null}
        {status ? (
          <p className="chart-hint pchart-status" aria-live="polite">
            {status}
          </p>
        ) : null}
      </div>
      <p className="sr-only" role="status">
        {phase === 'loading' ? 'Loading the chart…' : active !== null && stops ? stops[active].label : ''}
      </p>

      <div id={`${id}-table`} className={tableVisible ? 'pchart-table' : 'sr-only'}>
        {tableVisible && tableView === 'toggle' ? <p className="pchart-summary">{tableLine ?? summary}</p> : null}
        <DataTable table={table} title={title} links={tableVisible} />
      </div>
      <figcaption id={`${id}-footnote`} className="pchart-footnote">
        {footnote}
      </figcaption>
    </figure>
  );
}

function DataTable({ table, title, links }: { table: ChartTable; title: string; links: boolean }) {
  const tableEl = (
    <table className="data-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column.label} scope="col" className={column.numeric ? 'num' : undefined}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => {
                const content = (
                  <>
                    {links && cell.href ? <a href={cell.href}>{cell.text}</a> : cell.text}
                    {cell.sub ? <span className="cell-sub">{cell.sub}</span> : null}
                  </>
                );
                return c === 0 ? (
                  <th key={c} scope="row">
                    {content}
                  </th>
                ) : (
                  <td key={c} data-label={table.columns[c].label} className={table.columns[c].numeric ? 'num' : undefined}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
  );
  // A hidden (screen-reader-only) table is not a scroll box: a focus stop nobody can see would be worse than none.
  return links ? <TableScroll label={`${title}, table`}>{tableEl}</TableScroll> : tableEl;
}
