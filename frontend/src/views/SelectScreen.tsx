import { Suspense, lazy, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react';
import { api } from '../api/client';
import type { AddressSummary, ApiError } from '../api/types';
import { AddressLink } from '../components/AddressLink';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { Loading, StatePanel } from '../components/StatePanel';
import { WatchStar } from '../components/WatchStar';
import { KIND_LABEL, validateAddress } from '../lib/address';
import { dayKey, formatDayRange } from '../lib/dates';
import { formatCount, shortAddress } from '../lib/format';
import { navigate, paths } from '../lib/router';
import { isTransient, runRequest, useRequest } from '../hooks/useRequest';
import { usePreferences } from '../hooks/usePreferences';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useMethods } from '../hooks/useMethods';
import { useSettings } from '../hooks/useSettings';
import { useScrollToSection } from '../hooks/useScrollToSection';
import { useSlow } from '../hooks/useSlow';

// The live lookup's dialog (V8) is fetched only when the user asks for it.
const LiveLookupDialog = lazy(() => import('./LiveLookupDialog'));

// Screen 1 — choose an address: a lookup box plus the list of addresses in the snapshot.
// The lookup validates in the browser first (invalid never reaches the API), then asks the
// API whether the address is in the snapshot (supported / unsupported).

const NUMBER_WORDS: Record<number, string> = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten', 11: 'eleven', 12: 'twelve' };

type Lookup =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'invalid'; message: string; hint: string }
  | { status: 'unsupported'; address: string; message: string; examples: string[]; canLookupLive: boolean }
  | { status: 'failed'; error: ApiError };

// The lookup section focuses the address box itself (more useful than its hidden heading); the others focus their headings.
const SECTION_TARGETS = {
  lookup: { scroll: 'lookup-title', focus: 'address-input' },
  recent: 'recent-title',
  snapshot: 'snapshot-title',
};

