import { api } from '../api/client';
import type { MethodId, TimelineResponse, TransactionsResponse } from '../api/types';
import { DirectionBadge, StatusBadge } from '../components/Badges';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { MethodMenu } from '../components/MethodMenu';
import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { Loading, StatePanel } from '../components/StatePanel';
import { formatDay, formatTime, isDayKey } from '../lib/dates';
import { formatBtc, plural, shortAddress, shortTxid } from '../lib/format';
import { paths } from '../lib/router';
import { useMethodFallback } from '../hooks/useMethodFallback';
import { useRequest } from '../hooks/useRequest';
import { useSettings } from '../hooks/useSettings';
import { TransactionPanel } from './TransactionPanel';

// Screen 3 — one day's transactions beside the transaction detail (FR-03).

/** Screen 3: one day's transactions beside the detail of the chosen transaction. */
export function DayScreen({ address, date, txid, method }: { address: string; date: string; txid: string | null; method: MethodId }) {
  const validDate = isDayKey(date);
  useDocumentTitle(validDate ? `${formatDay(date)} · ${shortAddress(address)}` : shortAddress(address));
  const timeline = useRequest(`timeline:${address}:${method}`, (signal) => api.timeline(address, { signal, method }));
  const { settings } = useSettings();
  const pageSize = settings.web.lists.maxPageSize;
  // An invalid day in the link is answered here, so nothing is sent for it.
  const day = useRequest(validDate ? `day:${address}:${date}:${method}` : null, (signal) => api.transactions(address, { date, pageSize, method }, { signal }));
  const switching = useMethodFallback(day.status === 'error' ? day.error : undefined, method);
  // After a change of method the day's list for the old one stays on screen, dimmed, until the new one arrives.
  const shownDay = day.status === 'success' ? day.data : day.previous;
  const updating = day.status === 'loading' && shownDay !== undefined;

  return (
    <div className="page page-day">
      <Breadcrumbs
        items={[
          { label: 'Addresses', href: paths.select() },
          { label: shortAddress(address), href: paths.timeline(address, method), mono: true },
          { label: validDate ? formatDay(date) : 'Day' },
        ]}
      />
      <header className="page-head">
        <p className="eyebrow mono">{shortAddress(address, 12, 8)}</p>
        <PageHeading>{validDate ? formatDay(date) : 'Unknown day'}</PageHeading>
        <MethodMenu method={method} updating={updating} live={timeline.status === 'success' && !!timeline.data.live} />
      </header>

      {timeline.status === 'success' && validDate ? <DayNav timeline={timeline.data} date={date} method={method} /> : null}

      {!validDate ? (
        <StatePanel
          tone="error"
          title="That link has an invalid day"
          live="alert"
          actions={
            <a className="btn btn-secondary" href={paths.timeline(address, method)}>
              Back to the timeline
            </a>
          }
        >
          <p>Pick a day on the timeline.</p>
        </StatePanel>
      ) : (
        <>
          {shownDay === undefined && (day.status === 'loading' || switching) ? <Loading label="Loading the day's transactions…" block /> : null}
          {day.status === 'error' && !switching ? <ErrorState error={day.error} onRetry={day.retry} /> : null}
          {shownDay !== undefined && day.status !== 'error' ? <DayBody day={shownDay} date={date} txid={txid} method={method} updating={updating} /> : null}
        </>
      )}
    </div>
  );
}

function DayNav({ timeline, date, method }: { timeline: TimelineResponse; date: string; method: MethodId }) {
  const before = timeline.days.filter((d) => d.date < date);
  const after = timeline.days.filter((d) => d.date > date);
  const prev = before[before.length - 1];
  const next = after[0];
  const prevFlag = [...before].reverse().find((d) => d.flaggedCount > 0);
  const nextFlag = after.find((d) => d.flaggedCount > 0);
  const link = (target: { date: string } | undefined, label: string, flag = false) =>
    target ? (
      <a className={`nav-link${flag ? ' nav-link-flag' : ''}`} href={paths.day(timeline.address, target.date, method)}>
        {flag ? <Icon name="flag" className="flag-icon" /> : null}
        <span>
          {label}
          <span className="nav-date">{formatDay(target.date)}</span>
        </span>
      </a>
    ) : (
      <span className="nav-link nav-link-disabled" aria-disabled="true">
        {label}
        <span className="nav-date">none</span>
      </span>
    );

  return (
    <nav className="day-nav" aria-label="Other days">
      <div className="day-nav-group">
        {link(prev, 'Previous day')}
        {link(next, 'Next day')}
      </div>
      <div className="day-nav-group">
        {link(prevFlag, 'Previous unusual day', true)}
        {link(nextFlag, 'Next unusual day', true)}
      </div>
    </nav>
  );
}

function DayBody({ day, date, txid, method, updating }: { day: TransactionsResponse; date: string; txid: string | null; method: MethodId; updating: boolean }) {
  if (day.transactions.length === 0) {
    return (
      <StatePanel
        tone="empty"
        title={`No transactions on ${formatDay(date)}`}
        actions={
          <a className="btn btn-secondary" href={paths.timeline(day.address, method)}>
            Back to the timeline
          </a>
        }
      />
    );
  }
  const flagged = day.transactions.filter((t) => t.status === 'flagged').length;

  return (
    <div className="day-layout">
      <section className={`card tx-list-card${updating ? ' is-updating' : ''}`} aria-labelledby="tx-list-title" aria-busy={updating}>
        <h2 id="tx-list-title">{plural(day.total, 'transaction')}</h2>
        <p className="card-sub">{flagged ? `${flagged} unusual` : 'None unusual on this day'}</p>
        {day.total > day.transactions.length ? <p className="card-sub">First {day.transactions.length} shown, oldest first.</p> : null}
        <ul className="tx-list">
          {day.transactions.map((t) => {
            const selected = t.txid === txid;
            return (
              <li key={t.txid}>
                <a
                  className={`tx-row${selected ? ' is-selected' : ''}${t.status === 'flagged' ? ' is-flagged' : ''}`}
                  href={paths.tx(day.address, date, t.txid, method)}
                  aria-current={selected ? 'true' : undefined}
                >
                  <span className="tx-row-top">
                    <span className="tx-time">{formatTime(t.time)}</span>
                    <StatusBadge status={t.status} />
                  </span>
                  <span className="tx-row-mid">
                    <span className="mono amount">{formatBtc(t.netSats, { signed: true })}</span>
                    <DirectionBadge direction={t.direction} />
                  </span>
                  {t.status === 'flagged' && t.mainReason ? <span className="tx-row-reason">{t.mainReason}</span> : null}
                  <span className="tx-row-id mono">{shortTxid(t.txid)}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card detail-card" aria-label="Transaction details">
        <TransactionPanel address={day.address} date={date} txid={txid} method={method} />
      </section>
    </div>
  );
}
