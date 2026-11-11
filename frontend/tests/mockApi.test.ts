// The mock is a copy of the real service's recorded answers (scripts/record-fixtures.mjs), so it must
// honour the same contract: 400 invalid, 404 unsupported / not found, 422 insufficient history, the
// tuned flag line from E2, and E6's filters, sorting and paging computed from the recorded rows.
import { describe, expect, test } from 'vitest';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import ex from '../src/api/mock/fixtures/examples.json';
import { ApiError, type ApiErrorBody, type TransactionQuery, type TransactionRow } from '../src/api/types';
import { LIMITATION_LINE } from '../src/lib/settings';
import { METHODS } from '../src/lib/methods';

async function failure(p: Promise<unknown>): Promise<{ status: number; body: ApiErrorBody }> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError);
    return { status: (err as ApiError).status, body: (err as ApiError).body };
  }
  throw new Error('expected the request to fail');
}

/** Every row that matches, joined from pages of 200 the way the scatter chart will. */
async function rowsOf(address: string, query: TransactionQuery = {}): Promise<TransactionRow[]> {
  const rows: TransactionRow[] = [];
  for (let page = 1; ; page++) {
    const p = await mockApi.transactions(address, { pageSize: 200, page, ...query });
    rows.push(...p.transactions);
    if (rows.length >= p.total) return rows;
  }
}

describe('lookup (POST /api/lookup)', () => {
  test('400 for an invalid address', async () => {
    const r = await failure(mockApi.lookup(ex.typo));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ status: 'invalid', message: expect.stringMatching(/checksum/) });
  });

  test('404 with three examples that are in the list for a valid address outside the snapshot (AC-02)', async () => {
    const r = await failure(mockApi.lookup(ex.unsupported));
    expect(r.status).toBe(404);
    if (r.body.status !== 'unsupported') throw new Error('wrong body');
    expect(r.body.examples).toHaveLength(3);
    expect(r.body.canLookupLive).toBe(false);
    const { addresses } = await mockApi.listAddresses();
    for (const e of r.body.examples) expect(addresses.map((a) => a.address)).toContain(e);
  });

  test('supported, including an upper-case bc1 address, with the summary from the list', async () => {
    const { addresses } = await mockApi.listAddresses();
    const bech32 = addresses.find((a) => a.address.startsWith('bc1q'))!;
    const r = await mockApi.lookup(bech32.address.toUpperCase());
    expect(r).toEqual({ status: 'supported', address: bech32.address, summary: bech32 });
  });
});

