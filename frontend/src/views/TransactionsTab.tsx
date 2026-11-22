import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { TimelineResponse, TransactionRow } from '../api/types';
import { G2TransactionsOverTime } from '../charts/G2TransactionsOverTime';
import { ErrorState } from '../components/ErrorState';
import { ExportMenu } from '../components/ExportMenu';
import { FilterBar } from '../components/FilterBar';
import { Loading, StatePanel } from '../components/StatePanel';
import { dayKey } from '../lib/dates';
import { plural } from '../lib/format';
import { selectionPage } from '../lib/selection';
import { navigate, paths } from '../lib/router';
import {
  NO_FILTERS,
  filtersToSearch,
  parseFilters,
  queryKey,
  toQuery,
  validateFilters,
  type Filters,
} from '../lib/transactionFilters';
import { useAllTransactions } from '../hooks/useAllTransactions';
import { useRequest } from '../hooks/useRequest';
import { useSettings } from '../hooks/useSettings';
import { TransactionTable } from './TransactionTable';

// The selection's summary and its date-span form, fetched with the tab.
const SelectionBar = lazy(() => import('./SelectionBar'));

// The transactions tab of V2 (plan section 8): the filter bar, chart G2 and the transaction table,
// all driven by the filters in the address bar. A change of filter writes the address bar, which
// sends E6 again and redraws the chart and the table together.

/** The transactions tab of an address: the filter bar, chart G2, the selection bar and the transaction table, all driven by the address bar. */
export function TransactionsTab({ timeline, search }: { timeline: TimelineResponse; search: string }) {
  const { address, range, totals } = timeline;
  const { settings } = useSettings();
  const filters = parseFilters(search);
  const period = { first: dayKey(range.start), last: dayKey(range.end) };
  const errors = validateFilters(filters, period.last);
  const valid = errors.from === undefined && errors.to === undefined;
  const narrowing = valid ? toQuery(filters) : null;

  // Nothing is sent while a date is wrong (plan section 8).
  const tableQuery = narrowing && { ...narrowing, sort: filters.sort, page: filters.page, pageSize: settings.web.lists.pageSize };
  const table = useRequest(tableQuery && `table:${address}:${queryKey(tableQuery)}`, (signal) => api.transactions(address, tableQuery!, { signal }));
  const chart = useAllTransactions(address, narrowing);
  const page = table.status === 'success' ? table.data : table.previous;
  const updating = table.status === 'loading' && page !== undefined;

  // The filters in the link, with some of them changed. A new filter starts again at page 1. Each
  // change replaces the history entry, so Back leaves the tab instead of stepping through every chip.
  const change = (patch: Partial<Filters>) => navigate(paths.transactions(address, filtersToSearch({ ...filters, page: 1, ...patch })), { replace: true });
  const reset = () => change({ status: NO_FILTERS.status, direction: NO_FILTERS.direction, from: '', to: '' });

  // Zooming the chart's time axis sets the date range, and a reset clears it. Days beyond the active period are no limit at all.
  const zoomDays = (days: { from: string; to: string } | null) => {
    const next = days ? { from: days.from <= period.first ? '' : days.from, to: days.to >= period.last ? '' : days.to } : { from: '', to: '' };
    if (next.from !== filters.from || next.to !== filters.to) change(next);
  };
  const open = (row: TransactionRow) => navigate(paths.tx(address, dayKey(row.time), row.txid, filters.method));

  // A selection (S-07) is some of the rows the chart draws, kept here and not in the address; any change of the filters ends it.
  const [selection, setSelection] = useState<{ ids: ReadonlySet<string>; epoch: number } | null>(null);
  const chartRevision = `${address}|${filters.from}|${filters.to}|${filters.status}|${filters.direction}`;
  useEffect(() => setSelection(null), [chartRevision]);
  const select = (rows: TransactionRow[] | null) => setSelection((before) => (rows ? { ids: new Set(rows.map((r) => r.txid)), epoch: (before?.epoch ?? 0) + 1 } : null));
  const selectedRows = selection && chart.rows ? chart.rows.filter((r) => selection.ids.has(r.txid)) : null;

  // A new page starts at the top of the table; the first render does not scroll.
  const tableTop = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else tableTop.current?.scrollIntoView({ block: 'start' });
  }, [filters.page]);

  let results;
  if (!valid) {
    results = (
      <StatePanel tone="warning" title="Check the dates" testId="state-invalid-filters" />
    );
  } else if (table.status === 'error') {
    results = <ErrorState error={table.error} onRetry={table.retry} />;
  } else if (page === undefined) {
    results = <Loading label="Loading the transactions…" block />;
  } else if (page.total === 0) {
    results = (
      <StatePanel
        tone="empty"
        title="No transactions match"
        testId="state-empty-filters"
        actions={
          <button type="button" className="btn btn-secondary" onClick={reset}>
            Reset filters
          </button>
        }
      >
        <p>Widen the dates or clear a filter.</p>
      </StatePanel>
    );
  } else if (page.transactions.length === 0) {
    results = (
      <StatePanel
        tone="empty"
        title={`There is no page ${filters.page}`}
        testId="state-page-past-end"
        actions={
          <a className="btn btn-secondary" href={paths.transactions(address, filtersToSearch({ ...filters, page: 1 }))}>
            Go to the first page
          </a>
        }
      >
        <p>These filters match {plural(page.total, 'transaction')}.</p>
      </StatePanel>
    );
  } else {
    results = (
      <>
        <div className="card chart-card">
          {chart.request.status === 'error' ? (
            <ErrorState error={chart.request.error} onRetry={chart.request.retry} headingLevel={3} />
          ) : chart.rows ? (
            <G2TransactionsOverTime
              address={address}
              method={filters.method}
              rows={chart.rows}
              loading={chart.progress}
              revision={`${address}|${filters.from}|${filters.to}`}
              onOpenTransaction={open}
              onZoomDays={zoomDays}
              selection={selection}
              onSelect={select}
            />
          ) : (
            <Loading label="Loading the chart…" block />
          )}
        </div>
        {chart.rows ? (
          <Suspense fallback={null}>
            <SelectionBar rows={chart.rows} selected={selectedRows} onSelect={select} onClear={() => select(null)} />
          </Suspense>
        ) : null}
        <div ref={tableTop}>
          <TransactionTable page={selectedRows ? selectionPage(address, selectedRows, filters.sort) : page} method={filters.method} pageHref={(n) => paths.transactions(address, filtersToSearch({ ...filters, page: n }))} />
        </div>
      </>
    );
  }

  return (
    <div className="transactions-tab">
      <FilterBar
        filters={filters}
        errors={errors}
        period={period}
        count={page ? { matching: page.total, all: totals.txCount } : null}
        updating={updating}
        onChange={(patch) => change(patch)}
        onReset={reset}
        actions={narrowing && page ? <ExportMenu address={address} query={{ ...narrowing, sort: filters.sort }} rows={page.total} /> : null}
      />
      <div className={updating ? 'is-updating' : undefined} aria-busy={updating}>
        {results}
      </div>
    </div>
  );
}
