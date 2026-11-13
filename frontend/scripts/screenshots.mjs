// Screenshots of every screen and state at desktop, tablet and mobile widths, using a
// headless Edge or Chrome that is already installed (no extra packages). It drives the
// browser over the DevTools protocol so phone and tablet widths are emulated properly, and
// it fails if any page scrolls sideways (the responsive check from the test plan).
//
// Against the real back end (the default; the inputs are the ones recorded in examples.json, which
// the running service answers the same way):
//   (backend/)   python -m uvicorn app.main:app --port 8000
//   (frontend/)  npm run dev                  (or npm run build && npm run preview)
//   (frontend/)  npm run screenshots          (writes ../docs/screenshots/)
// On the mock, which can also show the states the real service cannot be asked to produce (loading, still
// working, timeout, network failure, starting, busy):
//   VITE_API_MODE=mock npm run dev   and   MOCK=1 ONLY='^(04|11|4[0-4])' npm run screenshots
// (The offline banner, shot 39, needs no mock: the browser itself is told to go offline.)
//
// Options: BASE_URL (default http://localhost:5173), BROWSER_PATH, ONLY=<regex of names>,
// MOCK=1 (also take the mock-only shots), LIVE=1 (also take the live-lookup shots, S-09: they need the back end started with
// EXPLORER_LIVE_LOOKUP=on, and fetch LIVE_ADDRESS for real, two lookups of the hour's six) and an output folder as the first argument.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(readFileSync(join(here, '..', 'src', 'api', 'mock', 'fixtures', 'examples.json'), 'utf8'));
const mock = process.env.MOCK === '1';
const base = (process.env.BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
const outDir = resolve(process.argv[2] ?? join(here, '..', '..', 'docs', 'screenshots'));
const live = process.env.LIVE === '1';
const LIVE_ADDRESS = process.env.LIVE_ADDRESS ?? 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;

const browserPath = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]
  .filter(Boolean)
  .find((p) => existsSync(p));
if (!browserPath) {
  console.error('No Edge or Chrome found. Set BROWSER_PATH to a Chromium-based browser.');
  process.exit(1);
}

const tl = (a) => `#/address/${a}`;
const txs = (a, search = '') => `#/address/${a}/transactions${search ? `?${search}` : ''}`;
const day = (r) => `#/address/${r.address}/day/${r.date}`;
const tx = (r) => `${day(r)}/tx/${r.txid}`;
const lab = (a, direction = '') => `#/address/${a}/what-if${direction ? `?direction=${direction}` : ''}`;
const q = (s) => `#/?q=${encodeURIComponent(s)}`;

// Types into the what-if lab's amount field the way a person does (React listens for the input event,
// which a plain assignment to .value does not send).
const typeAmount = (amount) => `(() => {
  const input = document.querySelector('input[inputmode="decimal"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(amount)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
})()`;
// Drives the page the way a person does: the helpers wait for an element, fill a field (React listens for the input
// event) and press a button, so the same steps work on the real service and on the mock.
const drive = (steps) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (find, tries = 80) => { for (let i = 0; i < tries; i++) { const el = find(); if (el) return el; await wait(100); } throw new Error('not found: ' + find); };
  const button = (name) => until(() => [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent).trim().startsWith(name)));
  const fill = async (label, value) => {
    const field = await until(() => document.querySelector('[role="dialog"]')?.querySelector('label[for]') && [...document.querySelectorAll('[role="dialog"] label')].find((l) => l.textContent === label)?.control);
    const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };
  ${steps}
})()`;
// The service keeps the watchlist, so each shot that fills it starts from an empty one (the mock starts empty by itself).
async function emptyWatchlist() {
  try {
    const { entries } = await (await fetch(`${base}/api/watchlist`)).json();
    for (const { address } of entries) await fetch(`${base}/api/watchlist/${address}`, { method: 'DELETE' });
  } catch {
    // No service to ask: nothing to empty.
  }
}
// Watches two addresses from V1 (so V6 has entries), then opens V6.
const watchTwoSteps = `
  for (const [address, label, note] of [[${JSON.stringify(t.shortHistory)}, 'Short history', 'Too few transactions to score yet.'], [${JSON.stringify(t.mainAddress)}, 'Running example', 'Three unusual transactions, worth a look.']]) {
    (await button('Add ' + address)).click();
    await fill('Label', label);
    await fill('Note', note);
    (await button('Add to the watchlist')).click();
    await until(() => !document.querySelector('[role="dialog"]'));
  }
  location.hash = '#/watchlist';
  await until(() => document.querySelector('.watch-list'));
  for (const dismiss of [...document.querySelectorAll('.toast-button[aria-label]')]) dismiss.click();
