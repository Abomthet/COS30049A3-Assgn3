// In-browser stand-in for the FastAPI back end, built from answers recorded from the real service
// (scripts/record-fixtures.mjs). It has the same endpoints, response shapes and error codes, plus a
// configurable delay and simulated failures so every state can be shown.
//
// Its world is what was recorded: E1 to E3 and E11 whole, and for two addresses the timeline, every row and a
// few transaction details. E6 is computed from the recorded rows (filter, sort, page). Any other
// address in the list, or an unrecorded transaction, answers 404 `not_found`; an address outside the
// list answers the recorded `unsupported` body. It decides with the default method, and for the running
// example also with Regression residual and TxGPT surprisal (E5, E6 and some E7); any other
// method answers 404 `not_found`, and a method that does not exist answers 400.
// For the running example, E8 and E9 answer the requests that were recorded (after the same checks of
// the body as the service makes) and E10 the file of its flagged transactions; any other what-if or
// export answers 404 `not_found`.

import { validateAddress } from '../../lib/address';
import { dayKey, isDayKey } from '../../lib/dates';
import { DEFAULT_METHOD, METHODS } from '../../lib/methods';
import { WEB } from '../../lib/settings';
import { checkAmount, checkDirection, checkTime } from '../../lib/whatIf';
import {
  ApiError,
  type AddressSummary,
  type AddressesResponse,
  type ConfigResponse,
  type ExplorerApi,
  type ExportFile,
  type ExportFormat,
  type FieldError,
  type HealthResponse,
  type LookupResponse,
  type MethodId,
  type MethodsResponse,
  type RequestOptions,
  type TimelineResponse,
  type TransactionDetail,
  type TransactionQuery,
  type TransactionRow,
  type TransactionsResponse,
  type WhatIfCurve,
  type WhatIfCurveRequest,
  type WhatIfRequest,
  type WhatIfResult,
} from '../types';
import { ADDRESSES, CONFIG, EXPORT_RECORDED, HEALTH, METHODS_ANSWER, METHOD_RUNS, RECORDED, UNSUPPORTED, WHAT_IF_RECORDED, type RecordedAddress } from './fixtures';

/** Mutable so the tests and the screenshot script can change behaviour at run time. */
export const mockControls = {
  latencyMs: 600,
  /** No answer at all, as when the back end is stopped. */
  offline: false,
  /** Answers 503 "unavailable" to everything, as the back end does while its models load. */
  starting: false,
  /** Answers 429 "rate_limited" to everything, asking for this many seconds' wait (0: off), as the service does when it is busy. */
  busyForSeconds: 0,
};

const cancelled = () => new ApiError(0, { status: 'cancelled', message: 'The request was cancelled.' });

