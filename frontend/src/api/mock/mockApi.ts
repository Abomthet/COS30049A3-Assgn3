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
// E12 answers the requests that were recorded for the running example (its flagged transactions with the Assistant's prepared
// answer, a scored transaction that is not flagged and two what-ifs with the template); any other request answers 404 `not_found`.
// The watchlist (E13 to E15) lives in memory and starts empty; it keeps what the page saves until it reloads,
// as the service keeps it in its database. It checks the body and the capacity as the service does.

import { validateAddress } from '../../lib/address';
import { noteOrigin } from '../../lib/liveOrigin';
import { dayKey, isDayKey } from '../../lib/dates';
import { DEFAULT_METHOD, METHODS } from '../../lib/methods';
import { WEB } from '../../lib/settings';
import { checkAmount, checkDirection, checkTime } from '../../lib/whatIf';
import {
  ApiError,
  type AddressSummary,
  type AddressesResponse,
  type ConfigResponse,
  type ExplanationResponse,
  type ExplorerApi,
  type ExportFile,
  type ExportFormat,
  type FieldError,
  type HealthResponse,
  type LiveLookup,
  type LookupResponse,
  type MethodId,
  type MethodsResponse,
  type RequestOptions,
  type TimelineResponse,
  type TransactionDetail,
  type TransactionQuery,
  type TransactionRow,
  type TransactionsResponse,
  type SavedWatchlistEntry,
  type WatchlistBody,
  type WatchlistEntry,
  type WatchlistResponse,
  type WhatIfCurve,
  type WhatIfCurveRequest,
  type WhatIfRequest,
  type WhatIfResult,
} from '../types';
import { ADDRESSES, CONFIG, EXPLANATIONS_RECORDED, EXPORT_RECORDED, HEALTH, METHODS_ANSWER, METHOD_RUNS, RECORDED, UNSUPPORTED, WHAT_IF_RECORDED, type RecordedAddress } from './fixtures';

/** Mutable so the tests and the screenshot script can change behaviour at run time. */
export const mockControls = {
  latencyMs: 600,
  /** No answer at all, as when the back end is stopped. */
  offline: false,
  /** Answers 503 "unavailable" to everything, as the back end does while its models load. */
  starting: false,
  /** Answers 429 "rate_limited" to everything, asking for this many seconds' wait (0: off), as the service does when it is busy. */
  busyForSeconds: 0,
  /** How many entries the watchlist holds before it answers 409 `conflict`; a test lowers it to reach the full state. */
  watchlistCapacity: WEB.watchlist.maxEntries,
  /** Live lookup (S-09) is on: E2 says so, E4's 404 offers it, and E16 to E20 work. Off by default, as on the service. */
  liveLookup: false,
  /** How long the mock job takes to fetch one page, so a test can run it fast and a screenshot can catch it half way. */
  liveStepMs: 400,
  /** The event stream (E18) fails at once, so the dialog has to poll E17. */
  liveStreamBroken: false,
  /** The job fails after this many pages with an `upstream_error` (0: never); E16 itself answers 502 when it is -1. */
  liveFailAfterPages: 0,
};

/** The watchlist, most recently added first. */
let watched: WatchlistEntry[] = [];

/** Empties the watchlist and restores the capacity, for the tests and the screenshot script. */
export function resetMockWatchlist(): void {
  watched = [];
  mockControls.watchlistCapacity = WEB.watchlist.maxEntries;
  mockControls.liveLookup = false;
  mockControls.liveStepMs = 400;
  mockControls.liveStreamBroken = false;
  mockControls.liveFailAfterPages = 0;
  for (const job of jobs.values()) clearTimeout(job.timer);
  jobs.clear();
  fetchedWorld.clear();
}

// ---------------------------------------------------------------- live lookup (S-09)
// A fetched address in the mock is the running example's recorded history under the typed address, marked live; a job pages
// through it 25 at a time, as the service pages Esplora, and ends after the same states. The address list then holds it.

