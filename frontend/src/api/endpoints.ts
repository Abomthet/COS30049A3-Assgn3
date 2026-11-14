// The typed calls of the explorer API: one function per endpoint, over the Axios client. Views
// reach them through `api` (client.ts) and never touch Axios (plan section 5, "Rules of the layering").

import type { AxiosInstance } from 'axios';
import { fileStem } from '../charts/chartTable';
import { noteOrigin } from '../lib/liveOrigin';
import { WEB } from '../lib/settings';
import type { ExplanationResponse, ExplorerApi, LiveLookup, RequestOptions, TimelineResponse, WatchlistEntry } from './types';

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
    timeline: (address, opts) => get<TimelineResponse>(`/api/addresses/${enc(address)}/timeline`, opts, { method: opts?.method }).then(noteOrigin),
    transactions: (address, query, opts) => get(`/api/addresses/${enc(address)}/transactions`, opts, query),
    transaction: (txid, address, opts) => get(`/api/transactions/${enc(txid)}`, opts, { address, method: opts?.method }),
    whatIf: (address, body, opts) => post(`/api/addresses/${enc(address)}/what-if`, body, opts),
    whatIfCurve: (address, body, opts) => post(`/api/addresses/${enc(address)}/what-if/curve`, body, opts),
    explain: (body, opts) =>
      client.post<ExplanationResponse>('/api/explanations', body, { signal: opts?.signal, timeout: WEB.requests.assistantTimeoutMs }).then((r) => r.data),
    methods: (opts) => get('/api/methods', opts),
    watchlist: (opts) => get('/api/watchlist', opts),
    putWatchlist: (address, body, opts) =>
      client.put<WatchlistEntry>(`/api/watchlist/${enc(address)}`, body, { signal: opts?.signal }).then((r) => ({ entry: r.data, created: r.status === 201 })),
    deleteWatchlist: (address, opts) => client.delete(`/api/watchlist/${enc(address)}`, { signal: opts?.signal }).then(() => undefined),
    startLiveLookup: (address, opts) => post<LiveLookup>('/api/live/lookups', { address }, opts),
    liveLookup: (id, opts) => get(`/api/live/lookups/${enc(id)}`, opts),
    cancelLiveLookup: (id, opts) => client.delete(`/api/live/lookups/${enc(id)}`, { signal: opts?.signal }).then(() => undefined),
    forgetAddress: (address, opts) => client.delete(`/api/addresses/${enc(address)}`, { signal: opts?.signal }).then(() => undefined),
    // The stream is the browser's own EventSource: it takes the same base address as the client and cannot carry the client's headers.
    openLiveEvents: (id, onLookup, onError) => {
      const source = new EventSource(`${client.defaults.baseURL ?? ''}/api/live/lookups/${enc(id)}/events`);
      for (const name of ['status', 'progress', 'done', 'failed']) {
        source.addEventListener(name, (event) => onLookup(JSON.parse((event as MessageEvent<string>).data) as LiveLookup));
      }
      source.onerror = () => {
        source.close();
        onError();
      };
      return () => source.close();
    },
    // A file is read as text, so the client does not parse the JSON export. The name is the service's;
    // CORS exposes Content-Disposition, so a page on another origin can read it too; without the header, the format names the file.
    exportFile: (address, format, query, opts) =>
      client
        .get<string>(`/api/addresses/${enc(address)}/export`, { signal: opts?.signal, params: { ...query, format }, responseType: 'text' })
        .then((r) => ({ filename: attachmentName(r.headers['content-disposition']) ?? `${fileStem([address])}.${format}`, text: r.data })),
  };
}
