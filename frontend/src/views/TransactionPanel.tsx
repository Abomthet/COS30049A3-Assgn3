import { useEffect, useRef, type RefObject } from 'react';
import { api } from '../api/client';
import type { InsufficientHistoryBody, TransactionCore, TransactionDetail } from '../api/types';
import { G3FeatureDeviation } from '../charts/G3FeatureDeviation';
import { DirectionBadge, StatusBadge } from '../components/Badges';
import { CopyButton } from '../components/CopyButton';
import { ErrorState } from '../components/ErrorState';
import { FlagCallout } from '../components/FlagCallout';
import { Icon } from '../components/Icon';
import { Loading, StatePanel } from '../components/StatePanel';
import { VerdictTable } from '../components/VerdictTable';
import { formatDateTime, formatDay } from '../lib/dates';
import { formatBtc, formatSpanDays, plural } from '../lib/format';
import { paths } from '../lib/router';
import { useMethodLabels } from '../hooks/useMethods';
import { useRequest } from '../hooks/useRequest';

// The detail panel of Screen 3 (FR-03, FR-04, AC-03, M-13). For a flagged transaction it shows the
// service's explanation, what the features were compared against and the fixed limitation line; for
// every scored one, the feature chart and what each of the nine methods says. A transaction too early
// in its address's history to score (422) keeps its facts and says why.

export function TransactionPanel({ address, date, txid }: { address: string; date: string; txid: string | null }) {
  const detail = useRequest(txid ? `tx:${address}:${txid}` : null, (signal) => api.transaction(txid!, address, { signal }));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settled = detail.status === 'success' || detail.status === 'error';

  useEffect(() => {
    if (!txid || !settled) return;
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [txid, settled]);

  if (detail.status === 'idle') {
    return (
      <StatePanel tone="empty" title="Select a transaction" testId="state-empty-detail">
        <p>
          Choose a transaction from the list to see its amount, direction and source. Unusual ones are marked{' '}
          <StatusBadge status="flagged" />, and their details explain why.
        </p>
      </StatePanel>
    );
  }
  if (detail.status === 'loading') return <Loading label="Loading the transaction…" block />;

  if (detail.status === 'error') {
    const { body } = detail.error;
    if (body.status === 'insufficient_history' && body.transaction) {
      return <NotScored body={body} transaction={body.transaction} address={address} headingRef={headingRef} />;
    }
    return (
      <div>
        <h2 ref={headingRef} tabIndex={-1} className="sr-only">
          Transaction
        </h2>
        <ErrorState error={detail.error} onRetry={detail.retry} headingLevel={3} />
        <p>
          <a href={paths.day(address, date)}>Back to {formatDay(date)}</a>
        </p>
      </div>
    );
  }
  return <Detail tx={detail.data} headingRef={headingRef} />;
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
              View on blockstream.info <Icon name="external" />
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

function Detail({ tx, headingRef }: { tx: TransactionDetail; headingRef: HeadingRef }) {
  const methodName = useMethodLabels()[tx.method.id].name;
  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <h2 id="detail-title" ref={headingRef} tabIndex={-1}>
          Transaction details
        </h2>
        <StatusBadge status={tx.flagged ? 'flagged' : 'not-flagged'} />
      </header>
      <Facts tx={tx} />

      {tx.flagged ? (
        <FlagCallout tx={tx} title="Why this transaction stands out" />
      ) : (
        <p className="not-flagged-note">
          <strong>Not unusual.</strong> No feature was {tx.method.flagAbsZ} or more from this address's usual pattern.
        </p>
      )}

      <G3FeatureDeviation features={tx.features} address={tx.address} />
      <Verdicts tx={tx} />
      <p className="method-note">
        <strong>Method:</strong> {methodName}. {tx.method.note}
      </p>
      {tx.direction === 'none' ? null : (
        <p>
          <a className="btn btn-secondary" href={paths.whatIf(tx.address, tx.direction)}>
            Try a what-if from here
          </a>
        </p>
      )}
    </article>
  );
}

/** What each of the nine methods says about this transaction (M-13). The deciding one sets the status above. */
function Verdicts({ tx }: { tx: TransactionDetail }) {
  const methodName = useMethodLabels()[tx.method.id].name;
  return (
    <section className="verdicts" aria-labelledby="verdicts-title">
      <h3 id="verdicts-title">What each model says</h3>
      <p className="card-sub">
        Nine methods score every transaction on its own scale. The deciding method ({methodName}) sets the status above;
        the others are shown for comparison.
      </p>
      <VerdictTable scores={tx.scores} flags={tx.flags} deciding={tx.method.id} caption="Score, flag line and verdict of each of the nine methods for this transaction" />
    </section>
  );
}

function NotScored({ body, transaction, address, headingRef }: { body: InsufficientHistoryBody; transaction: TransactionCore; address: string; headingRef: HeadingRef }) {
  const h = body.history;
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
        title="Not enough history to score this transaction"
        headingLevel={3}
        testId="state-insufficient"
        actions={
          <>
            {body.firstScoredDate ? (
              <a className="btn btn-secondary" href={paths.day(address, body.firstScoredDate)}>
                Go to the first scored day ({formatDay(body.firstScoredDate)})
              </a>
            ) : (
              <a className="btn btn-secondary" href={paths.select()}>
                Choose an address with more history
              </a>
            )}
            <a className="btn btn-ghost" href={paths.timeline(address)}>
              Back to the timeline
            </a>
          </>
        }
      >
        <p>
          Before this transaction, the address had {plural(h.earlierTx, 'confirmed transaction')}, with a history spanning{' '}
          {formatSpanDays(h.spanDays)}. Scoring needs at least {h.required.minTx} earlier transactions over at least{' '}
          {h.required.minSpanDays} days, so there is nothing reliable to compare it with.
        </p>
      </StatePanel>
    </article>
  );
}
