import { LimitationNote } from '../components/LimitationNote';
import { Suspense, lazy, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { MethodId, TimelineDay, TimelineResponse } from '../api/types';
import { G1DailyActivity } from '../charts/G1DailyActivity';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { CopyButton } from '../components/CopyButton';
import { ErrorState } from '../components/ErrorState';
import { MethodMenu } from '../components/MethodMenu';
import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { Loading, StatePanel } from '../components/StatePanel';
import { StatBlock } from '../components/StatBlock';
import { WatchStar } from '../components/WatchStar';
import { KIND_LABEL, validateAddress } from '../lib/address';
import { dayCount, dayKey, formatDay, formatDayRange } from '../lib/dates';
import { formatCount, formatSpanDays, plural, shortAddress } from '../lib/format';
import { navigate, paths } from '../lib/router';
import { methodSearch } from '../lib/methods';
import { useMethodFallback } from '../hooks/useMethodFallback';
import { rememberAddress } from '../hooks/usePreferences';
import { useRequest } from '../hooks/useRequest';
import { useSettings } from '../hooks/useSettings';
import { ReplayPanel } from './ReplayPanel';
import { TransactionsTab } from './TransactionsTab';
import { WhatIfLab } from './WhatIfLab';

// The mark of a fetched address (S-09), with "Forget this address"; a snapshot address never loads it.
const LiveBanner = lazy(() => import('./LiveBanner'));

// Screen 2 — the address overview (FR-02, AC-01): date range, source and snapshot, the four tiles, and three
// tabs that are routes of their own. The overview tab has the daily timeline, with flagged days marked and
// a keyboard path to every flagged day; E5 supplies the days and totals, and E6 the strongest reason on each
// flagged day. The transactions tab (TransactionsTab) has the filter bar, chart G2 and the table.

/** Flagged days listed before "Show all" (plan section 8, V2). */
const DAYS_SHOWN = 8;

export type AddressTab = { name: 'overview' } | { name: 'transactions'; search: string } | { name: 'what-if'; search: string };

const TAB_TITLE: Record<AddressTab['name'], string> = { overview: 'Activity', transactions: 'Transactions', 'what-if': 'What-if' };

/** V2, the address overview: its date range, tiles and the overview, transactions and what-if tabs, for one address. */
export function TimelineScreen({ address, tab, method }: { address: string; tab: AddressTab; method: MethodId }) {
  useDocumentTitle(`${TAB_TITLE[tab.name]} for ${shortAddress(address)}`);
  const timeline = useRequest(`timeline:${address}:${method}`, (signal) => api.timeline(address, { signal, method }));
  const switching = useMethodFallback(timeline.status === 'error' ? timeline.error : undefined, method);
  // After a change of method the answer for the old one stays on screen, dimmed, until the new one arrives.
  const shown = timeline.status === 'success' ? timeline.data : timeline.previous;
  // An address counts as opened once its page has loaded, so V1's "Recently opened" never lists one that failed.
  const opened = timeline.status === 'success';
  useEffect(() => {
    if (opened) rememberAddress(address);
  }, [opened, address]);

  return (
    <div className="page page-timeline">
      <Breadcrumbs items={[{ label: 'Addresses', href: paths.select() }, { label: shortAddress(address), mono: true }]} />
      {shown === undefined && (timeline.status === 'loading' || switching) ? (
        <>
          <PageHeading className="sr-only">Activity for {address}</PageHeading>
          <Loading label="Loading this address's activity…" block />
        </>
      ) : null}
      {timeline.status === 'error' && !switching ? (
        <>
          <PageHeading>Address activity</PageHeading>
          <MethodMenu method={method} updating={false} />
          <ErrorState error={timeline.error} onRetry={timeline.retry} />
        </>
      ) : null}
      {shown !== undefined && timeline.status !== 'error' ? <Timeline data={shown} tab={tab} method={method} updating={timeline.status === 'loading'} /> : null}
    </div>
  );
}

function Timeline({ data, tab, method, updating }: { data: TimelineResponse; tab: AddressTab; method: MethodId; updating: boolean }) {
  const kind = validateAddress(data.address);
  const flaggedDays = data.days.filter((d) => d.flaggedCount > 0);
  const insufficient = data.history.status === 'insufficient';
  const [first, last] = [dayKey(data.range.start), dayKey(data.range.end)];
  const spanDays = dayCount(first, last);
  const unscored = data.totals.txCount - data.totals.scoredCount;
  // A fetched address that was cut off is missing its oldest history, so it is the oldest ones that cannot be scored.
  const unscoredNote =
    unscored <= 0
      ? undefined
      : `the ${data.live?.truncated ? 'oldest' : 'first'} ${unscored === 1 ? 'one is' : `${formatCount(unscored)} are`} too early to score`;
  const showDays = !(insufficient && flaggedDays.length === 0);
  const open = (date: string) => navigate(paths.day(data.address, date, method));

  return (
    <>
      <header className="page-head">
        <p className="eyebrow">Address{kind.ok ? ` · ${KIND_LABEL[kind.kind]}` : ''}</p>
        <div className="address-heading">
          <PageHeading className="address-title mono">{data.address}</PageHeading>
          {!data.live && data.snapshot.illustrative ? <span className="tag-illustrative">Illustrative data</span> : null}
          <CopyButton value={data.address} label="address" />
          <WatchStar address={data.address} showText />
        </div>
        {data.live ? (
          <Suspense fallback={null}>
            <LiveBanner address={data.address} live={data.live} />
          </Suspense>
        ) : null}
        <MethodMenu method={method} updating={updating} live={!!data.live} />
      </header>

      <div className={`stat-row${updating ? ' is-updating' : ''}`} aria-busy={updating}>
        <div className="stat">
          <StatBlock label="Transactions" value={formatCount(data.totals.txCount)} />
        </div>
        <div className="stat stat-wide">
          <StatBlock label="Active" value={formatDayRange(first, last)} note={plural(spanDays, 'day')} />
        </div>
        <div className="stat">
          <StatBlock
            label="Unusual"
            value={insufficient ? '—' : formatCount(data.totals.flaggedCount)}
            note={insufficient ? undefined : `on ${plural(data.totals.flaggedDays, 'day')}`}
          />
        </div>
        <div className="stat">
          <StatBlock label="Scored" value={`${formatCount(data.totals.scoredCount)} of ${formatCount(data.totals.txCount)}`} note={unscoredNote} />
        </div>
      </div>

      <AddressTabs address={data.address} tab={tab.name} method={method} />

      {tab.name === 'transactions' ? <TransactionsTab timeline={data} search={tab.search} /> : null}
      {tab.name === 'what-if' ? <WhatIfLab timeline={data} search={tab.search} /> : null}
      {tab.name === 'overview' ? (
        <>
          {insufficient ? (
            <StatePanel
              tone="warning"
              title="Too little history to score"
              testId="state-insufficient"
              actions={
                <>
                  <a className="btn btn-secondary" href={paths.transactions(data.address, methodSearch(method))}>
                    Browse its transactions
                  </a>
                  <a className="btn btn-ghost" href={paths.select()}>
                    Pick another address
                  </a>
                </>
              }
            >
              <StatBlock
                size="large"
                value={formatCount(data.history.txCount)}
                unit={`${data.history.txCount === 1 ? 'transaction' : 'transactions'} over ${formatSpanDays(data.history.spanDays)}`}
              />
              <p>
                Scoring needs {data.history.required.minTx} transactions over {data.history.required.minSpanDays} days.
              </p>
            </StatePanel>
          ) : null}

          <div className={`timeline-layout${showDays ? '' : ' timeline-solo'}${updating ? ' is-updating' : ''}`} aria-busy={updating}>
            <div className="card">
              <G1DailyActivity timeline={data} onOpenDay={open} />
            </div>

            {showDays ? <FlaggedDays address={data.address} days={flaggedDays} period={{ first, last }} method={method} /> : null}
          </div>

          <ReplayPanel timeline={data} method={method} />
        </>
      ) : null}
    </>
  );
}

/** The tabs are routes, so they are links; the current one is marked for assistive technology as well as by its look. */
function AddressTabs({ address, tab, method }: { address: string; tab: AddressTab['name']; method: MethodId }) {
  const tabs = [
    { name: 'overview', label: 'Overview', href: paths.timeline(address, method) },
    { name: 'transactions', label: 'Transactions', href: paths.transactions(address, methodSearch(method)) },
    { name: 'what-if', label: 'What-if', href: paths.whatIf(address, undefined, method) },
  ] as const;
  return (
    <nav className="tabs" aria-label="Views of this address">
      <ul>
        {tabs.map((t) => (
          <li key={t.name}>
            <a href={t.href} aria-current={t.name === tab ? 'page' : undefined}>
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function FlaggedDays({ address, days, period, method }: { address: string; days: TimelineDay[]; period: { first: string; last: string }; method: MethodId }) {
  const { settings } = useSettings();
  const [showAll, setShowAll] = useState(false);
  // The strongest flagged transactions first, so the first row met for a day gives its reason.
  const flagged = useRequest(days.length > 0 ? `flagged:${address}:${method}` : null, (signal) =>
    api.transactions(address, { status: ['flagged'], sort: '-score', pageSize: settings.web.lists.maxPageSize, method }, { signal }),
  );
  const reasons = new Map<string, string>();
  if (flagged.status === 'success') {
    for (const row of flagged.data.transactions) {
      if (row.mainReason && !reasons.has(dayKey(row.time))) reasons.set(dayKey(row.time), row.mainReason);
    }
  }
  const newestFirst = [...days].reverse();
  const shown = showAll ? newestFirst : newestFirst.slice(0, DAYS_SHOWN);

  return (
    <section className="card flagged-card" aria-labelledby="flagged-title">
      <h2 id="flagged-title" className="sr-only">
        Days with unusual transactions
      </h2>
      {days.length > 0 ? (
        <>
          <StatBlock
            size="large"
            testId="flagged-headline"
            value={plural(days.length, 'day')}
            note={`with unusual transactions · ${formatDayRange(period.first, period.last)}`}
          />
          <p className="sort-label">Newest first</p>
          <ul className="day-list">
            {shown.map((d) => (
              <li key={d.date}>
                <a className="day-link" href={paths.day(address, d.date, method)}>
                  <span className="day-link-date">{formatDay(d.date)}</span>
                  {reasons.has(d.date) ? <span className="day-link-reason">{reasons.get(d.date)}</span> : null}
                  <span className="day-link-count">
                    {d.flaggedCount} of {formatCount(d.txCount)}
                    <span className="sr-only"> {d.txCount === 1 ? 'transaction' : 'transactions'} unusual</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <LimitationNote />
          {days.length > DAYS_SHOWN ? (
            <button type="button" className="btn btn-secondary show-all" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer days' : `Show all ${days.length} days`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="card-sub">
          No unusual days. <a href={paths.transactions(address, methodSearch(method))}>Browse all transactions</a>
        </p>
      )}
    </section>
  );
}
