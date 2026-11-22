import { useEffect, useRef, type RefObject } from 'react';
import { api } from '../api/client';
import type { ExplanationRequest, InsufficientHistoryBody, MethodId, TransactionCore, TransactionDetail } from '../api/types';
import { G3FeatureDeviation } from '../charts/G3FeatureDeviation';
import { LazyG4 } from '../charts/LazyG4';
import { DirectionBadge, StatusBadge } from '../components/Badges';
import { CopyButton } from '../components/CopyButton';
import { NotFlaggedExplanation } from '../components/Explanation';
import { ErrorState } from '../components/ErrorState';
import { FlagCallout } from '../components/FlagCallout';
import { Loading, StatePanel } from '../components/StatePanel';
import { StatBlock } from '../components/StatBlock';
import { VerdictTable } from '../components/VerdictTable';
import { formatDateTime, formatDay } from '../lib/dates';
import { formatBtc, formatSpanDays } from '../lib/format';
import { DEFAULT_METHOD } from '../lib/methods';
import { paths } from '../lib/router';
import { useThresholds } from '../hooks/useMethods';
import { useRequest } from '../hooks/useRequest';

// The detail panel of Screen 3 (FR-03, FR-04, AC-03, M-13). For a flagged transaction it shows the
// service's explanation, what the features were compared against and the fixed limitation line; for
// every scored one, the feature chart and what each of the nine methods says. A transaction too early
// in its address's history to score (422) keeps its facts and says why.

/** The transaction detail panel: the explanation of an unusual transaction, its features and the nine methods' verdicts; used on the day screen. */
export function TransactionPanel({ address, date, txid, method }: { address: string; date: string; txid: string | null; method: MethodId }) {
  const detail = useRequest(txid ? `tx:${address}:${txid}:${method}` : null, (signal) => api.transaction(txid!, address, { signal, method }));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settled = detail.status === 'success' || detail.status === 'error';

  useEffect(() => {
    if (!txid || !settled) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [txid, settled]);

  if (detail.status === 'idle') {
    return (
      <StatePanel tone="empty" title="Pick a transaction to see its details." testId="state-empty-detail" />
    );
  }
  if (detail.status === 'loading') {
    // The same transaction under another method stays on screen, dimmed, until the new answer arrives.
    return detail.previous?.txid === txid ? <Detail tx={detail.previous} headingRef={headingRef} method={method} updating /> : <Loading label="Loading the transaction…" block />;
  }

  if (detail.status === 'error') {
    const { body } = detail.error;
    if (body.status === 'insufficient_history' && body.transaction) {
      return <NotScored body={body} transaction={body.transaction} address={address} method={method} headingRef={headingRef} />;
    }
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          Transaction
        </h2>
        <ErrorState error={detail.error} onRetry={detail.retry} headingLevel={3} />
        <p>
          <a href={paths.day(address, date, method)}>Back to {formatDay(date)}</a>
        </p>
      </div>
    );
  }
  return <Detail tx={detail.data} headingRef={headingRef} method={method} updating={false} />;
}

type HeadingRef = RefObject<HTMLHeadingElement | null>;

function Facts({ tx }: { tx: TransactionCore }) {
  return (
    <dl className="facts">
      <div className="fact fact-wide">
        <dt>Transaction ID</dt>
        <dd className="txid-row">
          <span className="mono txid">{tx.txid}</span>
          <CopyButton value={tx.txid} label="transaction ID" />
        </dd>
      </div>
      <div className="fact">
        <dt>Confirmed</dt>
        <dd>
          {formatDateTime(tx.time)}
          <span className="fact-sub">Block {tx.blockHeight.toLocaleString('en-US')}</span>
        </dd>
      </div>
      <div className="fact">
        <dt>Amount for this address</dt>
        <dd>
          <span className="mono amount">{formatBtc(tx.netSats, { signed: true })}</span>
          <DirectionBadge direction={tx.direction} />
        </dd>
      </div>
      <div className="fact">
        <dt>How the amount is made up</dt>
        <dd className="flow">
          <span className="flow-label">Received</span>
          <span className="mono">{formatBtc(tx.receivedSats)}</span>
          <span className="flow-label">Sent</span>
          <span className="mono">{formatBtc(tx.sentSats)}</span>
        </dd>
      </div>
      <div className="fact">
        <dt>Source</dt>
        <dd>
          {tx.sourceUrl ? (
            <a href={tx.sourceUrl} target="_blank" rel="noopener noreferrer">
              View on blockstream.info
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            <span className="muted">No public page for this transaction</span>
          )}
        </dd>
      </div>
    </dl>
  );
}