/** Answers after the configured delay, like the real service, and honours cancellation. A delay beyond the client's time limit ends as a timeout, as it does through Axios. */
function respond<T>(work: () => T, opts?: RequestOptions): Promise<T> {
  const timedOut = mockControls.latencyMs > WEB.requests.timeoutMs;
  return new Promise((resolve, reject) => {
    const signal = opts?.signal;
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const timer = setTimeout(() => {
      if (timedOut) {
        reject(new ApiError(0, { status: 'timeout', message: 'This is taking longer than it should.' }));
      } else if (mockControls.offline) {
        reject(new ApiError(0, { status: 'network', message: 'The explorer service did not respond.' }));
      } else if (mockControls.starting) {
        reject(new ApiError(503, { status: 'unavailable', message: 'The service is starting. This page will load by itself.' }));
      } else if (mockControls.busyForSeconds > 0) {
        reject(new ApiError(429, { status: 'rate_limited', message: 'The service is busy.', retryAfterSeconds: mockControls.busyForSeconds }));
      } else {
        try {
          resolve(work());
        } catch (err) {
          reject(err);
        }
      }
    }, Math.min(mockControls.latencyMs, WEB.requests.timeoutMs));
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

/** What was recorded under `method`: the default's for every address, another method's for the running example only, and only the parts that were recorded. */
function recordedFor(recorded: RecordedAddress, method: MethodId = DEFAULT_METHOD): Omit<RecordedAddress, 'address'> {
  if (!METHODS.some((m) => m.id === method)) throw invalid('That is not one of the methods.', 'Choose one from the method menu.', 'method');
  const run = method === DEFAULT_METHOD ? recorded : recorded.address === METHOD_RUNS.address ? METHOD_RUNS.runs[method] : undefined;
  if (!run) throw new ApiError(404, { status: 'not_found', message: 'The mock has no recorded answer for this method.' });
  return run;
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
  const { date, from, to, status, direction, sort = 'time', page: n = 1, pageSize = WEB.lists.pageSize, method } = query;
  checkDay(date, 'date');
  checkDay(from, 'from');
  checkDay(to, 'to');
  if (date !== undefined && (from !== undefined || to !== undefined)) throw invalid('Use either one day or a range of days, not both.', 'Remove date, or remove from and to.', 'date');
  if (from !== undefined && to !== undefined && from > to) throw invalid('The first day is after the last day.', 'Swap the two dates.', 'from');
  if (pageSize < 1 || pageSize > WEB.lists.maxPageSize) throw invalid(`The page size must be from 1 to ${WEB.lists.maxPageSize}.`, 'Choose a smaller page.', 'pageSize');

  const rows = recordedFor(recorded, method)
    .transactionPages.flatMap((p) => p.transactions)
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

/** The service's 400 for a what-if body: every field that fails, each with its message. */
function checkBody(body: Partial<Record<keyof WhatIfRequest, unknown>>, fields: Array<keyof WhatIfRequest>): void {
  const checks = { amountBtc: checkAmount, direction: checkDirection, time: checkTime };
  const failed = fields.flatMap((name): FieldError[] => {
    const check = checks[name](body[name]);
    return check.ok ? [] : [{ name, message: check.message }];
  });
  if (failed.length > 0) {
    throw new ApiError(400, {
      status: 'invalid',
      message: failed.length === 1 ? 'One value needs correcting.' : 'Some values need correcting.',
      hint: 'Correct the values named below and send the request again.',
      fields: failed,
    });
  }
}

/** The recorded answer to this request, or the 422 or 400 that was recorded for it; no record is a 404. */
function recordedAnswer<Request, Ok>(address: string, list: Array<{ request: Request; status: number; body: unknown }>, same: (r: Request) => boolean): Ok {
  const found = address === WHAT_IF_RECORDED.address ? list.find((r) => same(r.request)) : undefined;
  if (!found) throw new ApiError(404, { status: 'not_found', message: 'The mock has no recorded answer for this what-if.' });
  if (found.status !== 200) throw new ApiError(found.status, found.body as ApiError['body']);
  return found.body as Ok;
}

const filterKey = ({ date, from, to, status, direction }: Omit<TransactionQuery, 'page' | 'pageSize'>) => JSON.stringify({ date, from, to, status, direction });

export const mockApi: ExplorerApi = {
  health: (opts) => respond<HealthResponse>(() => HEALTH, opts),

  config: (opts) => respond<ConfigResponse>(() => CONFIG, opts),

  listAddresses: (opts) => respond<AddressesResponse>(() => ADDRESSES, opts),

  lookup: (address, opts) =>
    respond<LookupResponse>(() => {
      const summary = listed(address);
      return { status: 'supported', address: summary.address, summary };
    }, opts),

  timeline: (address, opts) =>
    respond<TimelineResponse>(() => recordedFor(requireAddress(address), opts?.method).timeline, opts),

  transactions: (address, query, opts) => respond<TransactionsResponse>(() => page(requireAddress(address), query), opts),

  transaction: (txid, address, opts) =>
    respond<TransactionDetail>(() => {
      const recorded = recordedFor(requireAddress(address), opts?.method).details[txid.toLowerCase()];
      if (recorded?.status === 200) return recorded.body;
      if (recorded?.status === 422) throw new ApiError(422, recorded.body);
      throw new ApiError(404, { status: 'not_found', message: "This transaction is not one of this address's transactions in the snapshot." });
    }, opts),

  whatIf: (address, body, opts) =>
    respond<WhatIfResult>(() => {
      requireAddress(address);
      checkBody(body, ['amountBtc', 'direction', 'time']);
      const sats = (btc: string) => (checkAmount(btc) as { value: { sats: number } }).value.sats;
      return recordedAnswer(address, WHAT_IF_RECORDED.results, (r) => r.direction === body.direction && r.time === body.time && sats(r.amountBtc) === sats(body.amountBtc));
    }, opts),

  whatIfCurve: (address, body, opts) =>
    respond<WhatIfCurve>(() => {
      requireAddress(address);
      checkBody(body, ['direction', 'time']);
      return recordedAnswer(address, WHAT_IF_RECORDED.curves, (r: WhatIfCurveRequest) => (['direction', 'time', 'minBtc', 'maxBtc', 'points'] as const).every((key) => r[key] === body[key]));
    }, opts),

  // Whatever the order, the recorded file has the flagged transactions: the filters decide only whether there is a file.
  exportFile: (address, format: ExportFormat, query, opts) =>
    respond<ExportFile>(() => {
      requireAddress(address);
      if (address !== EXPORT_RECORDED.address || (query.method ?? DEFAULT_METHOD) !== DEFAULT_METHOD || filterKey(query) !== filterKey(EXPORT_RECORDED.query)) {
        throw new ApiError(404, { status: 'not_found', message: 'The mock has a file only for the flagged transactions of the running example.' });
      }
      return EXPORT_RECORDED[format];
    }, opts),

  methods: (opts) => respond<MethodsResponse>(() => METHODS_ANSWER, opts),
};