`;
const watchTwo = drive(watchTwoSteps);
// The same, then removes the newest entry, so the shot shows the toast with Undo.
const watchRemoved = drive(`${watchTwoSteps}
  (await button('Remove')).click();
  await until(() => [...document.querySelectorAll('.toast-button')].find((b) => b.textContent === 'Undo'));
`);
// Opens the star's dialog on V1 with a label and a note typed in.
const watchDialog = drive(`
  (await button('Add ${t.mainAddress}')).click();
  await fill('Label', 'Running example');
  await fill('Note', 'Three unusual transactions, worth a look.');
`);
// Opens the replay on V2 at 20 a second and lets it run; the shot is taken part of the way through.
const replay20 = drive(`
  (await button('Open the replay')).click();
  (await button('20 a second')).click();
  (await button('Play')).click();
`);
// S-09: the live lookup. A shot starts from an address that has not been fetched (the service forgets it first), or waits until
// the lookup that an earlier shot started has finished.
async function forgetFetched() {
  await fetch(`${base}/api/addresses/${LIVE_ADDRESS}`, { method: 'DELETE' }).catch(() => {});
}
async function waitFetched() {
  for (let i = 0; i < 300; i++) {
    const answer = await fetch(`${base}/api/lookup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: LIVE_ADDRESS }) }).catch(() => null);
    if (answer?.status === 200) return;
    await sleep(500);
  }
  throw new Error('the live lookup did not finish');
}
const fetchPublicHistory = drive(`(await button("Fetch this address's public history")).click();`);
const DESKTOP = 1280;
const TABLET = 820;
const MOBILE = 390;

