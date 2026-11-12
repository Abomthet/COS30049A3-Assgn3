import { useCallback, useMemo } from 'react';
import type { Annotations, Data, Shape } from 'plotly.js';
import type { AppSettings, FeatureDetail, FeatureRole, FeatureUnit } from '../api/types';
import { useSettings } from '../hooks/useSettings';
import { formatFeatureValue, formatList, formatZ } from '../lib/format';
import { snapshotCaption } from './caption';
import type { Figure, FigureContext } from './chartFigure';
import type { ChartTable } from './chartTable';
import { PlotlyChart } from './PlotlyChart';

// G3, feature deviation (plan section 9): one horizontal bar per feature, from 0 to the
// feature's robust z for one transaction, with the flag line and the +/- contributing band drawn
// behind. It answers: how far is this transaction from the address's usual size, pace, gap and
// ratio? Feature names and figures come from the response; the units and the flag line come from E2
// (decision D-W-10), so with the service unreachable the lines are left out rather than guessed.

/** The scoring models clip z here, so a bar never runs past it (plan section 9, G3 edge cases). */
const CLIP_Z = 20;
/** Each feature's role in words; the bar's colour is never the only signal. */
const ROLE_TEXT: Record<FeatureRole, string> = {
  flag: 'flag level',
  contributing: 'contributing',
  'within-usual': 'within usual',
  'no-comparison': 'no comparison',
};
const ROW_PX = 52;

interface Props {
  features: FeatureDetail[];
  address: string;
}

type Units = Map<string, FeatureUnit>;

const clamp = (z: number) => Math.max(-CLIP_Z, Math.min(CLIP_Z, z));

/** The end label of a bar: the real z, with an arrow when the bar is drawn shorter than the value. */
function barLabel(z: number): string {
  const clipped = Math.abs(z) > CLIP_Z;
  return z > 0 ? `${formatZ(z)}${clipped ? ' ▶' : ''}` : `${clipped ? '◀ ' : ''}${formatZ(z)}`;
}

/** The words a hover shows: "Size: 0.05 BTC, against a usual 0.000525 BTC (z +5.9)". */
function hoverText(f: FeatureDetail, units: Units): string {
  if (f.z === null) return `${f.name}: no comparison, there are too few earlier transactions to compare with`;
  const edge = Math.abs(f.z) > CLIP_Z ? `<br>Drawn at the edge: the models clip z at ${CLIP_Z}` : '';
  return `${f.name}: ${formatFeatureValue(f.value, units.get(f.id))}, against a usual ${formatFeatureValue(f.usual, units.get(f.id))} (z ${formatZ(f.z)})${edge}`;
}

