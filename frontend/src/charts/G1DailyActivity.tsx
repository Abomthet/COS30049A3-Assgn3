import { useCallback, useMemo } from 'react';
import type { Data } from 'plotly.js';
import type { TimelineDay, TimelineResponse } from '../api/types';
import { useMethodLabels } from '../hooks/useMethods';
import { addDays, dayCount, dayKey, formatDay } from '../lib/dates';
import { plural } from '../lib/format';
import { paths } from '../lib/router';
import { snapshotCaption } from './caption';
import type { Figure, FigureContext } from './chartFigure';
import type { ChartTable } from './chartTable';
import { PlotlyChart, type KeyboardStops } from './PlotlyChart';

// G1, daily activity (plan section 9): one bar per day with transactions, on a continuous date
// axis, so quiet stretches show as gaps. A day with an unusual transaction is orange AND has a
// triangle above it, so the highlight never depends on colour alone. It answers FR-02: when was
// this address active, and on which days did something unusual happen?

const DAY_MS = 86_400_000;
const BAR_WIDTH_MS = 0.8 * DAY_MS;
/** A history shorter than this many days is padded, so a few days do not become a few giant bars. */
const MIN_AXIS_DAYS = 21;
/** On a phone the chart opens on this many days; the range slider shows the rest. */
const PHONE_WINDOW_DAYS = 183;
const TRIANGLE = '▲';
/** The periods the range buttons zoom to, counted back from the end of the axis. */
const PERIODS = [
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 },
];

interface Props {
  timeline: TimelineResponse;
  onOpenDay: (date: string) => void;
}

/** A position on the date axis, as the text Plotly reads: 'YYYY-MM-DD HH:MM:SS' in UTC. */
const axisTime = (day: string, offsetMs = 0) => new Date(Date.parse(`${day}T00:00:00Z`) + offsetMs).toISOString().slice(0, 19).replace('T', ' ');

type Group = 'ordinary' | 'unusual';

const groupOf = (day: TimelineDay): Group => (day.flaggedCount > 0 ? 'unusual' : 'ordinary');

const hoverText = (day: TimelineDay) =>
  `${formatDay(day.date)} (UTC)<br>${plural(day.txCount, 'transaction')}, ` +
  `${day.flaggedCount > 0 ? `${day.flaggedCount} unusual` : 'none unusual'}<br>Select to open this day`;

