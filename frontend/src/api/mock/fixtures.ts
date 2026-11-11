// The answers recorded from the real service by scripts/record-fixtures.mjs, typed as the contract.
// The JSON files are the service's own bodies; the casts below are the only place that says so.

import addressMain from './fixtures/address-main.json';
import addressShort from './fixtures/address-short.json';
import addresses from './fixtures/addresses.json';
import config from './fixtures/config.json';
import health from './fixtures/health.json';
import unsupported from './fixtures/unsupported.json';
import type {
  AddressesResponse,
  ConfigResponse,
  HealthResponse,
  InsufficientHistoryBody,
  TimelineResponse,
  TransactionDetail,
  TransactionsResponse,
  UnsupportedBody,
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
