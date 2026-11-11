// The typed calls of the explorer API: one function per endpoint, over the Axios client. Views
// reach them through `api` (client.ts) and never touch Axios (plan section 5, "Rules of the layering").

import type { AxiosInstance } from 'axios';
import type { ExplorerApi, RequestOptions } from './types';

export function createHttpApi(client: AxiosInstance): ExplorerApi {
  const enc = encodeURIComponent;
  const get = <T>(url: string, opts?: RequestOptions, params?: Record<string, string>) =>
    client.get<T>(url, { signal: opts?.signal, params }).then((r) => r.data);
  const post = <T>(url: string, body: unknown, opts?: RequestOptions) =>
    client.post<T>(url, body, { signal: opts?.signal }).then((r) => r.data);

  return {
    health: (opts) => get('/api/health', opts),
    config: (opts) => get('/api/config', opts),
    listAddresses: (opts) => get('/api/addresses', opts),
    lookup: (address, opts) => post('/api/lookup', { address }, opts),
    timeline: (address, opts) => get(`/api/addresses/${enc(address)}/timeline`, opts),
    day: (address, date, opts) => get(`/api/addresses/${enc(address)}/transactions`, opts, { date }),
    transaction: (txid, address, opts) => get(`/api/transactions/${enc(txid)}`, opts, { address }),
  };
}
