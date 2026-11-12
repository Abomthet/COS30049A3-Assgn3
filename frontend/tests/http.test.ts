// The Axios client against a real local server: what each kind of answer, silence, delay and
// cancellation becomes. Every failure must leave as an ApiError the views can switch on.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { AxiosInstance } from 'axios';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createHttpApi } from '../src/api/endpoints';
import { createHttpClient } from '../src/api/http';
import { ApiError } from '../src/api/types';

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
};

let server: Server;
let baseUrl: string;
let lastRequest: { method?: string; url?: string; body: string };

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      lastRequest = { method: req.method, url: req.url, body };
      switch (req.url?.split('?')[0]) {
        case '/api/ok':
          return json(res, 200, { hello: 'world' });
        case '/api/invalid':
          return json(res, 400, { status: 'invalid', message: 'Bad.', hint: 'Fix it.', requestId: 'abc123' });
        case '/api/too-large':
          return json(res, 413, { status: 'too_large', message: 'Too big.', hint: 'Send less.', requestId: 'big1' });
        case '/api/not-json': // 415 is an `invalid` body
          return json(res, 415, { status: 'invalid', message: 'The request body must be JSON.', requestId: 'nj1' });
        case '/api/starting':
          return json(res, 503, { status: 'unavailable', message: 'Loading.' });
        case '/api/busy': // a 429 asks for a wait in a header
          return void res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '7' }).end(JSON.stringify({ status: 'rate_limited', message: 'Busy.' }));
        case '/api/busy-no-wait':
          return json(res, 429, { status: 'rate_limited', message: 'Busy.' });
        case '/api/proxy-error': // what Vite answers when the back end is stopped
          return void res.writeHead(500).end();
        case '/api/slow': // never answers; the client's time limit has to end it
          return;
        case '/api/addresses/addr/export':
          if (req.url?.includes('format=xml')) return json(res, 400, { status: 'invalid', message: 'Choose csv or json.' });
          return void res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="addr-2026-10-22.csv"' }).end('a,b\r\n1,2\r\n');
        case '/api/addresses/bc1qunnamed/export':
          return void res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"count":0}');
        case '/api/addresses/addr/what-if':
          return json(res, 422, { status: 'insufficient_history', message: 'Too early.', history: { earlierTx: 2, spanDays: 3, required: { minTx: 10, minSpanDays: 14 } }, firstScoredDate: '2024-07-11' });
        default:
          return json(res, 200, {});
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

// jsdom would otherwise send these through its own XMLHttpRequest, which enforces CORS; Node's
// HTTP adapter is what a browser's fetch to the same origin amounts to.
const viaNode = (c: AxiosInstance): AxiosInstance => {
  c.defaults.adapter = 'http';
  return c;
};
const client = (timeoutMs = 2000): AxiosInstance => viaNode(createHttpClient({ baseUrl, timeoutMs }));

