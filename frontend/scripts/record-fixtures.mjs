// Records the answers the mock and the tests use from a running back end, so the mock is a copy
// of the real service and not a second opinion about what it says.
//
//   (in backend/)   python -m uvicorn app.main:app --port 8000
//   (in frontend/)  npm run fixtures            (BASE_URL defaults to http://127.0.0.1:8000)
//
// It writes src/api/mock/fixtures/: E1, E2 and E3 whole; the 404 `unsupported` body of E4 for an
// address outside the snapshot; and, for the running example and for one short-history address,
// E5, every E6 page and a few E7 answers (the flagged ones, one scored but not flagged, and
// unscored ones, whose 422 bodies are what V3 shows for them). `examples.json` names the inputs that
// reach each state, for the tests and for scripts/screenshots.mjs. Bodies are saved exactly as
// the service sent them.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = (process.env.BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'api', 'mock', 'fixtures');

/** The running example of the plan: a normal address with three flagged transactions. */
const MAIN = '1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz';
/** The first address ever mined, valid and not in the snapshot. */
const UNSUPPORTED = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const PAGE_SIZE = 200;

async function call(path, init) {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, body: await res.json() };
}

async function ok(path) {
  const r = await call(path);
  if (r.status !== 200) throw new Error(`${path} answered ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

const save = (name, data) => writeFileSync(join(outDir, name), `${JSON.stringify(data)}\n`);
const dayOf = (row) => row.time.slice(0, 10);

/** E5, every page of E6 and the E7 answers for `txids` (a 200 or the 422 body, each with its status). */
async function recordAddress(address, pickTxids) {
  const q = encodeURIComponent(address);
  const timeline = await ok(`/api/addresses/${q}/timeline`);
  const transactionPages = [];
  for (let page = 1, seen = 0, total = Infinity; seen < total; page++) {
    const p = await ok(`/api/addresses/${q}/transactions?pageSize=${PAGE_SIZE}&page=${page}`);
    transactionPages.push(p);
    seen += p.transactions.length;
    total = p.total;
  }
  const rows = transactionPages.flatMap((p) => p.transactions);
  const details = {};
  for (const txid of pickTxids(rows)) details[txid] = await call(`/api/transactions/${txid}?address=${q}`);
  return { rows, record: { address, timeline, transactionPages, details } };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const health = await ok('/api/health');
  const config = await ok('/api/config');
  const addresses = await ok('/api/addresses');
  const short = addresses.addresses.find((a) => a.history === 'insufficient')?.address;
  if (!addresses.addresses.some((a) => a.address === MAIN) || !short) throw new Error('The snapshot lacks the running example or a short-history address.');

  const unsupported = await call('/api/lookup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: UNSUPPORTED }),
  });
  if (unsupported.status !== 404 || unsupported.body.status !== 'unsupported') throw new Error('Expected a 404 unsupported for the address outside the snapshot.');

  const main = await recordAddress(MAIN, (rows) => {
    const scored = rows.filter((r) => r.status !== 'not-scored');
    const unscored = rows.filter((r) => r.status === 'not-scored');
    const nearest = scored.filter((r) => r.status === 'not-flagged').sort((a, b) => b.score - a.score)[0];
    return [...scored.filter((r) => r.status === 'flagged'), nearest, unscored[0], unscored[unscored.length - 1]].map((r) => r.txid);
  });
  const shortRun = await recordAddress(short, (rows) => rows.map((r) => r.txid));

  const row = (rows, pick) => rows.filter((r) => pick(r)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const ref = (address, r) => ({ address, date: dayOf(r), txid: r.txid });
  const unscoredMain = main.rows.filter((r) => r.status === 'not-scored');
  const last = MAIN.slice(-1);
  const examples = {
    typo: MAIN.slice(0, -1) + (last === 'q' ? 'p' : 'q'),
    unsupported: UNSUPPORTED,
    mainAddress: MAIN,
    shortHistory: short,
    flagged: ref(MAIN, row(main.rows, (r) => r.status === 'flagged')),
    scored: ref(MAIN, row(main.rows, (r) => r.status === 'not-flagged' && r.txid in main.record.details)),
    earlyUnscored: ref(MAIN, unscoredMain[0]),
    notScored: ref(short, shortRun.rows[shortRun.rows.length - 1]),
  };

  save('health.json', health);
  save('config.json', config);
  save('addresses.json', addresses);
  save('unsupported.json', unsupported.body);
  save('address-main.json', main.record);
  save('address-short.json', shortRun.record);
  save('examples.json', examples);
  console.log(`Recorded ${MAIN} (${main.rows.length} rows, ${Object.keys(main.record.details).length} details) and ${short} (${shortRun.rows.length} rows) from ${base}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
