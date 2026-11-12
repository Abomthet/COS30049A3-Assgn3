// Records the answers the mock and the tests use from a running back end, so the mock is a copy
// of the real service and not a second opinion about what it says.
//
//   (in backend/)   python -m uvicorn app.main:app --port 8000
//   (in frontend/)  npm run fixtures            (BASE_URL defaults to http://127.0.0.1:8000)
//
// It writes src/api/mock/fixtures/: E1, E2 and E3 whole; the 404 `unsupported` body of E4 for an
// address outside the snapshot; and, for the running example and for one short-history address,
// E5, every E6 page and a few E7 answers (the flagged ones, one scored but not flagged, and
// unscored ones, whose 422 bodies are what V3 shows for them). For the running example it also records
// E8 and E9 for a few what-ifs (whatif-main.json: the mock answers exactly these requests), one E10
// export of the flagged transactions as CSV and as JSON (export-main.json), E11 (methods.json) and E12 (explanations-main.json:
// the prepared answers of the flagged transactions, and the template for a transaction and for two what-ifs).
// For the running example it also records what two other deciding methods say (methods-main.json): the
// whole of E5 and E6 and a few E7 answers under Regression residual (many flags) and under TxGPT surprisal
// (a language model, which cannot score a new amount); the mock answers exactly these.
// `examples.json` names the inputs that reach each state, for the tests and for scripts/screenshots.mjs.
// Bodies are saved exactly as the service sent them.

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
/** The running example's what-if (J4): 0.05 BTC sent, which is flagged with score 5.98. */
const WHAT_IF = { amountBtc: '0.05', direction: 'out', time: '2026-10-20T12:00:00Z' };
/** A time with too little history before it for E8 to score, and one at which the address has sent nothing yet (E9 cannot centre its curve on a usual amount). */
const TOO_EARLY = '2024-06-01T00:00:00Z';
const NO_SENT_YET = '2024-07-11T12:00:00Z';

async function call(path, init) {
  const res = await fetch(`${base}${path}`, init);
  return { status: res.status, body: await res.json() };
}

async function post(path, body) {
  return { request: body, ...(await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })) };
}