/** Screen 1, choose an address: a lookup box and the list of addresses in the snapshot. */
export function SelectScreen({ query, section }: { query: string | null; section?: string }) {
  useDocumentTitle('');
  useScrollToSection(section, SECTION_TARGETS);
  const list = useRequest('addresses', (signal) => api.listAddresses({ signal }));
  const [value, setValue] = useState(query ?? '');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const [fetching, setFetching] = useState(false);
  const { settings } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const snapshotHeading = useRef<HTMLHeadingElement>(null);
  // An address opens with the method the user chose last (V2's method menu remembers it).
  const [{ method, recent }] = usePreferences();

  async function check(text: string) {
    const local = validateAddress(text);
    if (!local.ok) {
      setLookup({ status: 'invalid', message: local.message, hint: local.hint });
      inputRef.current?.focus();
      return;
    }
    setLookup({ status: 'checking' });
    const res = await runRequest(() => api.lookup(local.address));
    if (res.ok) {
      navigate(paths.timeline(res.data.address, method ?? undefined));
      return;
    }
    const body = res.error.body;
    // The address messages carry no hint (the helper line gives the format), so the server's general hint is not shown either.
    if (body.status === 'invalid') setLookup({ status: 'invalid', message: body.message, hint: '' });
    else if (body.status === 'unsupported') setLookup({ status: 'unsupported', address: local.address, message: body.message, examples: body.examples, canLookupLive: body.canLookupLive });
    else {
      // Like a page's own request, a failure that says nothing about the address asks the status dot to look again at once.
      if (isTransient(res.error)) recheck();
      setLookup({ status: 'failed', error: res.error });
    }
  }

  // A lookup that failed because the service was down is repeated when the service is back, as a page's own request is (R4).
  const { recoveries, recheck } = useServiceStatus();
  const seenRecoveries = useRef(recoveries);
  useEffect(() => {
    if (seenRecoveries.current === recoveries) return;
    seenRecoveries.current = recoveries;
    if (lookup.status === 'failed' && isTransient(lookup.error)) void check(value);
  }, [recoveries]);

  useEffect(() => {
    // Run once for a ?q= link (used by screenshots and the walkthrough); later submits go through the form.
    if (query) void check(query);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void check(value);
  }

  function reset() {
    setValue('');
    setLookup({ status: 'idle' });
    inputRef.current?.focus();
  }

  const invalid = lookup.status === 'invalid';
  const slowLookup = useSlow(lookup.status === 'checking');
  const snapshot = list.status === 'success' ? list.data.snapshot : null;
  const methods = useMethods();
  // The panel's one line comes from the snapshot's own count (E3 or the settings); the 404's sentence is the API-facing
  // reason and is the fallback when the count is not known yet.
  const coveredCount = snapshot?.addressCount ?? settings.snapshot?.addressCount ?? null;
  const modelCount = methods.status === 'success' ? methods.data.methods.length : 0;
  // The hero's figures all come from E3 (and E11 for the models); null shows a calm placeholder.
  const stats: [string, string | null][] = [
    ['Addresses', snapshot ? formatCount(snapshot.addressCount) : null],
    ['Transactions', list.status === 'success' ? formatCount(list.data.addresses.reduce((n, a) => n + a.txCount, 0)) : null],
    ...(modelCount ? ([['Models', formatCount(modelCount)]] as [string, string][]) : []),
  ];

  const coveredLine = lookup.status === 'unsupported' && coveredCount === null ? lookup.message : `${formatCount(coveredCount ?? 0)} addresses are covered.`;

  return (
    <div className="page page-select">
      <div className="hero">
        <PageHeading className="hero-title">See what's unusual in a Bitcoin address.</PageHeading>
        <p className="hero-sub">
          Each transaction is compared with the address's own history, by {modelCount ? `${NUMBER_WORDS[modelCount] ?? modelCount} models` : 'several models'}.
        </p>

        <section className="lookup-card hero-lookup" aria-labelledby="lookup-title">
        <h2 id="lookup-title" data-section className="sr-only">Look up an address</h2>
        <form onSubmit={onSubmit} noValidate className="lookup-form">
          <label htmlFor="address-input" className="field-label">
            Bitcoin address
          </label>
          <p id="address-help" className="field-help">
            Starts with 1, 3 or bc1.
          </p>
          <div className="input-row">
            <input
              id="address-input"
              ref={inputRef}
              className="text-input mono"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (lookup.status !== 'checking') setLookup({ status: 'idle' });
              }}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. bc1q…"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? 'address-help address-error' : 'address-help'}
            />
            <button type="submit" className="btn btn-primary" disabled={lookup.status === 'checking'}>
              {lookup.status === 'checking' ? (
                <>
                  <span className="spinner spinner-inline" aria-hidden="true" /> Checking…
                </>
              ) : (
                <>
                  Look up
                </>
              )}
            </button>
          </div>
          {invalid ? (
            <p id="address-error" className="field-error" role="alert">
              <span>
                <strong>{lookup.message}</strong> {lookup.hint}
              </span>
            </p>
          ) : null}
          {lookup.status === 'checking' ? (
            <p className={slowLookup ? 'field-help' : 'sr-only'} role="status">
              {slowLookup ? 'Still checking, this is taking a little longer.' : 'Checking whether this address is in the snapshot…'}
            </p>
          ) : null}
        </form>

        {lookup.status === 'unsupported' ? (
          <StatePanel
            tone="info"
            title="This address isn't in the snapshot"
            headingLevel={3}
            live="alert"
            testId="state-unsupported"
            actions={
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Try another address
              </button>
            }
          >
            {lookup.canLookupLive ? (
              <>
                <p>{coveredLine}</p>
                <p>
                  <button type="button" className="btn btn-primary" aria-haspopup="dialog" onClick={() => setFetching(true)}>
                    Fetch its public history
                  </button>
                </p>
                <p>Or open one of these:</p>
              </>
            ) : (
              <p>{coveredCount === null ? 'Only some addresses are covered.' : `Only ${formatCount(coveredCount)} addresses are covered.`} Try one of these:</p>
            )}
            <ul className="example-list">
              {lookup.examples.map((a) => (
                <li key={a}>
                  <a className="mono" href={paths.timeline(a, method ?? undefined)}>
                    {shortAddress(a, 12, 8)}
                  </a>
                </li>
              ))}
            </ul>
          </StatePanel>
        ) : null}
        {fetching && lookup.status === 'unsupported' ? (
          <Suspense fallback={null}>
            <LiveLookupDialog address={lookup.address} method={method ?? undefined} onClose={() => setFetching(false)} />
          </Suspense>
        ) : null}
        {lookup.status === 'failed' ? <ErrorState error={lookup.error} onRetry={() => void check(value)} headingLevel={3} /> : null}
        </section>

        {list.status !== 'error' ? (
          <dl className="hero-stats" aria-busy={list.status === 'loading'}>
            {stats.map(([label, shown]) => (
              <div key={label} className="hero-stat">
                <dt>{label}</dt>
                <dd>{shown ?? <span className="hero-stat-wait" aria-hidden="true" />}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {recent.length > 0 ? (
        <section className="recent-section" aria-labelledby="recent-title">
          <h2 id="recent-title" data-section>Recently opened</h2>
          <ul className="example-list">
            {recent.map((a) => (
              <li key={a}>
                <AddressLink className="mono" address={a} href={paths.timeline(a, method ?? undefined)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="snapshot-section" aria-labelledby="snapshot-title">
        <div className="section-head">
          {/* Focusable only by script: after a page change the focus moves here, so the new rows are read from the top. */}
          <h2 id="snapshot-title" data-section ref={snapshotHeading} tabIndex={-1}>
            Addresses in the snapshot
          </h2>
        </div>
        {list.status === 'loading' ? <Loading label="Loading the address list…" block /> : null}
        {list.status === 'error' ? <ErrorState error={list.error} onRetry={list.retry} /> : null}
        {list.status === 'success' && list.data.addresses.length === 0 ? (
          <StatePanel tone="empty" title="No addresses to show">
            <p>Reload the page. If it stays empty, tell the team.</p>
          </StatePanel>
        ) : null}
        {list.status === 'success' && list.data.addresses.length > 0 ? <AddressTable addresses={list.data.addresses} headingRef={snapshotHeading} /> : null}
      </section>
    </div>
  );
}

const PAGE_SIZE = 10;

function AddressTable({ addresses, headingRef }: { addresses: AddressSummary[]; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const [{ method }] = usePreferences();
  // The list is not sorted or filtered here, so paging just cuts the list in order. A shorter list keeps the page in range.
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(addresses.length / PAGE_SIZE);
  const current = Math.min(page, pageCount - 1);
  const start = current * PAGE_SIZE;
  const shown = addresses.slice(start, start + PAGE_SIZE);
  // Focus moves to the section heading only after a click on the pager, never on first load.
  const movedByUser = useRef(false);
  useEffect(() => {
    if (!movedByUser.current) return;
    movedByUser.current = false;
    headingRef.current?.focus();
  }, [current]);
  function goTo(next: number) {
    if (next === current) return;
    movedByUser.current = true;
    setPage(next);
  }
  return (
    <div className="card table-card">
      <table className="address-table">
        <caption className="sr-only">Addresses in the snapshot, with their activity, how many transactions are scored and how many are unusual</caption>
        <thead>
          <tr>
            <th scope="col">Address</th>
            <th scope="col">Active (UTC)</th>
            <th scope="col" className="num">
              Transactions
            </th>
            <th scope="col" className="num">
              Scored
            </th>
            <th scope="col" className="num">
              Unusual
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((a) => {
            const pct = a.scoredCount ? Math.round((a.flaggedCount / a.scoredCount) * 100) : 0;
            return (
              <tr key={a.address}>
                <th scope="row" data-label="Address">
                  <span className="address-cell">
                    <WatchStar address={a.address} />
                    <span>
                      <AddressLink className="address-link mono" address={a.address} href={paths.timeline(a.address, method ?? undefined)} />
                      <span className="cell-sub">{KIND_LABEL[a.kind]}{a.source === 'live' ? ' · live data' : ''}</span>
                    </span>
                  </span>
                </th>
                <td data-label="Active (UTC)">{formatDayRange(dayKey(a.firstSeen), dayKey(a.lastSeen))}</td>
                <td data-label="Transactions" className="num">
                  {formatCount(a.txCount)}
                </td>
                <td data-label="Scored" className="num">
                  {formatCount(a.scoredCount)}
                </td>
                <td data-label="Unusual" className="num">
                  {a.history === 'insufficient' ? (
                    <span className="badge badge-not-scored">Short history</span>
                  ) : a.flaggedCount > 0 ? (
                    <span className="unusual-count">
                      <Icon name="flag" className="flag-icon" /> {formatCount(a.flaggedCount)}{' '}
                      <span className="muted">({pct}% of scored)</span>
                    </span>
                  ) : (
                    <span className="muted">None</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {pageCount > 1 ? (
        <nav className="snap-pager" aria-label="Snapshot pages">
          <span className="snap-pager-count">{`${formatCount(start + 1)}–${formatCount(start + shown.length)} of ${formatCount(addresses.length)}`}</span>
          <div className="snap-pager-controls">
            <button type="button" className="btn btn-ghost" disabled={current === 0} onClick={() => goTo(current - 1)}>
              Previous
            </button>
            <div className="snap-pager-pages">
              {Array.from({ length: pageCount }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  className="snap-pager-page"
                  aria-label={`Page ${i + 1}`}
                  aria-current={i === current ? 'page' : undefined}
                  onClick={() => goTo(i)}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-ghost" disabled={current === pageCount - 1} onClick={() => goTo(current + 1)}>
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