describe('the address list (E3)', () => {
  test('28 addresses of the snapshot, each with a type and a source, the short histories last', async () => {
    const { snapshot, addresses } = await mockApi.listAddresses();
    expect(addresses).toHaveLength(snapshot.addressCount);
    expect(snapshot).toMatchObject({ illustrative: false, source: 'Blockstream Esplora', dayTimeZone: 'UTC' });
    expect(addresses.every((a) => ['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'segwit'].includes(a.kind) && a.source === 'snapshot')).toBe(true);
    expect(addresses.at(-1)!.history).toBe('insufficient');
    expect(addresses.find((a) => a.address === ex.mainAddress)).toMatchObject({ txCount: 377, scoredCount: 367, flaggedCount: 3, kind: 'p2pkh' });
  });

  test('an address that is listed but was not recorded answers 404 not_found, not a made-up history', async () => {
    const { addresses } = await mockApi.listAddresses();
    const other = addresses.find((a) => a.address !== ex.mainAddress && a.address !== ex.shortHistory)!;
    expect(await failure(mockApi.timeline(other.address))).toMatchObject({ status: 404, body: { status: 'not_found' } });
  });
});

describe.each([[ex.mainAddress], [ex.shortHistory]])('the timeline and rows of %s', (address) => {
  test('AC-01 E5 agrees with E3 and with the rows of E6', async () => {
    const summary = (await mockApi.listAddresses()).addresses.find((a) => a.address === address)!;
    const tl = await mockApi.timeline(address);
    const rows = await rowsOf(address);
    expect(tl.days.map((d) => d.date)).toEqual([...tl.days.map((d) => d.date)].sort());
    expect(tl.days.reduce((s, d) => s + d.txCount, 0)).toBe(summary.txCount);
    expect(tl.days.reduce((s, d) => s + d.flaggedCount, 0)).toBe(summary.flaggedCount);
    expect(tl.totals.flaggedDays).toBe(tl.days.filter((d) => d.flaggedCount > 0).length);
    expect(tl.history.status).toBe(summary.history);
    expect(rows).toHaveLength(summary.txCount);
    expect(rows.filter((r) => r.status === 'flagged')).toHaveLength(summary.flaggedCount);
    expect(rows.filter((r) => r.status !== 'not-scored')).toHaveLength(summary.scoredCount);
  });
});

describe('transactions (E6)', () => {
  const main = ex.mainAddress;

  test('a day: the rows of that UTC day, with the date echoed back', async () => {
    const day = await mockApi.transactions(main, { date: ex.flagged.date });
    expect(day).toMatchObject({ address: main, date: ex.flagged.date, page: 1, pageSize: 50 });
    expect(day.transactions.length).toBe(day.total);
    expect(day.transactions.every((t) => t.time.startsWith(ex.flagged.date))).toBe(true);
    expect(day.transactions.map((t) => t.txid)).toContain(ex.flagged.txid);
  });

  test('a day without transactions is an empty 200', async () => {
    expect(await mockApi.transactions(main, { date: '2020-01-01' })).toMatchObject({ transactions: [], total: 0 });
  });

  test('status and direction may repeat and are combined with and', async () => {
    const both = await rowsOf(main, { status: ['flagged', 'not-scored'] });
    expect(new Set(both.map((r) => r.status))).toEqual(new Set(['flagged', 'not-scored']));
    const out = await rowsOf(main, { status: ['flagged'], direction: ['out'] });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((r) => r.status === 'flagged' && r.direction === 'out')).toBe(true);
  });

  test('a range of days is inclusive', async () => {
    const rows = await rowsOf(main, { from: '2024-07-11', to: '2024-07-12' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.time >= '2024-07-11' && r.time < '2024-07-13')).toBe(true);
  });

  test('sorting: time newest first, score highest first with unscored rows last either way', async () => {
    const newest = await rowsOf(main, { sort: '-time' });
    expect(newest.map((r) => r.time)).toEqual([...newest.map((r) => r.time)].sort().reverse());
    for (const sort of ['score', '-score'] as const) {
      const rows = await rowsOf(main, { sort });
      const scores = rows.map((r) => r.score);
      const firstNull = scores.indexOf(null);
      expect(scores.slice(firstNull).every((s) => s === null)).toBe(true);
      const real = scores.slice(0, firstNull) as number[];
      expect(real).toEqual([...real].sort((a, b) => (sort === 'score' ? a - b : b - a)));
    }
    expect((await rowsOf(main, { sort: '-score' }))[0].txid).toBe(ex.flagged.txid);
  });

  test('paging: pages are slices of one list and total is the whole list', async () => {
    const [p1, p2, p8] = await Promise.all([1, 2, 8].map((page) => mockApi.transactions(main, { page })));
    expect(p1).toMatchObject({ page: 1, pageSize: 50, total: 377 });
    expect(p1.transactions).toHaveLength(50);
    expect(p2.transactions[0].txid).not.toBe(p1.transactions[0].txid);
    expect(p8.transactions).toHaveLength(377 - 7 * 50);
    expect((await mockApi.transactions(main, { page: 99 })).transactions).toEqual([]);
  });

  test('a row carries the deciding method\'s view of it', async () => {
    const [top] = await rowsOf(main, { status: ['flagged'], sort: '-score' });
    expect(top).toMatchObject({ status: 'flagged', flaggedBy: expect.any(Number) } satisfies Partial<TransactionRow>);
    expect(top.score).toBeGreaterThanOrEqual(5);
    expect(top.mainReason).toEqual(expect.any(String));
    const unscored = (await rowsOf(main, { status: ['not-scored'] }))[0];
    expect(unscored).toMatchObject({ score: null, mainReason: null, mainZ: null, flaggedBy: 0 });
  });

  test('400 for a malformed date, a contradictory query or a page that is too large', async () => {
    expect((await failure(mockApi.transactions(main, { date: '14-08-2026' }))).status).toBe(400);
    expect((await failure(mockApi.transactions(main, { from: '2025-02-01', to: '2025-01-01' }))).status).toBe(400);
    expect((await failure(mockApi.transactions(main, { date: '2025-01-01', from: '2025-01-01' }))).status).toBe(400);
    expect((await failure(mockApi.transactions(main, { pageSize: 201 }))).status).toBe(400);
  });

  test('404 unsupported for an address outside the snapshot', async () => {
    expect(await failure(mockApi.transactions(ex.unsupported, { date: ex.flagged.date }))).toMatchObject({ status: 404, body: { status: 'unsupported' } });
  });
});

describe('transaction (E7)', () => {
  test('a flagged transaction: explanation ending with the limitation line, every method, the tuned flag line', async () => {
    const tx = await mockApi.transaction(ex.flagged.txid, ex.flagged.address);
    expect(tx).toMatchObject({ scored: true, flagged: true, source: 'snapshot', limitation: LIMITATION_LINE });
    expect(tx.explanation.endsWith(LIMITATION_LINE)).toBe(true);
    expect(Object.keys(tx.scores)).toEqual(METHODS.map((m) => m.id));
    expect(Object.keys(tx.flags)).toEqual(METHODS.map((m) => m.id));
    expect(tx.flags[tx.method.id]).toBe(true);
    expect(tx.method.flagAbsZ).toBe((await mockApi.config()).thresholds.flagAbsZ);
    expect(tx.features.some((f) => f.role === 'flag')).toBe(true);
    expect(tx.comparison.every((b) => b.txCount > 0 && b.description.length > 0)).toBe(true);
  });

  test('FR-03: amount and direction add up', async () => {
    const tx = await mockApi.transaction(ex.scored.txid, ex.scored.address);
    expect(tx.netSats).toBe(tx.receivedSats - tx.sentSats);
    expect(tx.direction).toBe(tx.netSats > 0 ? 'in' : tx.netSats < 0 ? 'out' : 'none');
    expect(tx.flagged).toBe(false);
  });

  test.each([
    ['an early transaction of a normal address', ex.earlyUnscored],
    ['a transaction of a short-history address', ex.notScored],
  ])('422 with the transaction facts for %s', async (_name, ref) => {
    const r = await failure(mockApi.transaction(ref.txid, ref.address));
    expect(r.status).toBe(422);
    if (r.body.status !== 'insufficient_history') throw new Error('wrong body');
    expect(r.body.transaction.txid).toBe(ref.txid);
    expect(r.body.history.required).toEqual({ minTx: 10, minSpanDays: 14 });
    expect(r.body.history.earlierTx).toBeLessThan(10);
  });

  test('404 not_found for a transaction that does not belong to the address', async () => {
    const r = await failure(mockApi.transaction('0'.repeat(64), ex.mainAddress));
    expect(r).toMatchObject({ status: 404, body: { status: 'not_found' } });
  });
});

test('a network failure surfaces as status 0', async () => {
  mockControls.offline = true;
  const r = await failure(mockApi.listAddresses());
  expect(r).toMatchObject({ status: 0, body: { status: 'network' } });
});

describe('service endpoints (E1 /api/health, E2 /api/config)', () => {
  test('E1 reports ready with what is loaded', async () => {
    const health = await mockApi.health();
    expect(health).toMatchObject({ status: 'ok', addressCount: 28, methodCount: 9, assistant: 'off', liveLookup: false });
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  test('E2 carries the snapshot, the limitation line, the tuned thresholds, the features and the web block', async () => {
    const config = await mockApi.config();
    expect(config.limitationLine).toBe(LIMITATION_LINE);
    expect(config.snapshot).toMatchObject({ source: 'Blockstream Esplora', dayTimeZone: 'UTC' });
    // D-W-10: the flag line is the tuned threshold saved with the model, not settings.json's 3.5.
    expect(config.thresholds).toEqual({ flagAbsZ: 5, contributingAbsZ: 2 });
    expect(config.history).toEqual({ minTx: 10, minSpanDays: 14 });
    expect(config.features.map((f) => [f.id, f.unit])).toEqual([['F1', 'BTC'], ['F2', 'count'], ['F3', 'hours'], ['F4', 'ratio']]);
    expect(config.web.requests.healthPollSeconds).toBeGreaterThan(0);
    expect(config.whatIf.defaultTime).toBe(`${config.snapshot.snapshotDate}T12:00:00Z`);
    expect(config.capabilities).toEqual({ assistant: false, liveLookup: false });
  });

  test('while the service is starting every endpoint answers 503 unavailable', async () => {
    mockControls.starting = true;
    for (const call of [mockApi.health(), mockApi.config(), mockApi.listAddresses()]) {
      expect(await failure(call)).toMatchObject({ status: 503, body: { status: 'unavailable' } });
    }
  });

  test('a request can be cancelled, before or after it starts', async () => {
    const early = new AbortController();
    early.abort();
    expect(await failure(mockApi.health({ signal: early.signal }))).toMatchObject({ status: 0, body: { status: 'cancelled' } });

    mockControls.latencyMs = 50;
    const late = new AbortController();
    const pending = failure(mockApi.listAddresses({ signal: late.signal }));
    late.abort();
    expect(await pending).toMatchObject({ status: 0, body: { status: 'cancelled' } });
  });
});