interface MockJob {
  lookup: LiveLookup;
  events: Array<(l: LiveLookup) => void>;
  log: LiveLookup[];
  timer?: ReturnType<typeof setTimeout>;
}
const jobs = new Map<string, MockJob>();
const fetchedWorld = new Map<string, RecordedAddress & { summary: AddressSummary }>();
const MOCK_TOTAL = 1157;
let jobCounter = 0;

function worldFor(address: string): RecordedAddress & { summary: AddressSummary } {
  const base = RECORDED[0];
  const source = ADDRESSES.addresses.find((a) => a.address === base.address)!;
  const live = { fetchedAt: new Date().toISOString().slice(0, 19) + 'Z', transactions: source.txCount, total: MOCK_TOTAL, maxTx: WEB.live.defaultMaxTx, truncated: true };
  const swap = <T,>(value: T): T => JSON.parse(JSON.stringify(value).split(base.address).join(address));
  return { ...swap(base), timeline: { ...swap(base.timeline), live }, summary: { ...swap(source), source: 'live' } };
}

function publish(job: MockJob, patch: Partial<LiveLookup>): void {
  job.lookup = { ...job.lookup, ...patch, progress: { ...job.lookup.progress, ...patch.progress } };
  job.log.push(job.lookup);
  for (const listener of job.events) listener(job.lookup);
}

function stepJob(job: MockJob): void {
  const { lookup } = job;
  if (['done', 'failed', 'cancelled'].includes(lookup.status)) return;
  const cap = lookup.progress.cap;
  if (lookup.status === 'fetching') {
    const pages = lookup.progress.pages + 1;
    if (mockControls.liveFailAfterPages > 0 && pages > mockControls.liveFailAfterPages) {
      publish(job, { status: 'failed', finishedAt: new Date().toISOString(), error: { status: 'upstream_error', message: 'The public blockchain service answered with an error.', hint: 'Try again in a minute, or pick one of the snapshot addresses.' } });
      return;
    }
    publish(job, { progress: { pages, transactions: Math.min(pages * 25, cap), cap, total: MOCK_TOTAL } });
    if (pages * 25 >= cap) publish(job, { status: 'scoring' });
  } else {
    fetchedWorld.set(lookup.address, worldFor(lookup.address));
    publish(job, { status: 'done', finishedAt: new Date().toISOString() });
    return;
  }
  job.timer = setTimeout(() => stepJob(job), mockControls.liveStepMs);
}

function startJob(address: string): LiveLookup {
  const check = validateAddress(address);
  if (!check.ok) throw invalid(check.message, check.hint, 'address');
  if (!mockControls.liveLookup) throw new ApiError(403, { status: 'disabled', message: 'Live lookup is switched off on this server.', hint: 'Start the server with EXPLORER_LIVE_LOOKUP=on.' });
  if (ADDRESSES.addresses.some((a) => a.address === check.address) && !fetchedWorld.has(check.address)) {
    throw new ApiError(409, { status: 'conflict', message: 'This address is part of the snapshot.' });
  }
  if (mockControls.liveFailAfterPages < 0) throw new ApiError(502, { status: 'upstream_error', message: 'The public blockchain service answered with an error.', hint: 'Try again in a minute, or pick one of the snapshot addresses.' });
  const now = new Date().toISOString().slice(0, 19) + 'Z';
  const id = `mock${++jobCounter}`;
  const cap = Math.min(WEB.live.defaultMaxTx, RECORDED[0].timeline.totals.txCount);
  const cached = fetchedWorld.has(check.address);
  const lookup: LiveLookup = {
    id, address: check.address, status: cached ? 'done' : 'fetching', maxTx: WEB.live.defaultMaxTx, startedAt: now, finishedAt: cached ? now : null, error: null, cached,
    progress: { pages: cached ? Math.ceil(cap / 25) : 0, transactions: cached ? cap : 0, cap, total: MOCK_TOTAL },
    links: { status: `/api/live/lookups/${id}`, events: `/api/live/lookups/${id}/events` },
  };
  const job: MockJob = { lookup, events: [], log: [lookup] };
  jobs.set(id, job);
  if (!cached) job.timer = setTimeout(() => stepJob(job), mockControls.liveStepMs);
  return lookup;
}

