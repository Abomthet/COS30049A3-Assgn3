// The filters of V2's transactions tab (plan section 8, "The filter bar and the transaction table").
// They live in the query string of the route, so a filtered view has its own link and survives a
// reload; the filter bar, chart G2 and the table all read the same `Filters` and never hold their own.
// The checks are the ones the server applies to E6 (plan section 11), with the server's words.

import type { Direction, MethodId, ScoreStatus, TransactionQuery } from '../api/types';
import { isDayKey } from './dates';
import { DEFAULT_METHOD, methodSearch, parseMethod } from './methods';

/** The sort menu's four choices (the plan's "newest, oldest, largest, highest score"). */
export const SORTS = [
  { value: '-time', label: 'Newest first' },
  { value: 'time', label: 'Oldest first' },
  { value: '-amount', label: 'Largest first' },
  { value: '-score', label: 'Highest score first' },
] as const;

export type SortValue = (typeof SORTS)[number]['value'];

export const DEFAULT_SORT: SortValue = '-time';

/** The chips offer these; a net change of zero (`none`) is part of "no direction chosen" only. */
export const STATUSES: ScoreStatus[] = ['flagged', 'not-flagged', 'not-scored'];
export const DIRECTIONS: Direction[] = ['in', 'out'];

export interface Filters {
  status: ScoreStatus[];
  direction: Direction[];
  /** 'YYYY-MM-DD', or '' for no limit. Kept as typed when it is not a real day, so it can be corrected. */
  from: string;
  to: string;
  sort: SortValue;
  /** From 1. */
  page: number;
  /** The deciding method: it sets every row's status and score. */
  method: MethodId;
}

export const NO_FILTERS: Filters = { status: [], direction: [], from: '', to: '', sort: DEFAULT_SORT, page: 1, method: DEFAULT_METHOD };

/** What the link says, made safe: unknown values are dropped, so a hand-edited link can never reach the server malformed. */
export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  return {
    status: STATUSES.filter((s) => params.getAll('status').includes(s)),
    direction: DIRECTIONS.filter((d) => params.getAll('direction').includes(d)),
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: SORTS.find((s) => s.value === sort)?.value ?? DEFAULT_SORT,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    method: parseMethod(search),
  };
}

/** The query string for a set of filters, in one fixed order so equal filters give equal links. Defaults are left out. */
export function filtersToSearch(filters: Filters): string {
  const params = new URLSearchParams();
  filters.status.forEach((s) => params.append('status', s));
  filters.direction.forEach((d) => params.append('direction', d));
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.sort !== DEFAULT_SORT) params.set('sort', filters.sort);
  if (filters.page > 1) params.set('page', String(filters.page));
  if (methodSearch(filters.method)) params.set('method', filters.method);
  return params.toString();
}

/** Whether anything but the sort order and the method narrows the list. */
export const isFiltered = (f: Filters): boolean => f.status.length + f.direction.length > 0 || f.from !== '' || f.to !== '';

export interface FilterErrors {
  from?: string;
  to?: string;
}

/**
 * The server's rules for E6's day parameters. `example` is a real day of this address, for the message.
 * With either field wrong, nothing is sent (plan section 8).
 */
export function validateFilters({ from, to }: Pick<Filters, 'from' | 'to'>, example: string): FilterErrors {
  const errors: FilterErrors = {};
  const badDay = `Use a day such as ${example}.`;
  if (from && !isDayKey(from)) errors.from = badDay;
  if (to && !isDayKey(to)) errors.to = badDay;
  if (from && to && !errors.from && !errors.to && from > to) {
    errors.from = 'Must not be after the last day.';
    errors.to = 'Must not be before the first day.';
  }
  return errors;
}

/** E6's query for what narrows the list (and the method, when it is not the default); the table adds its sort and page, and chart G2 its own paging. */
export function toQuery(filters: Filters): TransactionQuery {
  const query: TransactionQuery = {};
  if (filters.status.length > 0) query.status = filters.status;
  if (filters.direction.length > 0) query.direction = filters.direction;
  if (filters.from) query.from = filters.from;
  if (filters.to) query.to = filters.to;
  if (filters.method !== DEFAULT_METHOD) query.method = filters.method;
  return query;
}

/** A string that is equal for equal queries; the key of a cached request. */
export const queryKey = (query: TransactionQuery): string => JSON.stringify(query);
