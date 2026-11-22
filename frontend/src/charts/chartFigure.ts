import type { Annotations, Config, Data, Layout } from 'plotly.js';
import type { ChartPalette } from './chartTheme';

// What every chart shares in how Plotly is told to draw it: the layout and config defaults
// that implement the chart contract (plan section 9), merging a chart's own layout over them,
// the switch to WebGL, and the larger copy that is drawn for a PNG.

/** What a chart component hands to the wrapper. */
export interface Figure {
  data: Data[];
  /** Only what is specific to this chart: axis titles, ranges, reference lines. */
  layout?: Partial<Layout>;
}

/** What a chart needs to know to build its figure. */
export interface FigureContext {
  palette: ChartPalette;
  /** True on a phone-sized container: fewer ticks, no tool bar. */
  compact: boolean;
  /** The chart container's width in pixels, for choices that depend on how much room the labels have. */
  width: number;
}

/** Containers narrower than this are treated as a phone (plan section 8, "Layouts and touch"). */
export const COMPACT_BELOW_PX = 560;

type Plain = Record<string, unknown>;
const isPlain = (value: unknown): value is Plain => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Deep merge; arrays and scalars in `extra` replace those in `base`. */
function mergePlain(base: Plain, extra: Plain): Plain {
  const out: Plain = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = out[key];
    out[key] = isPlain(current) && isPlain(value) ? mergePlain(current, value) : value;
  }
  return out;
}

/** A chart's own layout laid over the shared one. */
export function mergeLayout(base: Partial<Layout>, extra: Partial<Layout> = {}): Partial<Layout> {
  return mergePlain(base as Plain, extra as Plain) as Partial<Layout>;
}

/**
 * The shared axis settings thin every axis to a few ticks (`nticks`), which is right for numbers and dates but hides
 * names on a category axis (G6's nine models showed five). A category axis, which a chart marks with `type: 'category'`,
 * labels every category instead.
 */
export function everyCategoryLabelled(layout: Partial<Layout>): Partial<Layout> {
  const out = { ...layout } as Record<string, any>;
  for (const key of ['xaxis', 'yaxis'] as const) {
    const axis = out[key];
    if (axis?.type === 'category') out[key] = { ...axis, nticks: 0, tickmode: axis.tickmode ?? 'linear', ...(axis.tickmode === 'array' ? {} : { dtick: 1 }) };
  }
  return out as Partial<Layout>;
}

interface LayoutOptions {
  compact: boolean;
  /**
   * Fingers, not a mouse: a phone-sized chart or a coarse pointer. Plotly draws its own tool bar and legend
   * entries a few pixels tall, below the 44 px a finger needs and with no setting to enlarge them, so on touch the
   * tool bar is dropped (the wrapper's own buttons replace it) and the legend only names the marks.
   */
  touch: boolean;
  /** False for charts with nothing to zoom (G3, G4): axes are fixed and there is no drag. */
  zoomable: boolean;
  /** Plotly keeps the user's zoom across redraws while this stays the same. */
  revision: string;
  /** Marks glide to their new values on a redraw; off when the system asks for reduced motion. */
  animate: boolean;
}

/** The theme- and size-dependent layout every chart starts from. */
export function baseLayout(palette: ChartPalette, { compact, touch, zoomable, revision, animate }: LayoutOptions): Partial<Layout> {
  const size = compact ? 11 : 12;
  const axis = {
    automargin: true,
    // Quiet furniture (Apple HIG Charts): faint dotted grid, no tick marks, few labels.
    ticks: '' as const,
    tickfont: { color: palette.axisInk, size },
    gridcolor: palette.grid,
    griddash: 'dot' as const,
    gridwidth: 1,
    linecolor: palette.axis,
    zerolinecolor: palette.axis,
    zerolinewidth: 1,
    title: { font: { color: palette.axisInk, size } },
    fixedrange: !zoomable,
    nticks: compact ? 4 : 6,
  };
  return {
    autosize: true,
    uirevision: revision,
    // Only when animating: with any `transition` in the layout (even a duration of 0) Plotly.react takes its
    // animation path, which mis-draws bar charts whose number of bars changes (the replay's black bars).
    ...(animate ? { transition: { duration: 250, easing: 'cubic-in-out' as const } } : {}),
    font: { family: palette.fontFamily, color: palette.text, size },
    // Transparent, so the card behind the chart shows through in both themes.
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    margin: { l: 48, r: 16, t: 36, b: 40 },
    // On a touch screen a drag pans (a box zoom is not possible with a finger); on a desktop it zooms.
    dragmode: zoomable ? (touch ? 'pan' : 'zoom') : false,
    hoverlabel: {
      bgcolor: palette.surface,
      bordercolor: palette.borderStrong,
      font: { color: palette.text, family: palette.fontFamily, size: 13 },
      align: 'left',
    },
    legend: {
      orientation: 'h',
      x: 0,
      xanchor: 'left',
      y: 1.02,
      yanchor: 'bottom',
      font: { color: palette.text, size },
      ...(touch ? { itemclick: false, itemdoubleclick: false } : {}),
    },
    modebar: { bgcolor: 'rgba(0,0,0,0)', color: palette.axisInk, activecolor: palette.ordinary },
    xaxis: axis,
    yaxis: axis,
  };
}

