// The one Axios instance (D-A3-4). It owns what every request shares: the base address, the time
// limit, cancellation, and the rule that every failure leaves as an ApiError, so views switch on
// `error.body.status` and never see an Axios error.

import axios, { AxiosError, type AxiosInstance } from 'axios';
import { WEB } from '../lib/settings';
import { ApiError, type ApiErrorBody } from './types';

export interface HttpClientOptions {
  /** Empty means the page's own origin, where Vite (or a reverse proxy) passes /api to the back end. */
  baseUrl: string;
  /** Milliseconds before a request ends as a timeout. */
  timeoutMs?: number;
}

/** A body is one of ours when it carries a `status` string (plan section 6, "The error body"). */
function isErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === 'object' && body !== null && typeof (body as { status?: unknown }).status === 'string';
}

/** Turns anything Axios can throw into the ApiError the views handle. */
function toApiError(error: unknown): unknown {
  if (axios.isCancel(error)) {
    return new ApiError(0, { status: 'cancelled', message: 'The request was cancelled.' });
  }
  if (!(error instanceof AxiosError)) return error;
  if (error.code === AxiosError.ETIMEDOUT) {
    return new ApiError(0, { status: 'timeout', message: 'This is taking longer than it should.' });
  }
  const { response } = error;
  // A response without one of our bodies did not come from the service: with the dev proxy and
  // the back end stopped, Vite itself answers 502 with an empty body. That is "no answer".
  if (response && isErrorBody(response.data)) return new ApiError(response.status, response.data);
  return new ApiError(response?.status ?? 0, { status: 'network', message: 'The explorer service did not respond.' });
}

export function createHttpClient({ baseUrl, timeoutMs = WEB.requests.timeoutMs }: HttpClientOptions): AxiosInstance {
  const client = axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: { Accept: 'application/json' },
    // Reports a timeout as ETIMEDOUT rather than ECONNABORTED, so it cannot be confused with other aborts.
    transitional: { clarifyTimeoutError: true },
  });
  client.interceptors.response.use(undefined, (error: unknown) => {
    throw toApiError(error);
  });
  return client;
}
