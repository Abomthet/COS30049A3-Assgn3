// The API contract (plan section 6). The FastAPI back end (backend/openapi.json is the authority)
// and the mock built from its recorded answers return exactly these shapes, so switching from one
// to the other changes no screen code.
//
//   GET  /api/health                                  -> HealthResponse | 503 ServiceBody (unavailable)
//   GET  /api/config                                  -> ConfigResponse
//   GET  /api/addresses                               -> AddressesResponse
//   POST /api/lookup            {address}             -> LookupResponse | 400 InvalidBody | 404 UnsupportedBody
//   GET  /api/addresses/{address}/timeline            -> TimelineResponse | 400 | 404 UnsupportedBody
//   GET  /api/addresses/{address}/transactions?...    -> TransactionsResponse | 400 | 404 UnsupportedBody
//   GET  /api/transactions/{txid}?address=            -> TransactionDetail | 400 | 404 UnsupportedBody or NotFoundBody
//                                                        | 422 InsufficientHistoryBody
//   POST /api/addresses/{address}/what-if             -> WhatIfResult | 400 | 404 | 422 InsufficientHistoryBody
//   POST /api/addresses/{address}/what-if/curve       -> WhatIfCurve | 400 | 404 | 422 InsufficientHistoryBody
//   GET  /api/addresses/{address}/export?format=...   -> a CSV or JSON file (ExportFile) | 400 | 404
//   GET  /api/methods                                 -> MethodsResponse
//
// Times are ISO 8601 in UTC; days are 'YYYY-MM-DD' in UTC; amounts are integer satoshis.

import type { AddressKind } from '../lib/address';
import type { FeatureId } from '../lib/settings';

export type Direction = 'in' | 'out' | 'none';

/** The nine methods; the deciding one (default `baseline`) sets the flags and scores of E3 to E6. */
export type MethodId =
  | 'baseline'
  | 'isolation_forest'
  | 'lof'
  | 'kmeans'
  | 'dbscan'
  | 'regression'
  | 'regression_interval'
  | 'fusion'
  | 'txgpt_method';

export type DataSource = 'snapshot' | 'live';

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
  id: MethodId;
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
  /** The address type; `segwit` is a witness version the checker does not name. */
  kind: AddressKind;
  source: DataSource;
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
  /** The first and last transaction time (ISO 8601), not day keys. */
  range: { start: string; end: string };
  /** Only days with at least one transaction, oldest first. */
  days: TimelineDay[];
  totals: { txCount: number; scoredCount: number; flaggedCount: number; flaggedDays: number };
  history: {
    status: 'sufficient' | 'insufficient';
    txCount: number;
    /** Fractional: 0.4 means under a day. */
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
  /** The deciding method's score; null when not scored. */
  score: number | null;
  /** The template's strongest reason, such as "Longer gap than usual"; null when not scored. */
  mainReason: string | null;
  mainZ: number | null;
  /** How many of the nine methods flag it. */
  flaggedBy: number;
}

export type SortKey = 'time' | 'amount' | 'score';

/** E6's query. `status` and `direction` may repeat; a leading `-` on `sort` reverses it. */
export interface TransactionQuery {
  /** One UTC day; not together with `from` or `to`. */
  date?: string;
  from?: string;
  to?: string;
  status?: ScoreStatus[];
  direction?: Direction[];
  sort?: SortKey | `-${SortKey}`;
  method?: MethodId;
  /** From 1. */
  page?: number;
  /** Default 50, at most 200. */
  pageSize?: number;
}

/** E6: a filtered, sorted page of rows. */
export interface TransactionsResponse {
  address: string;
  date: string | null;
  transactions: TransactionRow[];
  page: number;
  pageSize: number;
  total: number;
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
  /** Public block-explorer page; null for a hypothetical transaction. */
  sourceUrl: string | null;
}

export type FeatureRole = 'flag' | 'contributing' | 'within-usual' | 'no-comparison';

export interface FeatureDetail {
  id: FeatureId;
  name: string;
  /** What the feature measures, in plain words. */
  description: string;
  /** Value in the units E2 names for the feature: BTC, count, hours or ratio. */
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
  /** The template's text, line by line; on a flagged item it ends with the limitation line. */
  explanation: string;
  /** Every method's score; null where a method cannot score this transaction. */
  scores: Record<MethodId, number | null>;
  /** Every method's flag. */
  flags: Record<MethodId, boolean>;
  source: DataSource;
}

// ------------------------------------------------------------------ what-if (E8, E9)

/** The two directions a hypothetical transaction can have; `none` is only what a real one can show. */
export type WhatIfDirection = Exclude<Direction, 'none'>;

/** E8's body. The amount is a decimal string, so no digit is lost to a float. */
export interface WhatIfRequest {
  amountBtc: string;
  direction: WhatIfDirection;
  /** ISO 8601 with a zone. */
  time: string;
}

/** E8: a transaction detail for a transaction that does not exist, so it has no id, block or public page. */
export interface WhatIfResult
  extends Omit<TransactionDetail, 'txid' | 'blockHeight' | 'sourceUrl' | 'scores' | 'flags' | 'source'> {
  txid: 'what-if';
  sourceUrl: null;
  /** Only the methods that can score new input have a key. */
  scores: Partial<Record<MethodId, number>>;
  flags: Partial<Record<MethodId, boolean>>;
  /** The methods that cannot score a hypothetical transaction. */
  notAvailable: MethodId[];
  note: string;
}

