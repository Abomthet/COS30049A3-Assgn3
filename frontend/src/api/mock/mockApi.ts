// In-browser stand-in for the FastAPI back end, built from answers recorded from the real service
// (scripts/record-fixtures.mjs). It has the same endpoints, response shapes and error codes, plus a
// configurable delay and simulated failures so every state can be shown.
//
// Its world is what was recorded: E1 to E3 whole, and for two addresses the timeline, every row and a
// few transaction details. E6 is computed from the recorded rows (filter, sort, page). Any other
// address in the list, or an unrecorded transaction, answers 404 `not_found`; an address outside the
// list answers the recorded `unsupported` body. It always decides with the default method.

import { validateAddress } from '../../lib/address';
import { dayKey, isDayKey } from '../../lib/dates';
import { WEB } from '../../lib/settings';
import {
  ApiError,
  type AddressSummary,
  type AddressesResponse,
  type ConfigResponse,
  type ExplorerApi,
  type HealthResponse,
  type LookupResponse,
  type RequestOptions,
  type TimelineResponse,
  type TransactionDetail,
  type TransactionQuery,
  type TransactionRow,
  type TransactionsResponse,
} from '../types';
import { ADDRESSES, CONFIG, HEALTH, RECORDED, UNSUPPORTED, type RecordedAddress } from './fixtures';

/** Mutable so the tests and the screenshot script can change behaviour at run time. */
export const mockControls = {
  latencyMs: 600,
  /** No answer at all, as when the back end is stopped. */
  offline: false,
  /** Answers 503 "unavailable" to everything, as the back end does while its models load. */
  starting: false,
};

const cancelled = () => new ApiError(0, { status: 'cancelled', message: 'The request was cancelled.' });

/** Answers after the configured delay, like the real service, and honours cancellation. */
function respond<T>(work: () => T, opts?: RequestOptions): Promise<T> {
  return new Promise((resolve, reject) => {
    const signal = opts?.signal;
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const timer = setTimeout(() => {
      if (mockControls.offline) {
        reject(new ApiError(0, { status: 'network', message: 'The explorer service did not respond.' }));
      } else if (mockControls.starting) {
        reject(new ApiError(503, { status: 'unavailable', message: 'The service is starting. This page will load by itself.' }));
      } else {
        try {
          resolve(work());
        } catch (err) {
          reject(err);
        }
      }
    }, mockControls.latencyMs);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(cancelled());
      },
      { once: true },
    );
  });
}

const invalid = (message: string, hint: string, field: string) =>
  new ApiError(400, { status: 'invalid', message, hint, fields: [{ name: field, message }] });

/** The normalised address if it is valid and in the list, or throws the matching 400 / 404. */
function listed(input: string): AddressSummary {
  const check = validateAddress(input);
  if (!check.ok) throw invalid(check.message, check.hint, 'address');
  const summary = ADDRESSES.addresses.find((a) => a.address === check.address);
  if (!summary) throw new ApiError(404, UNSUPPORTED);
  return summary;
}

/** Listed, and recorded: the only addresses with a timeline and rows. */
function requireAddress(input: string): RecordedAddress {
  const { address } = listed(input);
  const recorded = RECORDED.find((r) => r.address === address);
  if (!recorded) throw new ApiError(404, { status: 'not_found', message: 'The mock has no recorded data for this address.' });
  return recorded;
}

function checkDay(value: string | undefined, field: string): void {
  if (value !== undefined && !isDayKey(value)) throw invalid('Dates use the form YYYY-MM-DD.', 'Pick a day from the timeline instead.', field);
}

/** Unscored rows have no score and sort last whichever way the list is sorted. */
function compare(sort: NonNullable<TransactionQuery['sort']>): (a: TransactionRow, b: TransactionRow) => number {
  const key = sort.replace('-', '') as 'time' | 'amount' | 'score';
  const sign = sort.startsWith('-') ? -1 : 1;
  const value = (r: TransactionRow) => (key === 'time' ? Date.parse(r.time) : key === 'amount' ? r.netSats : r.score);
  return (a, b) => {
    const [x, y] = [value(a), value(b)];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return sign * (x - y);
  };
}

function page(recorded: RecordedAddress, query: TransactionQuery): TransactionsResponse {
  const { date, from, to, status, direction, sort = 'time', page: n = 1, pageSize = WEB.lists.pageSize } = query;
  checkDay(date, 'date');
  checkDay(from, 'from');
  checkDay(to, 'to');
  if (date !== undefined && (from !== undefined || to !== undefined)) throw invalid('Use either one day or a range of days, not both.', 'Remove date, or remove from and to.', 'date');
  if (from !== undefined && to !== undefined && from > to) throw invalid('The first day is after the last day.', 'Swap the two dates.', 'from');
  if (pageSize < 1 || pageSize > WEB.lists.maxPageSize) throw invalid(`The page size must be from 1 to ${WEB.lists.maxPageSize}.`, 'Choose a smaller page.', 'pageSize');

  const rows = recorded.transactionPages
    .flatMap((p) => p.transactions)
    .filter((r) => {
      const day = dayKey(r.time);
      return (
        (date === undefined || day === date) &&
        (from === undefined || day >= from) &&
        (to === undefined || day <= to) &&
        (!status || status.includes(r.status)) &&
        (!direction || direction.includes(r.direction))
      );
    })
    .sort(compare(sort));
  return { address: recorded.address, date: date ?? null, transactions: rows.slice((n - 1) * pageSize, n * pageSize), page: n, pageSize, total: rows.length };
}

export const mockApi: ExplorerApi = {
  health: (opts) => respond<HealthResponse>(() => HEALTH, opts),

  config: (opts) => respond<ConfigResponse>(() => CONFIG, opts),

  listAddresses: (opts) => respond<AddressesResponse>(() => ADDRESSES, opts),

  lookup: (address, opts) =>
    respond<LookupResponse>(() => {
      const summary = listed(address);
      return { status: 'supported', address: summary.address, summary };
    }, opts),

  timeline: (address, opts) => respond<TimelineResponse>(() => requireAddress(address).timeline, opts),

  transactions: (address, query, opts) => respond<TransactionsResponse>(() => page(requireAddress(address), query), opts),

  transaction: (txid, address, opts) =>
    respond<TransactionDetail>(() => {
      const recorded = requireAddress(address).details[txid.toLowerCase()];
      if (recorded?.status === 200) return recorded.body;
      if (recorded?.status === 422) throw new ApiError(422, recorded.body);
      throw new ApiError(404, { status: 'not_found', message: "This transaction is not one of this address's transactions in the snapshot." });
    }, opts),
};