// [file name, extra query, hash route, width, full page?, mock only?, what to do once the page has loaded, seconds to wait after that]
// "what to do" is a script for the page, or a function of the DevTools connection.
const goOffline = (send) => send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
const shots = [
  ['01-select', '', '#/', DESKTOP, true],
  ['02-invalid', '', q(t.typo), DESKTOP, false],
  ['03-unsupported', '', q(t.unsupported), DESKTOP, false],
  ['04-loading', 'latency=600000', tl(t.mainAddress), DESKTOP, false, true],
  ['05-timeline', '', tl(t.mainAddress), DESKTOP, true],
  ['06-insufficient-address', '', tl(t.shortHistory), DESKTOP, true],
  ['07-day-nothing-selected', '', day(t.flagged), DESKTOP, false],
  ['08-flagged-detail', '', tx(t.flagged), DESKTOP, true],
  ['09-not-scored-detail', '', tx(t.notScored), DESKTOP, true],
  ['10-early-transaction-not-scored', '', tx(t.earlyUnscored), DESKTOP, true],
  ['11-network-failure', 'offline=1', tl(t.mainAddress), DESKTOP, false, true],
  ['12-timeline-tablet', '', tl(t.mainAddress), TABLET, true],
  ['13-flagged-detail-tablet', '', tx(t.flagged), TABLET, true],
  ['14-select-mobile', '', '#/', MOBILE, true],
  ['15-timeline-mobile', '', tl(t.mainAddress), MOBILE, true],
  ['16-flagged-detail-mobile', '', tx(t.flagged), MOBILE, true],
  ['17-flagged-detail-dark', 'theme=dark', tx(t.flagged), DESKTOP, true],
  ['18-select-tablet', '', '#/', TABLET, true],
  ['19-select-desktop-dark', 'theme=dark', '#/', DESKTOP, true],
  ['20-transactions', '', txs(t.mainAddress), DESKTOP, true],
  ['21-transactions-sent-unusual', '', txs(t.mainAddress, 'status=flagged&direction=out'), DESKTOP, true],
  ['22-transactions-invalid-dates', '', txs(t.mainAddress, 'from=2025-06-01&to=2025-01-01'), DESKTOP, false],
  ['23-transactions-tablet', '', txs(t.mainAddress), TABLET, true],
  ['24-transactions-mobile', '', txs(t.mainAddress), MOBILE, false],
  ['24b-transactions-mobile-full-page', '', txs(t.mainAddress, 'status=flagged'), MOBILE, true],
  ['25-transactions-short-history', '', txs(t.shortHistory), DESKTOP, true],
  ['26-transactions-dark', 'theme=dark', txs(t.mainAddress, 'status=flagged'), DESKTOP, true],
  ['27-about', '', '#/about', DESKTOP, true],
  ['28-about-mobile', '', '#/about', MOBILE, true],
  ['29-what-if-empty', '', lab(t.mainAddress), DESKTOP, false],
  ['30-what-if-flagged', '', lab(t.mainAddress, t.whatIf.direction), DESKTOP, true, false, typeAmount(t.whatIf.amountBtc)],
  ['31-what-if-not-flagged', '', lab(t.mainAddress, t.whatIf.direction), DESKTOP, true, false, typeAmount('0.0005')],
  ['32-what-if-tablet', '', lab(t.mainAddress, t.whatIf.direction), TABLET, true, false, typeAmount(t.whatIf.amountBtc)],
  ['33-what-if-mobile', '', lab(t.mainAddress, t.whatIf.direction), MOBILE, true, false, typeAmount(t.whatIf.amountBtc)],
  ['34-what-if-invalid-amount', '', lab(t.mainAddress), DESKTOP, false, false, typeAmount('0.123456789')],
  ['35-what-if-dark', 'theme=dark', lab(t.mainAddress, t.whatIf.direction), DESKTOP, true, false, typeAmount(t.whatIf.amountBtc)],
  ['36-models', '', '#/models', DESKTOP, true],
  ['37-models-tablet', '', '#/models', TABLET, true],
  ['38-models-mobile', '', '#/models', MOBILE, true],
  ['39-offline-banner', '', tl(t.mainAddress), DESKTOP, false, false, goOffline],
  ['40-service-starting', 'starting=1', tl(t.mainAddress), DESKTOP, false, true],
  ['41-busy-countdown', 'busy=30', tl(t.mainAddress), DESKTOP, false, true],
  ['42-timeout', 'latency=11000', tl(t.mainAddress), DESKTOP, false, true, null, 10.5],
  ['43-still-working', 'latency=600000', tl(t.mainAddress), DESKTOP, false, true, null, 5],
  ['44-offline-banner-mobile', '', tl(t.mainAddress), MOBILE, false, false, goOffline],
  ['45-about-tablet', '', '#/about', TABLET, true],
  ['46-timeline-mobile-dark', 'theme=dark', tl(t.mainAddress), MOBILE, true],
  ['47-what-if-tablet-dark', 'theme=dark', lab(t.mainAddress, t.whatIf.direction), TABLET, true, false, typeAmount(t.whatIf.amountBtc)],
  ['48-timeline-other-method', '', `${tl(t.mainAddress)}?method=regression`, DESKTOP, true],
  ['49-watchlist', '', '#/', DESKTOP, true, false, watchTwo],
  ['50-watchlist-mobile', '', '#/', MOBILE, true, false, watchTwo],
  ['51-watch-dialog', '', '#/', DESKTOP, false, false, watchDialog],
  ['52-watch-dialog-mobile', '', '#/', MOBILE, false, false, watchDialog],
  ['53-model-verdicts', '', tx(t.flagged), DESKTOP, true],
  ['54-model-verdicts-mobile', '', tx(t.flagged), MOBILE, true],
  ['55-replay', '', tl(t.mainAddress), DESKTOP, true, false, replay20, 3],
  ['56-replay-mobile', '', tl(t.mainAddress), MOBILE, true, false, replay20, 3],
  ['57-watchlist-undo', '', '#/', DESKTOP, false, false, watchRemoved],
];

