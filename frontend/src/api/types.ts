// The API contract (report §2.6). The prototype's mock and the future FastAPI back end
// both return exactly these shapes, so switching from one to the other changes no screen code.
//
//   GET  /api/health                                     -> HealthResponse | 503 ServiceBody (unavailable)
//   GET  /api/config                                     -> ConfigResponse
//   GET  /api/addresses                                  -> AddressesResponse
//   POST /api/lookup            {address}                -> LookupResponse | 400 InvalidBody | 404 UnsupportedBody
//   GET  /api/addresses/{address}/timeline               -> TimelineResponse | 404
//   GET  /api/addresses/{address}/transactions?date=     -> DayResponse | 400 | 404
//   GET  /api/transactions/{txid}?address=               -> TransactionDetail | 404 | 422 InsufficientHistoryBody
//
// Times are ISO 8601 in UTC; days are 'YYYY-MM-DD' in UTC; amounts are integer satoshis.

import type { FeatureId } from '../lib/settings';

export type Direction = 'in' | 'out' | 'none';

export interface SnapshotInfo {
  snapshotDate: string;
  source: string;
  sourceUrl: string;
  illustrative: boolean;
  dayTimeZone: 'UTC';
  addressCount: number;
  method: MethodInfo;
}

export interface MethodInfo {
  id: string;
  name: string;
  flagAbsZ: number;
  contributingAbsZ: number;
  note: string;
}

export interface HistoryRequirement {
  minTx: number;
  minSpanDays: number;
}

export interface AddressSummary {
  address: string;
  firstSeen: string;
  lastSeen: string;
  txCount: number;
  scoredCount: number;
  flaggedCount: number;
  history: 'sufficient' | 'insufficient';
}

export interface AddressesResponse {
  snapshot: SnapshotInfo;
  addresses: AddressSummary[];
}

export interface LookupResponse {
  status: 'supported';
  address: string;
  summary: AddressSummary;
}

export interface TimelineDay {
  date: string;
  txCount: number;
  flaggedCount: number;
}

export interface TimelineResponse {
  address: string;
  snapshot: SnapshotInfo;
  range: { start: string; end: string };
  /** Only days with at least one transaction, oldest first. */
  days: TimelineDay[];
  totals: { txCount: number; scoredCount: number; flaggedCount: number; flaggedDays: number };
  history: {
    status: 'sufficient' | 'insufficient';
    txCount: number;
    spanDays: number;
    required: HistoryRequirement;
    firstScoredDate: string | null;
  };
}

export type ScoreStatus = 'flagged' | 'not-flagged' | 'not-scored';

export interface TransactionRow {
  txid: string;
  time: string;
  direction: Direction;
  netSats: number;
  status: ScoreStatus;
}

export interface DayResponse {
  address: string;
  date: string;
  transactions: TransactionRow[];
}

/** The facts every transaction has, scored or not (FR-03). */
export interface TransactionCore {
  txid: string;
  address: string;
  time: string;
  blockHeight: number;
  direction: Direction;
  receivedSats: number;
  sentSats: number;
  netSats: number;
  /** Public block-explorer page; null for illustrative data, which has no public record. */
  sourceUrl: string | null;
}

export type FeatureRole = 'flag' | 'contributing' | 'within-usual' | 'no-comparison';

export interface FeatureDetail {
  id: FeatureId;
  name: string;
  /** What the feature measures, in plain words. */
  description: string;
  /** Value in human units: BTC for F1, count for F2, hours for F3, ratio for F4. */
  value: number | null;
  /** Median of the comparison window, same units as value. */
  usual: number | null;
  z: number | null;
  role: FeatureRole;
}

/** What a group of features was compared against (AC-03 "comparison basis"). */
export interface ComparisonBasis {
  features: FeatureId[];
  label: string;
  description: string;
  txCount: number;
  start: string;
  end: string;
}

export interface TransactionDetail extends TransactionCore {
  scored: true;
  flagged: boolean;
  score: number;
  method: MethodInfo;
  features: FeatureDetail[];
  comparison: ComparisonBasis[];
  limitation: string;
}

// ------------------------------------------------------------------ error bodies

export interface FieldError {
  name: string;
  message: string;
}

/** Keys any error body may carry (plan section 6, "The error body"). */
export interface ErrorExtras {
  hint?: string;
  fields?: FieldError[];
  /** Matches the server's log line; shown with a 500 so it can be quoted. */
  requestId?: string;
}

export interface InvalidBody extends ErrorExtras {
  status: 'invalid';
  message: string;
  hint: string;
}