function Detail({ tx, headingRef, method, updating }: { tx: TransactionDetail; headingRef: HeadingRef; method: MethodId; updating: boolean }) {
  const flagLine = useThresholds()[tx.method.id] ?? (tx.method.id === DEFAULT_METHOD ? tx.method.flagAbsZ : undefined);
  // The Assistant explains the default method's flag, which is what the prepared answers and E12 are about.
  const request: ExplanationRequest | undefined = tx.method.id === DEFAULT_METHOD ? { address: tx.address, txid: tx.txid } : undefined;
  return (
    <article className={`detail${updating ? ' is-updating' : ''}`} aria-labelledby="detail-title" aria-busy={updating}>
      <header className="detail-head">
        <h2 id="detail-title" ref={headingRef} tabIndex={-1}>
          Transaction details
        </h2>
        <StatusBadge status={tx.flagged ? 'flagged' : 'not-flagged'} />
      </header>
      <Facts tx={tx} />

      {tx.flagged ? (
        <FlagCallout tx={tx} title="Why it stands out" request={request} />
      ) : (
        <p className="not-flagged-note">
          Score {tx.score.toFixed(2)}
          {flagLine === undefined ? '.' : `, below the flag line of ${flagLine.toFixed(2)}.`}
        </p>
      )}

      {!tx.flagged && request ? <NotFlaggedExplanation request={request} tx={tx} /> : null}
      <G3FeatureDeviation features={tx.features} address={tx.address} />
      <Verdicts tx={tx} />
      {tx.direction === 'none' ? null : (
        <p>
          <a className="btn btn-secondary" href={paths.whatIf(tx.address, tx.direction, method)}>
            Try a what-if from here
          </a>
        </p>
      )}
    </article>
  );
}

/** What each of the nine models says about this transaction (M-13). The deciding one sets the status above. */
function Verdicts({ tx }: { tx: TransactionDetail }) {
  return (
    <section className="verdicts" aria-labelledby="verdicts-title">
      <h3 id="verdicts-title">What each model says</h3>
      <p className="card-sub">The row marked Deciding sets the status; the others are for comparison.</p>
      <VerdictTable scores={tx.scores} flags={tx.flags} deciding={tx.method.id} caption="Score, flag line and verdict of each of the nine models for this transaction" />
      <div className="card chart-card">
        <LazyG4 ranks={tx.ranks} scores={tx.scores} flags={tx.flags} deciding={tx.method.id} subject="transaction" address={tx.address} txid={tx.txid} />
      </div>
    </section>
  );
}

function NotScored({ body, transaction, address, method, headingRef }: { body: InsufficientHistoryBody; transaction: TransactionCore; address: string; method: MethodId; headingRef: HeadingRef }) {
  const h = body.history;
  const earlier = earlierText(h.earlierTx, h.spanDays);
  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <h2 id="detail-title" ref={headingRef} tabIndex={-1}>
          Transaction details
        </h2>
        <StatusBadge status="not-scored" />
      </header>
      <Facts tx={transaction} />
      <StatePanel
        tone="warning"
        title="Too little history to score"
        headingLevel={3}
        testId="state-insufficient"
        actions={
          <>
            {body.firstScoredDate ? (
              <a className="btn btn-secondary" href={paths.day(address, body.firstScoredDate, method)}>
                Go to the first scored day ({formatDay(body.firstScoredDate)})
              </a>
            ) : (
              <a className="btn btn-secondary" href={paths.select()}>
                Choose an address with more history
              </a>
            )}
            <a className="btn btn-ghost" href={paths.timeline(address, method)}>
              Back to the timeline
            </a>
          </>
        }
      >
        <StatBlock testId="not-scored-lead" value={earlier.value} unit={earlier.unit} />
        <p>
          Scoring needs {h.required.minTx} transactions over {h.required.minSpanDays} days.
        </p>
      </StatePanel>
    </article>
  );
}

/** The lead of the not-scored panel as a number and its words: "9" "earlier transactions, 53 days", "1" "earlier transaction", "No" "earlier transactions". */
export function earlierText(earlierTx: number, spanDays: number): { value: string; unit: string } {
  if (earlierTx === 0) return { value: 'No', unit: 'earlier transactions' };
  if (earlierTx === 1) return { value: '1', unit: 'earlier transaction' };
  return { value: String(earlierTx), unit: `earlier transactions, ${formatSpanDays(spanDays)}` };
}