/** E9's body: the server spaces its default amounts around the address's usual one, or `minBtc` to `maxBtc` is spaced evenly on a log scale. */
export interface WhatIfCurveRequest {
  direction: WhatIfDirection;
  time: string;
  minBtc?: number;
  maxBtc?: number;
  points?: number;
}

export interface CurveMethod {
  id: MethodId;
  name: string;
  /** The score from which this method flags. */
  threshold: number;
  /** One per amount; null where the method cannot score that amount. */
  scores: Array<number | null>;
  flags: boolean[];
}

export interface WhatIfCurve {
  address: string;
  direction: WhatIfDirection;
  time: string;
  /** The median amount in this direction before `time`; null when the amounts were given. */
  usualBtc: number | null;
  decidingMethod: MethodId;
  amountsBtc: number[];
  methods: CurveMethod[];
  notAvailable: MethodId[];
}

// ------------------------------------------------------------------ export (E10) and methods (E11)

export type ExportFormat = 'csv' | 'json';

/** E10's answer: the file's text and the name the service gave it. */
export interface ExportFile {
  filename: string;
  text: string;
}

/** A measured figure with its 95% interval. */
export interface Interval {
  value: number;
  ciLow: number;
  ciHigh: number;
}

export type PlantedPattern = 'spike' | 'burst' | 'dormant';

export interface MethodDescription {
  id: MethodId;
  name: string;
  /** Lower case, such as "outlier detection". */
  family: string;
  description: string;
  threshold: number;
  scoresNewInput: boolean;
  evaluation: {
    /** Recall on planted test transactions, over the three patterns. */
    meanRecall: Interval;
    recallByPattern: Record<PlantedPattern, Interval>;
    /** The share of real transactions the method flags. */
    flagRate: number;
  };
}

export interface MethodsResponse {
  defaultMethod: MethodId;
  methods: MethodDescription[];
}

// ------------------------------------------------------------------ error bodies

export interface FieldError {
  name: string;
  message: string;
}

/** Keys any error body may carry (plan section 6, "The error body"). */
export interface ErrorExtras {
  hint?: string | null;
  fields?: FieldError[];
  /** Matches the server's log line; shown with a 500 so it can be quoted. */
  requestId?: string;
}

/** 400, and 415 (a body that is not JSON). */
export interface InvalidBody extends ErrorExtras {
  status: 'invalid';
  message: string;
}

/** 404 for a valid address the service cannot open. */
export interface UnsupportedBody extends ErrorExtras {
  status: 'unsupported';
  message: string;
  /** Three addresses that can be opened. */
  examples: string[];
  /** Whether a live lookup (S-09) is switched on. */
  canLookupLive: boolean;
}

/** 422 from E7 (an address with too little history, or an early transaction of a normal one) and from E8 and E9, which have no transaction. */
export interface InsufficientHistoryBody extends ErrorExtras {
  status: 'insufficient_history';
  message: string;
  transaction?: TransactionCore;
  history: { earlierTx: number; spanDays: number; required: HistoryRequirement };
  firstScoredDate: string | null;
}

/** 404 for a transaction that is not one of the address's. */
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
  | 'too_large' // 413: a request body over the size limit
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

export type FeatureUnit = 'BTC' | 'count' | 'hours' | 'ratio';

export interface FeatureInfo {
  id: FeatureId;
  name: string;
  description: string;
  unit: FeatureUnit;
}

/** E2: everything the front end would otherwise hard-code. */
export interface ConfigResponse {
  snapshot: SnapshotInfo;
  limitationLine: string;
  features: FeatureInfo[];
  history: HistoryRequirement;
  /** The flag line is the tuned threshold saved with the model (decision D-W-10), not settings.json's baseline value. */
  thresholds: { flagAbsZ: number; contributingAbsZ: number };
  /** The id of the method used when a request names none. */
  defaultMethod: MethodId;
  web: WebSettings;
  whatIf: { defaultTime: string };
  capabilities: { assistant: boolean; liveLookup: boolean };
}

/**
 * What the shell and views read. E2's answer satisfies it as it is. When the service is
 * unreachable the bundled settings.json supplies the limitation line, the history rule and the
 * `web` limits and reports every optional capability as off; the snapshot, the feature list and the
 * flag line and the lab's default time are known only to the service, so they are absent (no flag line is drawn).
 */
export type AppSettings = Pick<ConfigResponse, 'limitationLine' | 'history' | 'web' | 'capabilities'> & {
  snapshot: SnapshotInfo | null;
  features: FeatureInfo[];
  thresholds: ConfigResponse['thresholds'] | null;
  /** The time the what-if lab opens with; the service picks it from the snapshot date. */
  whatIf: ConfigResponse['whatIf'] | null;
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
  transactions(address: string, query: TransactionQuery, opts?: RequestOptions): Promise<TransactionsResponse>;
  transaction(txid: string, address: string, opts?: RequestOptions): Promise<TransactionDetail>;
  whatIf(address: string, body: WhatIfRequest, opts?: RequestOptions): Promise<WhatIfResult>;
  whatIfCurve(address: string, body: WhatIfCurveRequest, opts?: RequestOptions): Promise<WhatIfCurve>;
  /** E10 with E6's filters; `page` and `pageSize` do not apply to a file. */
  exportFile(address: string, format: ExportFormat, query: Omit<TransactionQuery, 'page' | 'pageSize'>, opts?: RequestOptions): Promise<ExportFile>;
  methods(opts?: RequestOptions): Promise<MethodsResponse>;
}
