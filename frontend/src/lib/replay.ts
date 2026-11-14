// The replay (S-06) shows an address's history again, one transaction at a time, from rows already loaded. This
// is the arithmetic: from the first `count` rows (oldest first) it builds what E5 would have said had the history
// ended there, so chart G1 and the tiles use the same shapes as the live overview and nothing is estimated.

import type { TimelineDay, TimelineResponse, TransactionRow } from '../api/types';
import { dayKey } from './dates';

export interface ReplayCounts {
  txCount: number;
  scoredCount: number;
  flaggedCount: number;
  flaggedDays: number;
}

/** The days with activity among `rows`, oldest first, which must be in time order. */
export function daysOf(rows: TransactionRow[]): TimelineDay[] {
  const days = new Map<string, TimelineDay>();
  for (const row of rows) {
    const date = dayKey(row.time);
    const day = days.get(date) ?? { date, txCount: 0, flaggedCount: 0 };
    day.txCount += 1;
    if (row.status === 'flagged') day.flaggedCount += 1;
    days.set(date, day);
  }
  return [...days.values()];
}

export function countsOf(rows: TransactionRow[], days: TimelineDay[]): ReplayCounts {
  return {
    txCount: rows.length,
    scoredCount: rows.filter((r) => r.status !== 'not-scored').length,
    flaggedCount: rows.filter((r) => r.status === 'flagged').length,
    flaggedDays: days.filter((d) => d.flaggedCount > 0).length,
  };
}

/** The timeline as it stood after `count` transactions. The range stays the whole history's, so the axis does not move as the bars grow. */
export function timelineAfter(timeline: TimelineResponse, rows: TransactionRow[], count: number): TimelineResponse {
  const days = daysOf(rows.slice(0, count));
  return { ...timeline, days, totals: countsOf(rows.slice(0, count), days) };
}
