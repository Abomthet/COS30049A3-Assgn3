// The answers recorded from the real service by scripts/record-fixtures.mjs, typed as the contract.
// The JSON files are the service's own bodies; the casts below are the only place that says so.

import addressMain from './fixtures/address-main.json';
import addressShort from './fixtures/address-short.json';
import addresses from './fixtures/addresses.json';
import config from './fixtures/config.json';
import exportMain from './fixtures/export-main.json';
import health from './fixtures/health.json';
import methods from './fixtures/methods.json';
import methodsMain from './fixtures/methods-main.json';
import unsupported from './fixtures/unsupported.json';
import whatIfMain from './fixtures/whatif-main.json';
import type {
  AddressesResponse,
  ConfigResponse,
  ExportFile,
  HealthResponse,
  InsufficientHistoryBody,
  InvalidBody,
  MethodId,
  MethodsResponse,
  TimelineResponse,
  TransactionDetail,
  TransactionQuery,
  TransactionsResponse,
  UnsupportedBody,
  WhatIfCurve,
  WhatIfCurveRequest,
  WhatIfRequest,
  WhatIfResult,
} from '../types';

/** What was recorded for one address: its timeline, every page of its rows, and some E7 answers. */
export interface RecordedAddress {
  address: string;
  timeline: TimelineResponse;
  transactionPages: TransactionsResponse[];
  details: Record<string, { status: 200; body: TransactionDetail } | { status: 422; body: InsufficientHistoryBody }>;
}

export const HEALTH = health as HealthResponse;
export const CONFIG = config as ConfigResponse;
export const ADDRESSES = addresses as AddressesResponse;
export const UNSUPPORTED = unsupported as UnsupportedBody;
export const RECORDED: RecordedAddress[] = [addressMain, addressShort] as unknown as RecordedAddress[];
export const METHODS_ANSWER = methods as MethodsResponse;
/** The running example under the two recorded methods other than the default (Regression residual and TxGPT surprisal). */
export const METHOD_RUNS = methodsMain as unknown as { address: string; runs: Partial<Record<MethodId, Omit<RecordedAddress, 'address'>>> };

/** A request the service was asked, with the status and body it answered. */
type Recorded<Request, Ok> = { request: Request } & ({ status: 200; body: Ok } | { status: 400; body: InvalidBody } | { status: 422; body: InsufficientHistoryBody });

/** The what-if requests recorded for the running example; the mock answers these and no others. */
export const WHAT_IF_RECORDED = whatIfMain as unknown as {
  address: string;
  results: Array<Recorded<WhatIfRequest, WhatIfResult>>;
  curves: Array<Recorded<WhatIfCurveRequest, WhatIfCurve>>;
};

/** The running example's flagged transactions, exported: the one filtered view the mock has a file for. */
export const EXPORT_RECORDED = exportMain as { address: string; query: TransactionQuery; csv: ExportFile; json: ExportFile };
