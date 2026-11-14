// Linked selection (S-07; plan section 9): points picked in chart G2, or a span of days picked in the form beside the table,
// become a selection. It is a set of rows already loaded, not a filter in the address, so it is never sent to the service
// and a reload forgets it. The table then shows only those rows.

import type { TransactionRow, TransactionsResponse } from '../api/types';
import { dayKey } from './dates';
import type { SortValue } from './transactionFilters';

/** The rows of `rows` that are on the days from `from` to `to`, inclusive (day keys, `YYYY-MM-DD`). */
export function rowsInSpan(rows: TransactionRow[], from: string, to: string): TransactionRow[] {
  return rows.filter((r) => {
    const day = dayKey(r.time);
    return day >= from && day <= to;
  });
}

/** Unscored rows have no score and come last whichever way the score is sorted, as the service sorts them. */
function sortKey(row: TransactionRow, key: 'time' | 'amount' | 'score'): number | null {
  return key === 'time' ? Date.parse(row.time) : key === 'amount' ? Math.abs(row.netSats) : row.score;
}

/** The selected rows in the order the sort menu chose, as the service would have given them (E6 sorts the amount by its absolute size). */
export function sortRows(rows: TransactionRow[], sort: SortValue): TransactionRow[] {
  const key = sort.replace('-', '') as 'time' | 'amount' | 'score';
  const sign = sort.startsWith('-') ? -1 : 1;
  return [...rows].sort((a, b) => {
    const [x, y] = [sortKey(a, key), sortKey(b, key)];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * (x - y);
  });
}

/** The selected rows as one page for the transaction table. */
export function selectionPage(address: string, rows: TransactionRow[], sort: SortValue): TransactionsResponse {
  const sorted = sortRows(rows, sort);
  return { address, date: null, transactions: sorted, page: 1, pageSize: Math.max(sorted.length, 1), total: sorted.length };
}

export interface SelectionSummary {
  count: number;
  received: number;
  sent: number;
  unusual: number;
  /** Satoshis received and sent by the selected transactions, both as positive numbers. */
  receivedSats: number;
  sentSats: number;
}

/** What the summary line says: how many, how many came in and went out, and how many are unusual. */
export function summarise(rows: TransactionRow[]): SelectionSummary {
  const received = rows.filter((r) => r.direction === 'in');
  const sent = rows.filter((r) => r.direction === 'out');
  const total = (list: TransactionRow[]) => list.reduce((sum, r) => sum + Math.abs(r.netSats), 0);
  return {
    count: rows.length,
    received: received.length,
    sent: sent.length,
    unusual: rows.filter((r) => r.status === 'flagged').length,
    receivedSats: total(received),
    sentSats: total(sent),
  };
}