async function ok(path) {
  const r = await call(path);
  if (r.status !== 200) throw new Error(`${path} answered ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body;
}

const save = (name, data) => writeFileSync(join(outDir, name), `${JSON.stringify(data)}\n`);
const dayOf = (row) => row.time.slice(0, 10);

/** The deciding methods recorded for the running example besides the default. */
const OTHER_METHODS = ['regression', 'txgpt_method'];

/** E5, every page of E6 and the E7 answers for `txids` (a 200 or the 422 body, each with its status), all under `method` (the default when it is empty). */
async function recordAddress(address, pickTxids, method = '') {
  const q = encodeURIComponent(address);
  const m = method ? `method=${method}` : '';
  const timeline = await ok(`/api/addresses/${q}/timeline${m ? `?${m}` : ''}`);
  const transactionPages = [];
  for (let page = 1, seen = 0, total = Infinity; seen < total; page++) {
    const p = await ok(`/api/addresses/${q}/transactions?pageSize=${PAGE_SIZE}&page=${page}${m ? `&${m}` : ''}`);
    transactionPages.push(p);
    seen += p.transactions.length;
    total = p.total;
  }
  const rows = transactionPages.flatMap((p) => p.transactions);
  const details = {};
  for (const txid of pickTxids(rows)) details[txid] = await call(`/api/transactions/${txid}?address=${q}${m ? `&${m}` : ''}`);
  return { rows, record: { address, timeline, transactionPages, details } };
}

/** Every request the mock will answer for the running example's what-if lab, each with the status and body the service gave. */
async function recordWhatIf(config) {
  const url = `/api/addresses/${encodeURIComponent(MAIN)}/what-if`;
  const atDefault = config.whatIf.defaultTime;
  const lab = (amountBtc, direction, time) => ({ amountBtc, direction, time });
  const requests = [
    [lab('0.00001', 'out', atDefault), 200],
    [lab('0.0005', 'out', atDefault), 200],
    [lab('0.05', 'out', atDefault), 200],
    [lab('0.5', 'out', atDefault), 200],
    [lab('0.0005', 'in', atDefault), 200],
    [WHAT_IF, 200],
    [lab('0.05', 'out', TOO_EARLY), 422],
    [lab('0.001', 'out', NO_SENT_YET), 200],
  ];
  const results = [];
  for (const [body, expected] of requests) {
    const r = await post(url, body);
    if (r.status !== expected) throw new Error(`E8 for ${JSON.stringify(body)} answered ${r.status}`);
    results.push(r);
  }
  if (!results[5].body.flagged || results[5].body.score.toFixed(2) !== '5.98') throw new Error('The running example what-if is no longer flagged at 5.98.');

  const curves = [];
  for (const body of [
    { direction: 'out', time: atDefault },
    { direction: 'in', time: atDefault },
    { direction: 'out', time: WHAT_IF.time },
    { direction: 'out', time: NO_SENT_YET },
    { direction: 'out', time: NO_SENT_YET, minBtc: 0.00001, maxBtc: 1, points: 41 },
  ]) {
    curves.push(await post(`${url}/curve`, body));
  }
  if (curves[3].status !== 400) throw new Error('Expected a 400 on direction from the default curve of a direction with no history.');
  return { address: MAIN, results, curves };
}

/**
 * E12 for the running example: each flagged transaction (the back end serves the Assistant's prepared answer, `source` text150m),
 * the scored transaction that is not flagged and two what-ifs (the template, or the Assistant's answer where its weights are installed).
 * Record it from a back end whose Assistant is not installed, so the template answers carry the reason in `skippedWriters`.
 */
async function recordExplanations(rows, whatIf) {
  const url = '/api/explanations';
  const flagged = rows.filter((r) => r.status === 'flagged').map((r) => ({ address: MAIN, txid: r.txid }));
  const nearest = rows.filter((r) => r.status === 'not-flagged').sort((a, b) => b.score - a.score)[0];
  const lab = (index) => ({ address: MAIN, whatIf: whatIf.results[index].request });
  const results = [];
  for (const body of [...flagged, { address: MAIN, txid: nearest.txid }, lab(5), lab(1)]) results.push(await post(url, body));
  if (results.some((r) => r.status !== 200)) throw new Error('E12 did not answer 200 to every recorded request.');
  if (!results.slice(0, flagged.length).every((r) => r.body.source === 'text150m')) throw new Error('A flagged transaction of the running example has no prepared answer.');
  return { address: MAIN, results };
}

/** E10 for the flagged transactions of the running example, in both formats, with the names the service gave them. */
async function recordExport() {
  const file = async (format) => {
    const res = await fetch(`${base}/api/addresses/${encodeURIComponent(MAIN)}/export?status=flagged&format=${format}`);
    if (res.status !== 200) throw new Error(`The ${format} export answered ${res.status}`);
    return { filename: /filename="([^"]+)"/.exec(res.headers.get('content-disposition'))[1], text: await res.text() };
  };
  return { address: MAIN, query: { status: ['flagged'] }, csv: await file('csv'), json: await file('json') };
}

/** What each other method says about the running example: the transactions it flags most strongly, and the ones the default method flags. */
async function recordMethods(baseRows) {
  const runs = {};
  for (const method of OTHER_METHODS) {
    const pick = (rows) => [...new Set([...rows.filter((r) => r.status === 'flagged').sort((a, b) => b.score - a.score).slice(0, 3), ...baseRows.filter((r) => r.status === 'flagged')].map((r) => r.txid))];
    const run = await recordAddress(MAIN, pick, method);
    runs[method] = { timeline: run.record.timeline, transactionPages: run.record.transactionPages, details: run.record.details };
  }
  return { address: MAIN, runs };
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
  const methods = await ok('/api/methods');
  const otherMethods = await recordMethods(main.rows);
  const whatIf = await recordWhatIf(config);
  const exported = await recordExport();
  const explanations = await recordExplanations(main.rows, whatIf);
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
    whatIf: { address: MAIN, ...WHAT_IF, tooEarlyTime: TOO_EARLY, noSentYetTime: NO_SENT_YET },
  };

  save('health.json', health);
  save('config.json', config);
  save('addresses.json', addresses);
  save('unsupported.json', unsupported.body);
  save('address-main.json', main.record);
  save('address-short.json', shortRun.record);
  save('methods.json', methods);
  save('methods-main.json', otherMethods);
  save('whatif-main.json', whatIf);
  save('export-main.json', exported);
  save('explanations-main.json', explanations);
  save('examples.json', examples);
  console.log(`Recorded ${MAIN} (${main.rows.length} rows, ${Object.keys(main.record.details).length} details) and ${short} (${shortRun.rows.length} rows) from ${base}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
