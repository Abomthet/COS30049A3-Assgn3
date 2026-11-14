// The typed calls of E16 to E20 against a real local server, and the stream's wiring (a stand-in EventSource: jsdom has none).
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createHttpApi } from '../src/api/endpoints';
import { createHttpClient } from '../src/api/http';
import { ApiError, type LiveLookup } from '../src/api/types';

const LOOKUP: LiveLookup = {
  id: 'abc123', address: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', status: 'fetching', maxTx: 500, startedAt: '2026-11-12T10:00:00Z', finishedAt: null, error: null, cached: false,
  progress: { pages: 0, transactions: 0, cap: 500, total: 1157 }, links: { status: '/api/live/lookups/abc123', events: '/api/live/lookups/abc123/events' },
};

let server: Server;
let baseUrl: string;
let last: { method?: string; url?: string; body: string };

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      last = { method: req.method, url: req.url, body };
      if (req.method === 'POST' && req.url === '/api/live/lookups') return void res.writeHead(202, { 'Content-Type': 'application/json' }).end(JSON.stringify(LOOKUP));
      if (req.method === 'GET' && req.url === '/api/live/lookups/abc123') return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ...LOOKUP, status: 'done' }));
      if (req.method === 'DELETE' && req.url === '/api/live/lookups/abc123') return void res.writeHead(204).end();
      if (req.method === 'DELETE' && req.url?.startsWith('/api/addresses/')) {
        return void res.writeHead(409, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'conflict', message: 'In the snapshot.' }));
      }
      res.writeHead(403, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'disabled', message: 'Live lookup is switched off on this server.' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => vi.unstubAllGlobals());

// jsdom would send these through its own XMLHttpRequest, which enforces CORS; Node's HTTP adapter is what a same-origin fetch amounts to.
const make = () => {
  const client = createHttpClient({ baseUrl });
  client.defaults.adapter = 'http';
  return createHttpApi(client);
};

describe('E16 to E20', () => {
  test('E16 posts the address and returns the lookup', async () => {
    const lookup = await make().startLiveLookup(LOOKUP.address);
    expect(lookup).toEqual(LOOKUP);
    expect(last).toMatchObject({ method: 'POST', url: '/api/live/lookups' });
    expect(JSON.parse(last.body)).toEqual({ address: LOOKUP.address });
  });

  test('E17 reads the lookup, E19 cancels it, E20 forgets an address', async () => {
    const api = make();
    expect((await api.liveLookup('abc123')).status).toBe('done');
    await expect(api.cancelLiveLookup('abc123')).resolves.toBeUndefined();
    expect(last).toMatchObject({ method: 'DELETE', url: '/api/live/lookups/abc123' });
    await expect(api.forgetAddress(LOOKUP.address)).rejects.toMatchObject({ status: 409, body: { status: 'conflict' } });
    expect(last.url).toBe(`/api/addresses/${LOOKUP.address}`);
  });

  test('a server with live lookup off answers 403 disabled as an ApiError', async () => {
    const error = await make().liveLookup('other').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, body: { status: 'disabled' } });
  });
});

describe('E18', () => {
  class FakeSource {
    static last: FakeSource;
    listeners = new Map<string, (event: MessageEvent<string>) => void>();
    onerror: (() => void) | null = null;
    closed = false;
    constructor(public url: string) {
      FakeSource.last = this;
    }
    addEventListener(name: string, listener: (event: MessageEvent<string>) => void) {
      this.listeners.set(name, listener);
    }
    close() {
      this.closed = true;
    }
  }

  test('opens the stream on the same base address, hands each event over as a lookup, and reports a failure once', () => {
    vi.stubGlobal('EventSource', FakeSource);
    const seen: LiveLookup[] = [];
    const failed = vi.fn();
    const close = make().openLiveEvents('abc123', (lookup) => seen.push(lookup), failed);
    const source = FakeSource.last;
    expect(source.url).toBe(`${baseUrl}/api/live/lookups/abc123/events`);
    expect([...source.listeners.keys()].sort()).toEqual(['done', 'failed', 'progress', 'status']);
    source.listeners.get('progress')!({ data: JSON.stringify(LOOKUP) } as MessageEvent<string>);
    expect(seen).toEqual([LOOKUP]);
    source.onerror!();
    expect(failed).toHaveBeenCalledTimes(1);
    expect(source.closed).toBe(true);
    close();
  });
});