async function failureOf(request: Promise<unknown>): Promise<ApiError> {
  try {
    await request;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return err as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('createHttpClient', () => {
  test('returns the body of a successful answer', async () => {
    const { data } = await client().get('/api/ok');
    expect(data).toEqual({ hello: 'world' });
  });

  test("keeps the server's error body and status (400, with the request identifier)", async () => {
    const error = await failureOf(client().get('/api/invalid'));
    expect(error.status).toBe(400);
    expect(error.body).toEqual({ status: 'invalid', message: 'Bad.', hint: 'Fix it.', requestId: 'abc123' });
  });

  test('keeps a 413 too_large and a 415, which the service reports as invalid', async () => {
    expect(await failureOf(client().get('/api/too-large'))).toMatchObject({ status: 413, body: { status: 'too_large', message: 'Too big.' } });
    expect(await failureOf(client().get('/api/not-json'))).toMatchObject({ status: 415, body: { status: 'invalid' } });
  });

  test('keeps a 503 unavailable, which means "starting"', async () => {
    const error = await failureOf(client().get('/api/starting'));
    expect(error).toMatchObject({ status: 503, body: { status: 'unavailable' } });
  });

  test('a 429 keeps the wait it asks for, in whole seconds, and leaves it out when the answer names none', async () => {
    expect(await failureOf(client().get('/api/busy'))).toMatchObject({ status: 429, body: { status: 'rate_limited', retryAfterSeconds: 7 } });
    const unasked = await failureOf(client().get('/api/busy-no-wait'));
    expect(unasked.body).toEqual({ status: 'rate_limited', message: 'Busy.' });
  });

  test('an answer without our body is "no answer from the service" (the dev proxy with the back end stopped)', async () => {
    const error = await failureOf(client().get('/api/proxy-error'));
    expect(error.body.status).toBe('network');
  });

  test('a refused connection is a network failure with status 0', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    const error = await failureOf(viaNode(createHttpClient({ baseUrl: `http://127.0.0.1:${port}` })).get('/api/ok'));
    expect(error).toMatchObject({ status: 0, body: { status: 'network' } });
  });

  test('a request that outlasts the time limit ends as a timeout', async () => {
    const started = Date.now();
    const error = await failureOf(client(150).get('/api/slow'));
    expect(error.body.status).toBe('timeout');
    expect(Date.now() - started).toBeLessThan(1500);
  });

  test('aborting the signal cancels the request in flight', async () => {
    const controller = new AbortController();
    const pending = failureOf(client().get('/api/slow', { signal: controller.signal }));
    setTimeout(() => controller.abort(), 30);
    expect((await pending).body.status).toBe('cancelled');
  });

  test('uses the plan\'s default time limit when none is given', () => {
    expect(createHttpClient({ baseUrl }).defaults.timeout).toBe(10_000);
  });
});

describe('createHttpApi', () => {
  const api = () => createHttpApi(client());

  test('E1 and E2 are plain GETs', async () => {
    await api().health();
    expect(lastRequest).toMatchObject({ method: 'GET', url: '/api/health' });
    await api().config();
    expect(lastRequest).toMatchObject({ method: 'GET', url: '/api/config' });
  });

  test('path segments are encoded and E6 and E7 take their parameters in the query string', async () => {
    await api().transactions('bc1q/odd', { date: '2026-01-02' });
    expect(lastRequest.url).toBe('/api/addresses/bc1q%2Fodd/transactions?date=2026-01-02');
    await api().transaction('abc', 'addr');
    expect(lastRequest.url).toBe('/api/transactions/abc?address=addr');
  });

  test('E6 repeats a repeatable parameter (?status=a&status=b), not status[]=a, and leaves out what is not set', async () => {
    await api().transactions('addr', {
      status: ['flagged', 'not-scored'],
      direction: ['out'],
      sort: '-score',
      from: '2026-01-01',
      to: '2026-02-01',
      page: 2,
      pageSize: 200,
      method: undefined,
    });
    expect(lastRequest.url).toBe(
      '/api/addresses/addr/transactions?status=flagged&status=not-scored&direction=out&sort=-score&from=2026-01-01&to=2026-02-01&page=2&pageSize=200',
    );
  });

  test('E8 and E9 post their body as JSON, and a 422 without a transaction keeps its counts', async () => {
    const body = { amountBtc: '0.05', direction: 'out' as const, time: '2026-10-20T12:00:00Z' };
    const error = await failureOf(api().whatIf('addr', body));
    expect(lastRequest).toMatchObject({ method: 'POST', url: '/api/addresses/addr/what-if', body: JSON.stringify(body) });
    expect(error).toMatchObject({ status: 422, body: { status: 'insufficient_history', firstScoredDate: '2024-07-11' } });
    await api().whatIfCurve('addr', { direction: 'in', time: body.time, minBtc: 0.00001, maxBtc: 1, points: 41 });
    expect(lastRequest.url).toBe('/api/addresses/addr/what-if/curve');
    await api().methods();
    expect(lastRequest).toMatchObject({ method: 'GET', url: '/api/methods' });
  });

  test('E10 sends the filters and the format, reads the file as text and takes its name from Content-Disposition', async () => {
    const file = await api().exportFile('addr', 'csv', { status: ['flagged'], direction: ['out'], sort: '-time' });
    expect(lastRequest.url).toBe('/api/addresses/addr/export?status=flagged&direction=out&sort=-time&format=csv');
    expect(file).toEqual({ filename: 'addr-2026-10-22.csv', text: 'a,b\r\n1,2\r\n' });
  });

  test('E10 names the file from the address and format when the browser cannot read the header; a JSON file stays text', async () => {
    const file = await api().exportFile('bc1qunnamed', 'json', {});
    expect(file).toEqual({ filename: 'bc1qunnamed.json', text: '{"count":0}' });
  });

  test("E10's error body arrives as text and still becomes the ApiError of the service", async () => {
    const error = await failureOf(api().exportFile('addr', 'xml' as 'csv', {}));
    expect(error).toMatchObject({ status: 400, body: { status: 'invalid', message: 'Choose csv or json.' } });
  });

  test('lookup posts the address as JSON', async () => {
    await api().lookup('1abc');
    expect(lastRequest).toMatchObject({ method: 'POST', url: '/api/lookup', body: '{"address":"1abc"}' });
  });
});
