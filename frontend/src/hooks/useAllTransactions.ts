import { useState } from 'react';
import { api } from '../api/client';
import type { TransactionQuery, TransactionRow } from '../api/types';
import { queryKey } from '../lib/transactionFilters';
import { useRequest } from './useRequest';
import { useSettings } from './useSettings';

interface Arrived {
  key: string;
  rows: TransactionRow[];
  total: number;
}

/**
 * Every row E6 has for `query`, joined from pages of the largest size the server allows (the biggest
 * snapshot address needs four requests). The rows that have arrived are available while the rest are
 * still coming, so a chart can draw after the first page (plan section 9, "Performance"); when the
 * query changes, the previous rows stay until the new first page arrives, and the requests still
 * running for the old query are cancelled. A null query loads nothing.
 */
export function useAllTransactions(address: string, query: TransactionQuery | null) {
  const { settings } = useSettings();
  const pageSize = settings.web.lists.maxPageSize;
  const key = query === null ? null : `all:${address}:${pageSize}:${queryKey(query)}`;
  const [partial, setPartial] = useState<Arrived | null>(null);

  const request = useRequest(key, async (signal) => {
    const rows: TransactionRow[] = [];
    // Time order, so a row never moves between pages while the pages are fetched one after another.
    for (let page = 1; ; page++) {
      const answer = await api.transactions(address, { ...query, sort: 'time', page, pageSize }, { signal });
      rows.push(...answer.transactions);
      // An empty page ends the loop too, so a total that changed under us cannot make it run forever.
      if (rows.length >= answer.total || answer.transactions.length === 0) return rows;
      if (!signal.aborted) setPartial({ key: key!, rows: [...rows], total: answer.total });
    }
  });

  const arriving = partial?.key === key ? partial : null;
  const shown = request.status === 'success' ? request.data : (arriving?.rows ?? request.previous);
  return {
    request,
    /** What can be drawn now; undefined until the first page has ever arrived. */
    rows: shown,
    /** Progress while later pages are still coming. */
    progress: request.status === 'loading' && arriving ? { loaded: arriving.rows.length, total: arriving.total } : null,
  };
}
