import { useCallback, useMemo } from 'react';
import type { Data, Shape } from 'plotly.js';
import type { MethodId } from '../api/types';
import { useMethodLabels } from '../hooks/useMethods';
import { useSettings } from '../hooks/useSettings';
import { formatShare } from '../lib/format';
import { METHODS } from '../lib/methods';
import { snapshotCaption } from './caption';
import type { Figure, FigureContext } from './chartFigure';
import type { ChartTable } from './chartTable';
import { PlotlyChart } from './PlotlyChart';

// G4, model verdicts (plan section 9): one row per method, grouped by family, and on the x axis the rank of
// this transaction's score among the address's own scored transactions, from 0 to 100%. The nine scores have
// different units and one flag line is 0, so scores cannot share an axis; a rank can, and it matches what the
// Explorer means by unusual: unlike the address's own past. A method that flags is an orange triangle labelled
// "Flagged", one that does not is a blue circle, the deciding method wears a ring, and a method with no score
// (TxGPT surprisal on a hypothetical transaction) says so in words. It answers: where does this transaction
// rank for each model, and which models flag it?

interface Props {
  /** The share, 0 to 1, of the address's own scored transactions at or below this score; null where a method has no score. */
  ranks: Partial<Record<MethodId, number | null>>;
  scores: Partial<Record<MethodId, number | null>>;
  flags: Partial<Record<MethodId, boolean>>;
  deciding: MethodId;
  subject: 'transaction' | 'what-if';
  address: string;
  /** Names the exported files; a hypothetical transaction has none. */
  txid?: string;
}

type Verdict = 'flagged' | 'not-flagged' | 'unavailable';

interface Row {
  id: MethodId;
  name: string;
  family: string;
  rank: number | null;
  score: number | null;
  verdict: Verdict;
}

const VERDICT_TEXT: Record<Verdict, string> = { flagged: 'Flagged', 'not-flagged': 'Not flagged', unavailable: 'Not available' };

/** A method's name over two lines where it is long, so the labels leave the dots room on a phone. */
const wrapped = (name: string) => name.replace(/(.{10,}?) /g, '$1<br>');

function buildFigure(rows: Row[], deciding: MethodId, { palette, compact }: FigureContext): Figure {
  const position = (row: Row) => rows.indexOf(row);
  const of = (verdict: Verdict) => rows.filter((r) => r.verdict === verdict);
  const hover = (row: Row) =>
    `${row.name}<br>${formatShare(row.rank!)} of this address's scored transactions score at or below this one<br>` +
    `Score ${row.score?.toFixed(2) ?? '—'} · ${VERDICT_TEXT[row.verdict]}${row.id === deciding ? ' · deciding method' : ''}`;

  const data: Data[] = [];
  const notFlagged = of('not-flagged');
  if (notFlagged.length > 0) {
    data.push({
      type: 'scatter',
      mode: 'markers',
      name: '● Not flagged',
      x: notFlagged.map((r) => r.rank),
      y: notFlagged.map(position),
      marker: { symbol: 'circle', size: 11, color: palette.ordinary },
      hovertext: notFlagged.map(hover),
      hoverinfo: 'text',
    });
  }
  const flagged = of('flagged');
  if (flagged.length > 0) {
    data.push({
      type: 'scatter',
      mode: 'text+markers',
      name: '▲ Flagged',
      x: flagged.map((r) => r.rank),
      y: flagged.map(position),
      marker: { symbol: 'triangle-up', size: 14, color: palette.unusual },
      text: flagged.map(() => 'Flagged'),
      textposition: flagged.map((r) => (r.rank! > 0.7 ? 'middle left' : 'middle right')),
      textfont: { color: palette.text, size: compact ? 11 : 12 },
      hovertext: flagged.map(hover),
      hoverinfo: 'text',
    } as unknown as Data);
  }
  // A ring round the deciding method's dot, so it stands out by more than colour.
  const ringed = rows.find((r) => r.id === deciding && r.rank !== null);
  if (ringed) {
    data.push({
      type: 'scatter',
      mode: 'markers',
      name: '◯ Deciding method',
      x: [ringed.rank],
      y: [position(ringed)],
      marker: { symbol: 'circle-open', size: 24, color: palette.text, line: { width: 2.5, color: palette.text } },
      hoverinfo: 'skip',
    });
  }
  const unavailable = of('unavailable');
  if (unavailable.length > 0) {
    data.push({
      type: 'scatter',
      mode: 'text',
      x: unavailable.map(() => 0.02),
      y: unavailable.map(position),
      text: unavailable.map(() => 'Not available'),
      textposition: 'middle right',
      textfont: { color: palette.axisInk, size: compact ? 11 : 12 },
      hoverinfo: 'skip',
      showlegend: false,
    });
  }

  // A thin rule between the families, which the rows are grouped by.
  const rules: Array<Partial<Shape>> = rows.flatMap((row, i): Array<Partial<Shape>> =>
    i > 0 && row.family !== rows[i - 1].family
      ? [{ type: 'line', xref: 'paper', x0: 0, x1: 1, yref: 'y', y0: i - 0.5, y1: i - 0.5, line: { color: palette.grid, width: 1 } }]
      : [],
  );

  return {
    data,
    layout: {
      hovermode: 'closest',
      margin: { t: compact ? 64 : 48, r: 24 },
      legend: compact ? { y: 1.02 } : { x: 1, xanchor: 'right', y: 1.02 },
      shapes: rules,
      xaxis: { title: { text: "Share of this address's scored transactions at or below this score" }, range: [-0.03, 1.03], tickvals: [0, 0.25, 0.5, 0.75, 1], tickformat: '.0%', fixedrange: true },
      yaxis: {
        // The first method at the top, as the verdict table lists them.
        autorange: 'reversed',
        range: [rows.length - 0.5, -0.5],
        tickmode: 'array',
        tickvals: rows.map((_, i) => i),
        ticktext: rows.map((r) => `${r.id === deciding ? '<b>' : ''}${compact ? wrapped(r.name) : r.name}${r.id === deciding ? '</b>' : ''}`),
        showgrid: true,
        fixedrange: true,
      },
    },
  };
}