export interface UnsupportedBody extends ErrorExtras {
  status: 'unsupported';
  message: string;
  examples: string[];
}

export interface InsufficientHistoryBody extends ErrorExtras {
  status: 'insufficient_history';
  message: string;
  transaction: TransactionCore;
  history: { earlierTx: number; spanDays: number; required: HistoryRequirement };
  firstScoredDate: string | null;
}

export interface NotFoundBody extends ErrorExtras {
  status: 'not_found';
  message: string;
}

/** The server's remaining statuses, which views show as one message and a "Try again". */
export type ServiceStatusCode =
  | 'unavailable' // 503: the models are still loading
  | 'rate_limited' // 429
  | 'server_error' // 500
  | 'conflict' // 409
  | 'too_large' // 413
  | 'disabled' // 403
  | 'upstream_error' // 502
  | 'upstream_timeout'; // 504

export interface ServiceBody extends ErrorExtras {
  status: ServiceStatusCode;
  message: string;
}

/**
 * Failures the browser itself detects, so no server body exists: no answer ('network'), no answer
 * within the time limit ('timeout'), or a request the caller cancelled ('cancelled').
 */
export interface ClientBody {
  status: 'network' | 'timeout' | 'cancelled';
  message: string;
}

export type ApiErrorBody =
  | InvalidBody
  | UnsupportedBody
  | InsufficientHistoryBody
  | NotFoundBody
  | ServiceBody
  | ClientBody;

/** Thrown by every API call that does not succeed. status 0 means the request never got an answer. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

// ------------------------------------------------------------------ service status and settings

export type AssistantState = 'ready' | 'not_installed' | 'loading' | 'off';

/** E1. While the models load the server answers 503 with a ServiceBody instead. */
export interface HealthResponse {
  status: 'ok';
  version: string;
  snapshotDate: string;
  addressCount: number;
  methodCount: number;
  assistant: AssistantState;
  liveLookup: boolean;
  uptimeSeconds: number;
}

/** The `web` block of backend/config/settings.json, passed on by E2 (plan section 5, "Configuration"). */
export interface WebSettings {
  whatIf: {
    minAmountBtc: number;
    maxAmountBtc: number;
    maxGapYears: number;
    curvePoints: number;
    curveMaxPoints: number;
    debounceMs: number;
  };
  lists: { pageSize: number; maxPageSize: number };
  requests: { timeoutMs: number; assistantTimeoutMs: number; healthPollSeconds: number };
  charts: { webglMinPoints: number };
  watchlist: { maxEntries: number; maxLabelChars: number; maxNoteChars: number };
  live: { defaultMaxTx: number; maxTxLimit: number; lookupsPerHour: number; cacheDays: number };
  replay: { speeds: number[] };
  limits: { maxBodyBytes: number; maxAddressChars: number };
}

export interface FeatureInfo {
  id: FeatureId;
  name: string;
  description: string;
  /** 'BTC', 'count', 'hours' or 'ratio'. */
  unit: string;
}

/** E2: everything the front end would otherwise hard-code. */
export interface ConfigResponse {
  snapshot: SnapshotInfo;
  limitationLine: string;
  features: FeatureInfo[];
  history: HistoryRequirement;
  thresholds: { flagAbsZ: number; contributingAbsZ: number };
  /** The id of the method used when a request names none. */
  defaultMethod: string;
  web: WebSettings;
  whatIf: { defaultTime: string };
  capabilities: { assistant: boolean; liveLookup: boolean };
}

/**
 * What the shell and views read. E2's answer satisfies it as it is; when the service is
 * unreachable the bundled settings.json supplies everything except the snapshot (known only to the
 * service) and reports every optional capability as off.
 */
export type AppSettings = Pick<ConfigResponse, 'limitationLine' | 'history' | 'thresholds' | 'web' | 'capabilities'> & {
  snapshot: SnapshotInfo | null;
};

/** Options every call accepts. Aborting the signal cancels the request in flight. */
export interface RequestOptions {
  signal?: AbortSignal;
}

export interface ExplorerApi {
  health(opts?: RequestOptions): Promise<HealthResponse>;
  config(opts?: RequestOptions): Promise<ConfigResponse>;
  listAddresses(opts?: RequestOptions): Promise<AddressesResponse>;
  lookup(address: string, opts?: RequestOptions): Promise<LookupResponse>;
  timeline(address: string, opts?: RequestOptions): Promise<TimelineResponse>;
  day(address: string, date: string, opts?: RequestOptions): Promise<DayResponse>;
  transaction(txid: string, address: string, opts?: RequestOptions): Promise<TransactionDetail>;
}