/**
 * Plotly's own tool bar is cut down to zoom, pan and reset (and, for a chart whose points can be selected, the box and lasso tools). Download is the wrapper's own button,
 * because it has to be reachable by keyboard and add the title and caption to the image. On touch
 * the tool bar is dropped altogether; a phone's tools move into the wrapper's menu.
 */
export function plotlyConfig({ touch, zoomable, selectable = false }: Pick<LayoutOptions, 'touch' | 'zoomable'> & { selectable?: boolean }): Partial<Config> {
  return {
    displaylogo: false,
    displayModeBar: zoomable && !touch,
    modeBarButtons: [selectable ? ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'resetScale2d'] : ['zoom2d', 'pan2d', 'resetScale2d']],
    scrollZoom: false,
    doubleClick: 'reset',
    showTips: false,
  };
}

/** The Plotly traces that become one WebGL trace each when there are too many points for SVG. */
const POINT_TRACES = new Set(['scatter']);

const pointCount = (trace: Data): number => ('x' in trace && Array.isArray(trace.x) ? trace.x.length : 0);

/**
 * Above `minPoints` points in total, scatter traces are drawn with WebGL (setting
 * web.charts.webglMinPoints); where WebGL is missing they stay SVG, slower but correct.
 */
export function chooseTraceTypes(data: Data[], minPoints: number, hasWebgl: () => boolean): Data[] {
  const scatter = data.filter((trace) => POINT_TRACES.has(trace.type ?? 'scatter'));
  const total = scatter.reduce((sum, trace) => sum + pointCount(trace), 0);
  if (total < minPoints || !hasWebgl()) return data;
  return data.map((trace) => (POINT_TRACES.has(trace.type ?? 'scatter') ? ({ ...trace, type: 'scattergl' } as Data) : trace));
}

let webglSupported: boolean | undefined;

/** Whether the browser can make a WebGL canvas, checked once and remembered, so large scatter charts fall back when it cannot. */
export function webglAvailable(): boolean {
  webglSupported ??= (() => {
    try {
      return document.createElement('canvas').getContext('webgl') !== null;
    } catch {
      return false;
    }
  })();
  return webglSupported;
}

/** The export's left margin and the bottom margin that holds the footnote, in pixels. */
const EXPORT_LEFT_PX = 80;
const EXPORT_MARGIN_B = 90;

/** Size of the PNG a chart exports. A fixed size, so the image does not depend on the window it came from. */
export const EXPORT_SIZE = { width: 1200, height: 675 };

/**
 * The figure drawn for a PNG: the chart as it is on screen now (zoom included), with its title, subtitle and footnote
 * added (they are HTML on screen) and without the range slider and buttons, which mean nothing in a picture. The
 * footnote (the source and the snapshot date) is the same line the page shows under the chart. The background is
 * opaque so the image reads in either theme.
 */
export function exportLayout(current: Partial<Layout>, palette: ChartPalette, title: string, footnote: string, subtitle?: string): Partial<Layout> {
  const footnoteNote: Partial<Annotations> = {
    // Against the plot area, then pushed down into the bottom margin (the export's margin is EXPORT_MARGIN_B tall).
    xref: 'paper',
    yref: 'paper',
    x: 0,
    y: 0,
    xshift: -EXPORT_LEFT_PX + 8,
    yshift: -EXPORT_MARGIN_B + 6,
    xanchor: 'left',
    yanchor: 'bottom',
    showarrow: false,
    text: footnote,
    font: { size: 13, color: palette.axisInk },
  };
  return mergeLayout(current, {
    annotations: [...(current.annotations ?? []), footnoteNote],
    ...EXPORT_SIZE,
    autosize: false,
    paper_bgcolor: palette.surface,
    plot_bgcolor: palette.surface,
    margin: { l: EXPORT_LEFT_PX, r: 40, t: subtitle ? 130 : 100, b: EXPORT_MARGIN_B },
    title: {
      text: `<b>${title}</b>`,
      x: 0.01,
      xanchor: 'left',
      y: 0.97,
      yanchor: 'top',
      font: { size: 22, color: palette.text },
      ...(subtitle ? { subtitle: { text: subtitle, font: { size: 13, color: palette.axisInk } } } : {}),
    },
    xaxis: { rangeslider: { visible: false }, rangeselector: { visible: false } },
  });
}
