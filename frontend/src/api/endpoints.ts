// The typed calls of the explorer API: one function per endpoint, over the Axios client. Views
// reach them through `api` (client.ts) and never touch Axios (plan section 5, "Rules of the layering").

import type { AxiosInstance } from 'axios';
import { fileStem } from '../charts/chartTable';
import type { ExplorerApi, RequestOptions } from './types';

/** The name in `Content-Disposition: attachment; filename="1Bbcsfxj-2026-10-22.csv"`, or null when the header is missing or unreadable. */
export function attachmentName(header: unknown): string | null {
  return typeof header === 'string' ? (/filename="([^"]+)"/.exec(header)?.[1] ?? null) : null;
}

export function createHttpApi(client: AxiosInstance): ExplorerApi {
  const enc = encodeURIComponent;
  // `params` may hold arrays (E6's repeatable `status` and `direction`); the client serialises them
  // as repeated keys, and leaves out any key whose value is undefined.
  const get = <T>(url: string, opts?: RequestOptions, params?: object) =>
    client.get<T>(url, { signal: opts?.signal, params }).then((r) => r.data);
  const post = <T>(url: string, body: unknown, opts?: RequestOptions) =>
    client.post<T>(url, body, { signal: opts?.signal }).then((r) => r.data);

  return {
    health: (opts) => get('/api/health', opts),
    config: (opts) => get('/api/config', opts),
    listAddresses: (opts) => get('/api/addresses', opts),
    lookup: (address, opts) => post('/api/lookup', { address }, opts),
    timeline: (address, opts) => get(`/api/addresses/${enc(address)}/timeline`, opts),
    transactions: (address, query, opts) => get(`/api/addresses/${enc(address)}/transactions`, opts, query),
    transaction: (txid, address, opts) => get(`/api/transactions/${enc(txid)}`, opts, { address }),
    whatIf: (address, body, opts) => post(`/api/addresses/${enc(address)}/what-if`, body, opts),
    whatIfCurve: (address, body, opts) => post(`/api/addresses/${enc(address)}/what-if/curve`, body, opts),
    methods: (opts) => get('/api/methods', opts),
    // A file is read as text, so the client does not parse the JSON export. The name is the service's;
    // a browser on another origin cannot read the header (the service lists only X-Request-ID as exposed), so the format names the file then.
    exportFile: (address, format, query, opts) =>
      client
        .get<string>(`/api/addresses/${enc(address)}/export`, { signal: opts?.signal, params: { ...query, format }, responseType: 'text' })
        .then((r) => ({ filename: attachmentName(r.headers['content-disposition']) ?? `${fileStem([address])}.${format}`, text: r.data })),
  };
}
