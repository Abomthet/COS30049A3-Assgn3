import type { MethodId, TransactionsResponse } from '../api/types';
import { DirectionBadge, StatusBadge } from '../components/Badges';
import { LimitationNote } from '../components/LimitationNote';
import { formatDateTime, dayKey } from '../lib/dates';
import { formatBtc, formatCount } from '../lib/format';
import { METHODS } from '../lib/methods';
import { paths } from '../lib/router';

// The transaction table of V2's transactions tab (plan section 8): one page of E6 in the order the
// filter bar chose, with a link on every row that opens the transaction. On a phone each row becomes
// a card. The server sorts and pages; the table only shows what it was given.

interface Props {
  page: TransactionsResponse;
  /** The deciding method the rows were scored by; the links keep it. */
  method: MethodId;
  /** The link for another page of the same filters. */
  pageHref: (page: number) => string;
}

/** The transaction table of the transactions tab: one page of rows, each linking to its transaction; becomes cards on a phone. */
export function TransactionTable({ page, method, pageHref }: Props) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const first = (page.page - 1) * page.pageSize + 1;
  const last = first + page.transactions.length - 1;
  return (
    <section className="card table-card tx-table-card" aria-labelledby="tx-table-title">
      <div className="tx-table-head">
        <h2 id="tx-table-title">Transactions</h2>
        <p className="card-sub">
          Select a row to open it.
        </p>
        {page.transactions.some((t) => t.status === 'flagged') ? <LimitationNote /> : null}
      </div>
      <table className="tx-table">
        <caption className="sr-only">Transactions of this address, with their direction, amount, score, status and strongest reason</caption>
        <thead>
          <tr>
            <th scope="col">Time (UTC)</th>
            <th scope="col">Direction</th>
            <th scope="col" className="num">
              Amount
            </th>
            <th scope="col" className="num">
              Score
            </th>
            <th scope="col">Status</th>
            <th scope="col">Main reason</th>
            <th scope="col" className="num">
              Flagged by
            </th>
          </tr>
        </thead>
        <tbody>
          {page.transactions.map((t) => (
            <tr key={t.txid} className={t.status === 'flagged' ? 'is-flagged' : undefined}>
              <th scope="row" className="col-time" data-label="Time (UTC)">
                {/* The link's ::after covers the whole row, so the row opens the transaction and keeps a real link's keyboard and middle-click. */}
                <a className="row-link" href={paths.tx(page.address, dayKey(t.time), t.txid, method)}>
                  {formatDateTime(t.time)}
                </a>
              </th>
              <td data-label="Direction" className="col-direction">
                <DirectionBadge direction={t.direction} />
              </td>
              <td data-label="Amount" className="num mono col-amount">
                {formatBtc(t.netSats, { signed: true })}
              </td>
              <td data-label="Score" className="num col-score">
                {t.score === null ? '—' : t.score.toFixed(2)}
              </td>
              <td data-label="Status" className="col-status">
                <StatusBadge status={t.status} />
              </td>
              <td data-label="Main reason" className={t.status === 'flagged' ? 'col-reason has-reason' : 'col-reason'}>
                {t.status === 'flagged' && t.mainReason ? t.mainReason : '—'}
              </td>
              <td data-label="Flagged by" className="num col-by">
                {t.status === 'not-scored' ? '—' : `${t.flaggedBy} of ${METHODS.length} models`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav className="pager" aria-label="Pages of transactions">
        <p className="pager-status">
          Rows {formatCount(first)} to {formatCount(last)} · page {formatCount(page.page)} of {formatCount(pages)}
        </p>
        <div className="pager-links">
          {page.page > 1 ? (
            <a className="btn btn-secondary" href={pageHref(page.page - 1)} rel="prev">
              Previous page
            </a>
          ) : null}
          {page.page < pages ? (
            <a className="btn btn-secondary" href={pageHref(page.page + 1)} rel="next">
              Next page
            </a>
          ) : null}
        </div>
      </nav>
    </section>
  );
}