function jobOf(id: string): MockJob {
  const job = jobs.get(id);
  if (!job) throw new ApiError(404, { status: 'not_found', message: 'There is no lookup with this identifier.', hint: 'Start a new lookup.' });
  return job;
}

/** What the mock knows of an address: the recorded ones, and the ones a lookup has fetched. */
function worldOf(address: string): (RecordedAddress & { summary?: AddressSummary }) | undefined {
  return fetchedWorld.get(address) ?? RECORDED.find((r) => r.address === address);
}

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
  const summary = ADDRESSES.addresses.find((a) => a.address === check.address) ?? fetchedWorld.get(check.address)?.summary;
  if (!summary) throw new ApiError(404, { ...UNSUPPORTED, canLookupLive: mockControls.liveLookup });
  return summary;
}

/** Listed, and recorded: the only addresses with a timeline and rows. */
function requireAddress(input: string): RecordedAddress {
  const { address } = listed(input);
  const recorded = worldOf(address);
  if (!recorded) throw new ApiError(404, { status: 'not_found', message: 'The mock has no recorded data for this address.' });
  return recorded;
}

/** What was recorded under `method`: the default's for every address, another method's for the running example only, and only the parts that were recorded. */
function recordedFor(recorded: RecordedAddress, method: MethodId = DEFAULT_METHOD): Omit<RecordedAddress, 'address'> {
  if (!METHODS.some((m) => m.id === method)) throw invalid('That is not one of the methods.', 'Choose one from the method menu.', 'method');
  // As the service answers: TxGPT's scores are prepared in advance for the snapshot, so a fetched address has none.
  if (method === 'txgpt_method' && recorded.timeline.live) {
    throw new ApiError(400, {
      status: 'invalid',
      message: 'This method has no scores for a fetched address.',
      hint: "TxGPT's scores are prepared in advance for the snapshot; choose another method.",
      fields: [{ name: 'method', message: 'Not available for a fetched address.' }],
    });
  }
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

/** E14's 400: each field over its limit, with the service's words. */
function checkWatchlistBody(body: WatchlistBody): void {
  const { maxLabelChars, maxNoteChars } = WEB.watchlist;
  const limits = [
    { name: 'label', value: body.label, max: maxLabelChars },
    { name: 'note', value: body.note, max: maxNoteChars },
  ];
  const fields = limits.filter((f) => [...(f.value ?? '')].length > f.max).map((f): FieldError => ({ name: f.name, message: `Must be at most ${f.max} characters.` }));
  if (fields.length > 0) {
    throw new ApiError(400, { status: 'invalid', message: fields.length === 1 ? 'One value needs correcting.' : 'Some values need correcting.', hint: 'Correct the values named below and send the request again.', fields });
  }
}

const filterKey = ({ date, from, to, status, direction }: Omit<TransactionQuery, 'page' | 'pageSize'>) => JSON.stringify({ date, from, to, status, direction });

export const mockApi: ExplorerApi = {
  health: (opts) => respond<HealthResponse>(() => HEALTH, opts),

  config: (opts) =>
    respond<ConfigResponse>(() => (mockControls.liveLookup ? { ...CONFIG, capabilities: { ...CONFIG.capabilities, liveLookup: true } } : CONFIG), opts),

  listAddresses: (opts) =>
    respond<AddressesResponse>(() => ({ ...ADDRESSES, addresses: [...ADDRESSES.addresses, ...[...fetchedWorld.values()].map((w) => w.summary)] }), opts),

  lookup: (address, opts) =>
    respond<LookupResponse>(() => {
      const summary = listed(address);
      return { status: 'supported', address: summary.address, summary };
    }, opts),

  timeline: (address, opts) =>
    respond<TimelineResponse>(() => noteOrigin(recordedFor(requireAddress(address), opts?.method).timeline), opts),

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

  // The answers recorded for the running example, whose Assistant was not installed: its flagged transactions have the prepared answer, the rest the template.
  explain: (body, opts) =>
    respond<ExplanationResponse>(() => {
      requireAddress(body.address);
      if (body.whatIf) checkBody(body.whatIf, ['amountBtc', 'direction', 'time']);
      const sats = (btc: string) => (checkAmount(btc) as { value: { sats: number } }).value.sats;
      const found = body.address === EXPLANATIONS_RECORDED.address ? EXPLANATIONS_RECORDED.results.find(({ request: r }) => (body.whatIf ? r.whatIf?.direction === body.whatIf.direction && r.whatIf.time === body.whatIf.time && sats(r.whatIf.amountBtc) === sats(body.whatIf.amountBtc) : r.txid === body.txid?.toLowerCase())) : undefined;
      if (!found) throw new ApiError(404, { status: 'not_found', message: 'The mock has no recorded explanation for this request.' });
      return found.body;
    }, opts),

  methods: (opts) => respond<MethodsResponse>(() => METHODS_ANSWER, opts),

  startLiveLookup: (address, opts) => respond<LiveLookup>(() => startJob(address), opts),

  liveLookup: (id, opts) => respond<LiveLookup>(() => jobOf(id).lookup, opts),

  cancelLiveLookup: (id, opts) =>
    respond<void>(() => {
      const job = jobOf(id);
      if (!['done', 'failed', 'cancelled'].includes(job.lookup.status)) {
        clearTimeout(job.timer);
        publish(job, { status: 'cancelled', finishedAt: new Date().toISOString() });
      }
    }, opts),

  // The stream replays every event so far, then follows the job, as the service's does.
  openLiveEvents: (id, onLookup, onError) => {
    let open = true;
    const timer = setTimeout(() => {
      if (!open) return;
      if (mockControls.liveStreamBroken || !jobs.has(id)) {
        open = false;
        onError();
        return;
      }
      const job = jobOf(id);
      for (const seen of job.log) onLookup(seen);
      job.events.push((l) => open && onLookup(l));
    }, 0);
    return () => {
      open = false;
      clearTimeout(timer);
    };
  },

  forgetAddress: (address, opts) =>
    respond<void>(() => {
      const check = validateAddress(address);
      if (!mockControls.liveLookup) throw new ApiError(403, { status: 'disabled', message: 'Live lookup is switched off on this server.' });
      if (!check.ok) throw invalid(check.message, check.hint, 'address');
      if (ADDRESSES.addresses.some((a) => a.address === check.address)) throw new ApiError(409, { status: 'conflict', message: 'This address is part of the snapshot, which cannot be changed.' });
      if (!fetchedWorld.delete(check.address)) throw new ApiError(404, { ...UNSUPPORTED, canLookupLive: true });
      watched = watched.filter((e) => e.address !== check.address);
    }, opts),

  watchlist: (opts) => respond<WatchlistResponse>(() => ({ entries: watched }), opts),

  putWatchlist: (address, body, opts) =>
    respond<SavedWatchlistEntry>(() => {
      const summary = listed(address);
      checkWatchlistBody(body);
      const now = new Date().toISOString().slice(0, 19) + 'Z';
      const before = watched.find((e) => e.address === summary.address);
      if (!before && watched.length >= mockControls.watchlistCapacity) {
        throw new ApiError(409, {
          status: 'conflict',
          message: `The watchlist is full: it holds ${mockControls.watchlistCapacity} addresses.`,
          hint: 'Remove an address from the watchlist, then add this one.',
        });
      }
      const entry: WatchlistEntry = { address: summary.address, label: body.label ?? '', note: body.note ?? '', addedAt: before?.addedAt ?? now, updatedAt: now, summary };
      watched = before ? watched.map((e) => (e === before ? entry : e)) : [entry, ...watched];
      return { entry, created: !before };
    }, opts),

  deleteWatchlist: (address, opts) =>
    respond<void>(() => {
      const check = validateAddress(address);
      const found = check.ok ? watched.find((e) => e.address === check.address) : undefined;
      if (!found) throw new ApiError(404, { status: 'not_found', message: 'This address is not on the watchlist.', hint: 'Reload the list to see what it holds now.' });
      watched = watched.filter((e) => e !== found);
    }, opts),
};
