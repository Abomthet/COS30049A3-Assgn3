import { useCallback, useMemo } from 'react';
import type { Data } from 'plotly.js';
import type { Interval, MethodDescription, PlantedPattern } from '../api/types';
import { formatInterval } from '../lib/format';
import type { Figure, FigureContext } from './chartFigure';
import type { ChartTable } from './chartTable';
import type { ChartPalette } from './chartTheme';
import { PlotlyChart } from './PlotlyChart';

// G6, planted-test recall (plan section 9): for each method, the share of planted test transactions
// it flagged, one bar for each planted pattern with its 95% interval as an error bar, and a diamond
// for the mean over the three patterns with its own interval. Every figure is E11's. It answers: how
// often does each method catch each planted pattern? It does not say how often a flag on a real
// address is right, and its caption says so.

export const PATTERNS: Array<{ id: PlantedPattern; label: string }> = [
  { id: 'spike', label: 'Spike' },
  { id: 'burst', label: 'Burst' },
  { id: 'dormant', label: 'Dormant' },
];

/** A method's name over two lines where it is long, so nine groups fit side by side. */
const wrapped = (name: string) => name.replace(/(.{10,}?) /g, '$1<br>');

/** Each pattern has a hatch as well as a colour, so the bars differ without colour. */
function style(pattern: PlantedPattern, palette: ChartPalette): Partial<Data> {
  const swatch = { spike: [palette.ordinary, ''], burst: [palette.ordinary, '/'], dormant: [palette.neutral, 'x'] }[pattern];
  return { marker: { color: swatch[0], pattern: { shape: swatch[1], fgcolor: swatch[0], bgcolor: palette.surface, size: 6 } } } as Partial<Data>;
}

const errors = (intervals: Interval[]) => ({
  type: 'data' as const,
  symmetric: false,
  array: intervals.map((i) => i.ciHigh - i.value),
  arrayminus: intervals.map((i) => i.value - i.ciLow),
  thickness: 1.5,
  width: 3,
});

function buildFigure(methods: MethodDescription[], names: string[], { palette, compact }: FigureContext): Figure {
  const x = names.map((n) => (compact ? n : wrapped(n)));
  const bars = PATTERNS.map(({ id, label }): Data => {
    const intervals = methods.map((m) => m.evaluation.recallByPattern[id]);
    return {
      type: 'bar',
      name: label,
      x,
      y: intervals.map((i) => i.value),
      error_y: errors(intervals),
      ...style(id, palette),
      hovertext: methods.map((m, i) => `${names[i]}<br>${label}: ${formatInterval(m.evaluation.recallByPattern[id])}`),
      hoverinfo: 'text',
    } as Data;
  });
  const means = methods.map((m) => m.evaluation.meanRecall);
  const mean = {
    type: 'scatter',
    mode: 'markers',
    name: 'Mean of the three',
    x,
    y: means.map((i) => i.value),
    error_y: { ...errors(means), color: palette.text },
    marker: { symbol: 'diamond', size: 9, color: palette.text, line: { width: 1.5, color: palette.surface } },
    hovertext: methods.map((m, i) => `${names[i]}<br>Mean of the three: ${formatInterval(m.evaluation.meanRecall)}`),
    hoverinfo: 'text',
  } as Data;

  return {
    data: [...bars, mean],
    layout: {
      barmode: 'group',
      bargap: 0.25,
      hovermode: 'closest',
      margin: { t: compact ? 72 : 44, r: 16 },
      legend: compact ? { y: 1.02 } : { x: 1, xanchor: 'right', y: 1.02, orientation: 'h' },
      xaxis: { title: { text: 'Method' }, tickangle: compact ? -60 : 0, fixedrange: true },
      yaxis: { title: { text: 'Planted transactions flagged' }, range: [0, 1.04], tickformat: '.0%', fixedrange: true },
    },
  };
}

export function G6PlantedRecall({ methods }: { methods: MethodDescription[] }) {
  const names = useMemo(() => methods.map((m) => m.name), [methods]);
  const figure = useCallback((context: FigureContext) => buildFigure(methods, names, context), [methods, names]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [{ label: 'Method' }, { label: 'All three patterns' }, ...PATTERNS.map((p) => ({ label: p.label }))],
      rows: methods.map((m) => [{ text: m.name }, { text: formatInterval(m.evaluation.meanRecall) }, ...PATTERNS.map((p) => ({ text: formatInterval(m.evaluation.recallByPattern[p.id]) }))]),
    }),
    [methods],
  );

  const best = methods.reduce((a, b) => (b.evaluation.meanRecall.value > a.evaluation.meanRecall.value ? b : a));
  return (
    <PlotlyChart
      fileName={['planted-recall']}
      title="How often each method catches each planted pattern"
      headingLevel={2}
      caption="Measured on planted test transactions (Assignment 2's evaluation), not on real activity, which has no labels. Each bar is the share flagged, with its 95% interval."
      summary={`Grouped bar chart of the share of planted test transactions flagged by each of ${methods.length} methods, for a spike, a burst and a dormant address waking up. The highest mean over the three patterns is ${best.name}, at ${formatInterval(best.evaluation.meanRecall)}.`}
      hint="Select a legend entry to hide or show a pattern. Hover a bar for its interval."
      figure={figure}
      table={table}
      zoomable={false}
      height={420}
    />
  );
}