export function G4ModelVerdicts({ ranks, scores, flags, deciding, subject, address, txid }: Props) {
  const labels = useMethodLabels();
  const { settings } = useSettings();
  const rows = useMemo<Row[]>(
    () =>
      METHODS.map((m) => {
        const rank = ranks[m.id] ?? null;
        const score = scores[m.id] ?? null;
        const verdict: Verdict = rank === null || score === null ? 'unavailable' : flags[m.id] ? 'flagged' : 'not-flagged';
        return { id: m.id, name: labels[m.id].name, family: labels[m.id].family, rank, score, verdict };
      }),
    [ranks, scores, flags, labels],
  );
  const figure = useCallback((context: FigureContext) => buildFigure(rows, deciding, context), [rows, deciding]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [{ label: 'Method' }, { label: 'Family' }, { label: 'Score', numeric: true }, { label: 'Rank among its own transactions', numeric: true }, { label: 'Verdict' }],
      rows: rows.map((r) => [
        { text: r.name, sub: r.id === deciding ? 'Deciding method' : undefined },
        { text: r.family },
        { text: r.score === null ? '—' : r.score.toFixed(2) },
        { text: r.rank === null ? '—' : formatShare(r.rank) },
        { text: VERDICT_TEXT[r.verdict] },
      ]),
    }),
    [rows, deciding],
  );

  const flaggedBy = rows.filter((r) => r.verdict === 'flagged');
  const scored = rows.filter((r) => r.verdict !== 'unavailable').length;
  const what = subject === 'what-if' ? 'this hypothetical transaction' : 'this transaction';
  const summary = `Dot plot of where ${what} ranks among the address's own scored transactions under each of ${scored} methods. ${flaggedBy.length === 0 ? 'No method flags it' : `${flaggedBy.length} of ${scored} flag it: ${flaggedBy.map((r) => r.name).join(', ')}`}.`;

  return (
    <PlotlyChart
      fileName={['model-verdicts', address, txid ?? 'what-if', settings.snapshot?.snapshotDate ?? '']}
      title="Where each model ranks it"
      headingLevel={3}
      caption={`${snapshotCaption(settings.snapshot, address)} · Each model is compared on its own scale: a dot is ${what}'s rank among the address's own scored transactions for that model, not its score, so the nine can share one axis.`}
      summary={summary}
      hint="Hover a dot for its score and rank. The table view lists every method in words."
      figure={figure}
      table={table}
      zoomable={false}
      height={400}
    />
  );
}