/** The axis time `months` months before `time`, in the same text form. */
function monthsBefore(time: string, months: number): string {
  const date = new Date(`${time.replace(' ', 'T')}Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/** Everything about the data that does not depend on the theme or the size. */
function buildModel({ days, range }: Pick<TimelineResponse, 'days' | 'range'>) {
  // The padded span of the axis. E5 gives the range as the first and last transaction time.
  const [first, last] = [dayKey(range.start), dayKey(range.end)];
  const pad = Math.max(0, Math.ceil((MIN_AXIS_DAYS - dayCount(first, last)) / 2));
  const start = addDays(first, -pad);
  const end = addDays(last, pad);

  // One bar trace per kind of day; a kind with no days has no trace, so no empty legend entry.
  const kinds: Group[] = (['ordinary', 'unusual'] as const).filter((g) => days.some((d) => groupOf(d) === g));
  const byKind = new Map(kinds.map((kind) => [kind, days.filter((d) => groupOf(d) === kind)]));

  // The keyboard visits days with activity oldest first, each a point of its trace.
  const placed = { ordinary: 0, unusual: 0 };
  const stops: KeyboardStops['points'] = days.map((day) => {
    const kind = groupOf(day);
    return {
      curve: kinds.indexOf(kind),
      point: placed[kind]++,
      label: `${formatDay(day.date)}: ${plural(day.txCount, 'transaction')}, ${day.flaggedCount} unusual.`,
    };
  });
  // A period longer than the history stops at its start, as Plotly's own buttons did.
  const fullRange: [string, string] = [axisTime(start, -DAY_MS / 2), axisTime(end, DAY_MS / 2)];
  const rangeButtons = [
    ...PERIODS.map(({ label, months }) => ({ label, range: [monthsBefore(fullRange[1], months) < fullRange[0] ? fullRange[0] : monthsBefore(fullRange[1], months), fullRange[1]] as [string, string] })),
    { label: 'All', range: fullRange },
  ];
  return { start, end, kinds, byKind, stops, fullRange, rangeButtons, maxCount: Math.max(1, ...days.map((d) => d.txCount)) };
}

type Model = ReturnType<typeof buildModel>;

function buildFigure(model: Model, { palette, compact }: FigureContext): Figure {
  const styles: Record<Group, { name: string; color: string }> = {
    ordinary: { name: 'No unusual transactions', color: palette.ordinary },
    unusual: { name: `At least one unusual transaction ${TRIANGLE}`, color: palette.unusual },
  };
  const data = model.kinds.map((kind): Data => {
    const days = model.byKind.get(kind)!;
    return {
      type: 'bar',
      name: styles[kind].name,
      x: days.map((d) => d.date),
      y: days.map((d) => d.txCount),
      width: days.map(() => BAR_WIDTH_MS),
      customdata: days.map((d) => d.date),
      marker: { color: styles[kind].color },
      hovertext: days.map(hoverText),
      hoverinfo: 'text',
      legendgroup: kind,
    };
  });

  // The triangle above each day with an unusual transaction: a marker trace sitting just over the
  // bar, in the bars' legend group so hiding the orange bars hides the triangles too. It is
  // appended after the bars, so the bars keep the trace numbers the keyboard stops refer to.
  const flagged = model.byKind.get('unusual');
  if (flagged) {
    data.push({
      type: 'scatter',
      mode: 'markers',
      x: flagged.map((d) => d.date),
      y: flagged.map((d) => d.txCount + model.maxCount * 0.06),
      marker: { symbol: 'triangle-up', size: 9, color: palette.unusual },
      hoverinfo: 'skip',
      legendgroup: 'unusual',
      showlegend: false,
    });
  }

  const { fullRange } = model;
  const opening: [string, string] =
    compact && dayCount(model.start, model.end) > PHONE_WINDOW_DAYS ? [axisTime(addDays(model.end, 1 - PHONE_WINDOW_DAYS), -DAY_MS / 2), fullRange[1]] : fullRange;
  return {
    data,
    layout: {
      hovermode: 'x',
      bargap: 0,
      // Room above the plot for the legend, which wraps onto a second line on a phone, and below Plotly's tool bar on a desktop.
      margin: { t: compact ? 64 : 52, r: 16 },
      legend: compact ? { y: 1.02 } : { x: 1, xanchor: 'right', y: 1.02 },
      xaxis: {
        type: 'date',
        range: opening,
        title: { text: 'Date (UTC)' },
        hoverformat: '%-d %b %Y',
        rangeslider: { visible: true, range: fullRange, thickness: 0.1, bgcolor: palette.surfaceRaised, bordercolor: palette.axis, borderwidth: 1 },
      },
      yaxis: {
        title: { text: 'Transactions per day' },
        rangemode: 'tozero',
        tickformat: ',d',
        // Whole counts only: with few transactions Plotly would otherwise label 0.5 as "1".
        ...(model.maxCount <= 6 ? { dtick: 1 } : {}),
        // Only the date axis zooms; a count scale that moved would mislead.
        fixedrange: true,
      },
    },
  };
}

export function G1DailyActivity({ timeline, onOpenDay }: Props) {
  const { address, days, range, snapshot } = timeline;
  const methodName = useMethodLabels()[snapshot.method.id].name;
  const model = useMemo(() => buildModel({ days, range }), [days, range]);
  const figure = useCallback((context: FigureContext) => buildFigure(model, context), [model]);

  const table = useMemo<ChartTable>(
    () => ({
      columns: [{ label: 'Date (UTC)' }, { label: 'Transactions', numeric: true }, { label: 'Unusual', numeric: true }],
      rows: days.map((d) => [
        { text: formatDay(d.date), href: paths.day(address, d.date, snapshot.method.id) },
        { text: String(d.txCount) },
        { text: d.flaggedCount > 0 ? String(d.flaggedCount) : '—' },
      ]),
    }),
    [days, address, snapshot.method.id],
  );

  const keyboard = useMemo<KeyboardStops>(
    () => ({
      points: model.stops,
      onOpen: (index) => onOpenDay(days[index].date),
      instructions: 'Use the left and right arrow keys to move between days with activity and Enter to open a day.',
    }),
    [model, days, onOpenDay],
  );

  const flaggedDays = days.filter((d) => d.flaggedCount > 0).length;
  const summary = `Bar chart of transactions per day from ${formatDay(dayKey(range.start))} to ${formatDay(dayKey(range.end))}: ${plural(days.length, 'day')} with activity, ${plural(flaggedDays, 'day')} with unusual transactions.`;

  return (
    <PlotlyChart
      fileName={['daily-activity', address, snapshot.snapshotDate]}
      title="Transactions per day"
      headingLevel={2}
      caption={`${snapshotCaption(snapshot, address)} · days in UTC · flagged by ${methodName}`}
      summary={summary}
      hint="Select a bar to open that day. Drag to zoom, double-click to reset. With a keyboard, focus the chart and use the arrow keys."
      figure={figure}
      table={table}
      revision={address}
      height={430}
      onPointClick={(click) => onOpenDay(click.customdata as string)}
      keyboard={keyboard}
      rangeButtons={model.rangeButtons}
      empty={
        days.length === 0
          ? {
              title: 'No activity to chart',
              body: 'This address has no transactions in the snapshot, so there is nothing to draw.',
              action: (
                <a className="btn btn-secondary" href={paths.select()}>
                  Choose another address
                </a>
              ),
            }
          : undefined
      }
    />
  );
}
