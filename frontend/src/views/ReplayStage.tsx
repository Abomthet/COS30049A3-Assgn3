import { useMemo } from 'react';
import type { MethodId, TimelineResponse, TransactionRow } from '../api/types';
import { G1DailyActivity } from '../charts/G1DailyActivity';
import { G2TransactionsOverTime } from '../charts/G2TransactionsOverTime';
import { DirectionBadge, StatusBadge } from '../components/Badges';
import { ErrorState } from '../components/ErrorState';
import { Loading } from '../components/StatePanel';
import { useAllTransactions } from '../hooks/useAllTransactions';
import { useLimitationShown } from '../hooks/useLimitationShown';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useReplay } from '../hooks/useReplay';
import { useSettings } from '../hooks/useSettings';
import { dayKey, formatDateTime, formatDayRange } from '../lib/dates';
import { formatBtc, formatCount, plural } from '../lib/format';
import { navigate, paths } from '../lib/router';
import { daysOf, countsOf, timelineAfter } from '../lib/replay';
import { NO_FILTERS, toQuery } from '../lib/transactionFilters';

// The replay (S-06, plan section 10, R6): the address's history played forward, one transaction at a time, over
// rows E6 has already given (the same ones the transactions tab draws, so coming from there asks for nothing
// again). Charts G1 and G2 grow, the tiles count up and a flag appears when its transaction does. It is a replay
// of recorded history, never "live". With reduced motion it does not run by itself: only Step moves it.

/** The replay player: plays an address's recorded history one transaction at a time, with charts G1 and G2 and the tiles growing; shown inside the replay panel. */
export default function ReplayStage({ timeline, method }: { timeline: TimelineResponse; method: MethodId }) {
  const { address } = timeline;
  const loaded = useAllTransactions(address, toQuery({ ...NO_FILTERS, method }));
  if (loaded.request.status === 'error') return <ErrorState error={loaded.request.error} onRetry={loaded.request.retry} headingLevel={3} />;
  if (loaded.request.status !== 'success') {
    const { progress } = loaded;
    return <Loading label={progress ? `Loading the history to replay… ${formatCount(progress.loaded)} of ${formatCount(progress.total)}.` : 'Loading the history to replay…'} block />;
  }
  return <Player timeline={timeline} method={method} rows={loaded.request.data} />;
}

/** The speed chips and the buttons read the same: a name that says what happens. */
function Player({ timeline, method, rows }: { timeline: TimelineResponse; method: MethodId; rows: TransactionRow[] }) {
  const { settings } = useSettings();
  const reduced = useReducedMotion();
  const replay = useReplay(rows.length, settings.web.replay.speeds, reduced);
  const { position, playing } = replay;
  const finished = position >= rows.length;

  // The shape of everything that will be shown, which fixes the axes of G2.
  const shown = useMemo(() => rows.slice(0, position), [rows, position]);
  const view = useMemo(() => timelineAfter(timeline, rows, position), [timeline, rows, position]);
  const counts = useMemo(() => countsOf(shown, daysOf(shown)), [shown]);
  const latest = shown[position - 1];
  const flaggedNow = latest?.status === 'flagged';
  useLimitationShown(flaggedNow); // the line shows here while a flag is the latest transaction, so the footer leaves its copy out

  // What a screen reader hears: a change of state, never each step (at 20 a second that would be speech without end).
  const announcement = playing
    ? `Replay running, ${replay.speed} transactions a second.`
    : finished
      ? `Replay finished: all ${plural(rows.length, 'transaction')} shown.`
      : position === 0
        ? ''
        : `Replay paused at transaction ${formatCount(position)} of ${formatCount(rows.length)}.`;

  return (
    <div className="replay">
      <div className="replay-controls" role="group" aria-label="Replay controls">
        {reduced ? null : playing ? (
          <button type="button" className="btn btn-primary" onClick={replay.pause}>
            Pause
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={replay.play}>
            {finished ? 'Play again' : position === 0 ? 'Play' : 'Resume'}
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={replay.step} disabled={finished}>
          Step
        </button>
        <button type="button" className="btn btn-secondary" onClick={replay.restart} disabled={position === 0}>
          Restart
        </button>
        {reduced ? null : (
          <div className="replay-speed" role="group" aria-label="Speed, in transactions a second">
            {settings.web.replay.speeds.map((s) => (
              <button key={s} type="button" className="chip" aria-pressed={replay.speed === s} onClick={() => replay.setSpeed(s)}>
                {s} a second
              </button>
            ))}
          </div>
        )}
      </div>
      {reduced ? <p className="card-sub">Your system asks for less motion, so the replay does not run by itself. Use Step to move one transaction at a time.</p> : null}

      <p className="replay-progress">
        <progress value={position} max={rows.length} aria-label="Replay progress" />
        <span>
          {formatCount(position)} of {plural(rows.length, 'transaction')}
          {latest ? ` · up to ${formatDateTime(latest.time)} UTC` : ''}
        </span>
      </p>
      <p className="sr-only" role="status">
        {announcement}
      </p>

      <dl className="stat-row replay-tiles">
        <div className="stat">
          <dt>Transactions so far</dt>
          <dd>{formatCount(counts.txCount)}</dd>
        </div>
        <div className="stat">
          <dt>Active</dt>
          <dd>{latest ? formatDayRange(dayKey(shown[0].time), dayKey(latest.time)) : '—'}</dd>
        </div>
        <div className="stat">
          <dt>Unusual so far</dt>
          <dd>
            {formatCount(counts.flaggedCount)}
            <span className="stat-sub">on {plural(counts.flaggedDays, 'day')}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Scored so far</dt>
          <dd>{formatCount(counts.scoredCount)}</dd>
        </div>
      </dl>

      {latest ? (
        <p className="replay-latest">
          <strong>Latest:</strong> {formatDateTime(latest.time)} · <DirectionBadge direction={latest.direction} /> <span className="mono">{formatBtc(Math.abs(latest.netSats))}</span> ·{' '}
          <StatusBadge status={latest.status} />
          {latest.status === 'flagged' && latest.mainReason ? ` ${latest.mainReason}` : ''}
        </p>
      ) : (
        <p className="card-sub">Press Play, or Step, to begin. The charts fill in as the history is replayed.</p>
      )}
      {flaggedNow ? <p className="card-sub">{settings.limitationLine}</p> : null}

      {position > 0 ? (
        <>
          <div className="card chart-card">
            <G1DailyActivity timeline={view} onOpenDay={(date) => navigate(paths.day(timeline.address, date, method))} />
          </div>
          <div className="card chart-card">
            <G2TransactionsOverTime
              address={timeline.address}
              method={method}
              rows={shown}
              frame={rows}
              loading={null}
              revision={`${timeline.address}|replay`}
              onOpenTransaction={(row) => navigate(paths.tx(timeline.address, dayKey(row.time), row.txid, method))}
              onZoomDays={() => {}}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