// ---------------------------------------------------------------- minimal DevTools client

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: ok, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else ok(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: ok, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  const waitFor = (method, sessionId, timeoutMs = 15000) =>
    new Promise((ok, reject) => {
      const timer = setTimeout(() => {
        listeners.delete(l);
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      const l = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          clearTimeout(timer);
          listeners.delete(l);
          ok(msg.params);
        }
      };
      listeners.add(l);
    });
  return new Promise((ok, reject) => {
    ws.addEventListener('open', () => ok({ send, waitFor, close: () => ws.close() }));
    ws.addEventListener('error', reject);
  });
}

const liveShots = [
  ['live-01-offer-1280', '', q(LIVE_ADDRESS), DESKTOP, false, false, null, 0, forgetFetched],
  ['live-02-dialog-1280', '', q(LIVE_ADDRESS), DESKTOP, false, false, fetchPublicHistory, 2.5, forgetFetched],
  ['live-03-overview-1280', '', tl(LIVE_ADDRESS), DESKTOP, true, false, null, 0, waitFetched],
  ['live-01-offer-390', '', q(LIVE_ADDRESS), MOBILE, false, false, null, 0, forgetFetched],
  ['live-02-dialog-390', '', q(LIVE_ADDRESS), MOBILE, false, false, fetchPublicHistory, 2.5, forgetFetched],
  ['live-03-overview-390', '', tl(LIVE_ADDRESS), MOBILE, true, false, null, 0, waitFetched],
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'explorer-shots-'));
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ]);
  const problems = [];
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
    const cdp = await connect(`ws://127.0.0.1:${port}${path}`);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    await send('Page.enable');
    await send('Network.enable');

    for (const [name, extra, hash, width, fullPage, mockOnly, after, settle = 0, prepare] of live ? [...shots, ...liveShots] : shots) {
      if ((only && !only.test(name)) || (mockOnly && !mock)) continue;
      await prepare?.();
      const params = new URLSearchParams(extra);
      if (after === watchTwo || after === watchDialog || after === watchRemoved) await emptyWatchlist();
      if (mock && !params.has('latency')) params.set('latency', '0');
      if (!params.has('theme')) params.set('theme', 'light'); // don't depend on the machine's theme
      const url = `${base}/?${params}${hash}`;
      const mobile = width < 700;
      const viewHeight = mobile ? 844 : width < 1000 ? 1180 : 900;
      await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await send('Emulation.setDeviceMetricsOverride', { width, height: viewHeight, deviceScaleFactor: 1, mobile });
      await send('Page.navigate', { url: 'about:blank' });
      const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
      await send('Page.navigate', { url });
      await loaded;
      await sleep(900); // let requests settle and charts measure themselves
      if (after) {
        if (typeof after === 'function') await after(send);
        else await send('Runtime.evaluate', { expression: after, awaitPromise: true });
        await sleep(1200); // the lab waits for the typing to stop, asks, and draws
      }
      await sleep(settle * 1000);

      const { result } = await send('Runtime.evaluate', {
        expression: 'JSON.stringify({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: window.innerWidth })',
        returnByValue: true,
      });
      const size = JSON.parse(result.value);
      if (size.w > size.vw) problems.push(`${name}: page is ${size.w}px wide at a ${size.vw}px viewport (sideways scroll)`);

      const height = fullPage ? Math.max(viewHeight, size.h) : viewHeight;
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await sleep(200);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, `${name}.png`), Buffer.from(shot.data, 'base64'));
      console.log(`${name}.png  ${width}x${height}`);
    }
    cdp.close();
  } finally {
    browser.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  if (problems.length) {
    console.error(`\nResponsive check failed:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  console.log('\nResponsive check passed: no page scrolls sideways at any width.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
