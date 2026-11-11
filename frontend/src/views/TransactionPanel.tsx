import { useEffect, useRef, type RefObject } from 'react';
import { api } from '../api/client';
import type { InsufficientHistoryBody, TransactionCore, TransactionDetail } from '../api/types';
import { G3FeatureDeviation } from '../charts/G3FeatureDeviation';
import { DirectionBadge, StatusBadge } from '../components/Badges';
import { CopyButton } from '../components/CopyButton';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { Loading, StatePanel } from '../components/StatePanel';
import { dayKey, formatDateTime, formatDay, formatDayRange } from '../lib/dates';
import { explanationBlocks } from '../lib/explanation';
import { formatBtc, formatSpanDays, plural } from '../lib/format';
import { METHODS } from '../lib/methods';
import { paths } from '../lib/router';
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
    if (detail.error.body.status === 'insufficient_history') {
      return <NotScored body={detail.error.body} address={address} headingRef={headingRef} />;
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
        <section className="flag-callout" aria-labelledby="why-title" data-testid="flag-explanation">
          <h3 id="why-title">
            <Icon name="flag" className="flag-icon" /> Why this transaction stands out
          </h3>
          {explanationBlocks(tx.explanation, tx.limitation).map((block, i) =>
            block.kind === 'text' ? (
              <p key={i}>{block.text}</p>
            ) : (
              <ul key={i} className="reasons">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ),
          )}
          <h4>Compared with</h4>
          <ul className="bases">
            {tx.comparison.map((b) => (
              <li key={b.label}>
                <strong>{b.label}:</strong> {b.description}{' '}
                <span className="muted">({formatDayRange(dayKey(b.start), dayKey(b.end))})</span>
              </li>
            ))}
          </ul>
          <p className="limitation" data-testid="limitation-line">
            <Icon name="info" />
            <span>{tx.limitation}</span>
          </p>
        </section>
      ) : (
        <p className="not-flagged-note">
          <strong>Not unusual.</strong> No feature was {tx.method.flagAbsZ} or more from this address's usual pattern.
        </p>
      )}

      <G3FeatureDeviation features={tx.features} address={tx.address} />
      <Verdicts tx={tx} />
      <p className="method-note">
        <strong>Method:</strong> {tx.method.name}. {tx.method.note}
      </p>
    </article>
  );
}

/** What each of the nine methods says about this transaction (M-13). The deciding one sets the status above. */
function Verdicts({ tx }: { tx: TransactionDetail }) {
  return (
    <section className="verdicts" aria-labelledby="verdicts-title">
      <h3 id="verdicts-title">What each model says</h3>
      <p className="card-sub">
        Nine methods score every transaction on its own scale. The deciding method ({tx.method.name}) sets the status above;
        the others are shown for comparison.
      </p>
      <table className="verdict-table">
        <caption className="sr-only">Score and verdict of each of the nine methods for this transaction</caption>
        <thead>
          <tr>
            <th scope="col">Method</th>
            <th scope="col">Family</th>
            <th scope="col" className="num">
              Score
            </th>
            <th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {METHODS.map((m) => {
            const score = tx.scores[m.id];
            return (
              <tr key={m.id} className={m.id === tx.method.id ? 'is-deciding' : undefined}>
                <th scope="row" data-label="Method">
                  {m.name}
                  {m.id === tx.method.id ? <span className="cell-sub">Deciding method</span> : null}
                </th>
                <td data-label="Family">{m.family}</td>
                <td data-label="Score" className="num mono">
                  {score === null ? '—' : score.toFixed(2)}
                </td>
                <td data-label="Verdict">
                  {score === null ? (
                    <span className="muted">Not available</span>
                  ) : tx.flags[m.id] ? (
                    <span className="badge badge-flagged">
                      <Icon name="flag" />
                      Flag
                    </span>
                  ) : (
                    <span className="muted">
                      <span aria-hidden="true">–</span>
                      <span className="sr-only">Not flagged</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function NotScored({ body, address, headingRef }: { body: InsufficientHistoryBody; address: string; headingRef: HeadingRef }) {
  const h = body.history;
  return (
    <article className="detail" aria-labelledby="detail-title">
      <header className="detail-head">
        <h2 id="detail-title" ref={headingRef} tabIndex={-1}>
          Transaction details
        </h2>
        <StatusBadge status="not-scored" />
      </header>
      <Facts tx={body.transaction} />
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