function buildFigure(features: FeatureDetail[], units: Units, thresholds: AppSettings['thresholds'], { palette, compact }: FigureContext): Figure {
  // Rows are named by feature and role, so the role is read on the axis without relying on colour.
  // A flagged feature also gets the triangle that marks every unusual item.
  const rows = features.map((f) => ({ f, label: `${f.name}<br><i>${f.role === 'flag' ? '▲ ' : ''}${ROLE_TEXT[f.role]}</i>` }));
  const colour: Record<FeatureRole, string> = {
    flag: palette.unusual,
    contributing: palette.ordinary,
    'within-usual': palette.neutral,
    'no-comparison': palette.neutral,
  };

  const bars: Data = {
    type: 'bar',
    orientation: 'h',
    x: rows.map(({ f }) => (f.z === null ? null : clamp(f.z))),
    y: rows.map(({ label }) => label),
    width: 0.5,
    marker: { color: rows.map(({ f }) => colour[f.role]) },
    text: rows.map(({ f }) => (f.z === null ? '' : barLabel(f.z))),
    textposition: 'outside',
    cliponaxis: false,
    textfont: { color: palette.text, size: 12 },
    hovertext: rows.map(({ f }) => hoverText(f, units)),
    hoverinfo: 'text',
    showlegend: false,
  };

  // Empty traces whose only job is to put the two reference marks in the legend, which cannot show shapes.
  const key = (name: string, extra: Partial<Data>): Data => ({ type: 'scatter', x: [null], y: [null], name, hoverinfo: 'skip', ...extra }) as Data;
  const legendKeys: Data[] = [];
  const shapes: Array<Partial<Shape>> = [];
  if (thresholds) {
    const { flagAbsZ, contributingAbsZ } = thresholds;
    legendKeys.push(
      key(`Within ±${contributingAbsZ}: does not stand out`, { mode: 'markers', marker: { symbol: 'square', size: 12, color: palette.reference, opacity: 0.35 } }),
      key(`Flag line, ±${flagAbsZ}`, { mode: 'lines', line: { color: palette.unusual, width: 2, dash: 'dash' } }),
    );
    shapes.push(
      { type: 'rect', xref: 'x', yref: 'paper', x0: -contributingAbsZ, x1: contributingAbsZ, y0: 0, y1: 1, fillcolor: palette.reference, opacity: 0.18, line: { width: 0 }, layer: 'below' },
      ...[-flagAbsZ, flagAbsZ].map((x): Partial<Shape> => ({ type: 'line', xref: 'x', yref: 'paper', x0: x, x1: x, y0: 0, y1: 1, line: { color: palette.unusual, width: 1.5, dash: 'dash' } })),
    );
  }
  // A feature with no comparison has no bar; it says so in the row instead.
  const noComparison: Array<Partial<Annotations>> = rows
    .filter(({ f }) => f.z === null)
    .map(({ label }) => ({ xref: 'x', yref: 'y', x: 0, y: label, xanchor: 'left', xshift: 8, showarrow: false, text: 'no comparison', font: { color: palette.axisInk, size: 12 } }));

  const widest = Math.max(thresholds?.flagAbsZ ?? 0, ...features.map((f) => Math.abs(f.z === null ? 0 : clamp(f.z))));
  const limit = Math.min(CLIP_Z, Math.max(5, Math.ceil(widest + 1)));
  const reach = limit * 1.2; // room beyond the longest bar for its label

  return {
    data: [bars, ...legendKeys],
    layout: {
      shapes,
      annotations: noComparison,
      margin: { t: compact ? 72 : 44, r: 24 },
      xaxis: { range: [-reach, reach], title: { text: 'Robust z-score (right of 0: above usual, left of 0: below usual)' }, zeroline: true, zerolinewidth: 2, zerolinecolor: palette.axis },
      yaxis: { autorange: 'reversed', title: { text: 'Feature' } },
      bargap: 0.3,
    },
  };
}

export function G3FeatureDeviation({ features, address }: Props) {
  const { settings } = useSettings();
  const { thresholds } = settings;
  const units = useMemo<Units>(() => new Map(settings.features.map((f) => [f.id, f.unit])), [settings.features]);
  const figure = useCallback((context: FigureContext) => buildFigure(features, units, thresholds, context), [features, units, thresholds]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [{ label: 'Feature' }, { label: 'This transaction' }, { label: 'Usual' }, { label: 'z', numeric: true }, { label: 'Role' }],
      rows: features.map((f) => [
        { text: f.name, sub: f.description },
        { text: formatFeatureValue(f.value, units.get(f.id)) },
        { text: formatFeatureValue(f.usual, units.get(f.id)) },
        { text: f.z === null ? '—' : formatZ(f.z) },
        { text: ROLE_TEXT[f.role] },
      ]),
    }),
    [features, units],
  );

  const described = formatList(features.map((f) => (f.z === null ? `${f.name}: no comparison data` : `${f.name} ${formatZ(f.z)}`)));

  return (
    <PlotlyChart
      fileName={['feature-deviation', address, settings.snapshot?.snapshotDate ?? '']}
      title="How this transaction compares with usual"
      caption={`${snapshotCaption(settings.snapshot)} · compared with this address's own earlier transactions`}
      summary={`Distance from usual for each feature (robust z-score): ${described}.`}
      hint="Bars to the right are above this address's usual value and bars to the left are below it."
      figure={figure}
      table={table}
      tableView="always"
      zoomable={false}
      revision={address}
      height={170 + features.length * ROW_PX}
    />
  );
}
