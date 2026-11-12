// Times from "the data has arrived" to "the chart is drawn" for G1, G2 and G5, in a headless Edge or Chrome that is
// already installed (the same approach as screenshots.mjs, whose DevTools client it shares). tools/measure.py --charts
// runs it and puts the medians in the report's table.
//
//   node scripts/chart-timings.mjs [front-end URL] [repeats] [address] [other address]
//
// The front end must serve the production build and reach the back end: `npm run build && npm run preview`, with
// EXPLORER_API set to the back end's URL when it is not on port 8000. The defaults are http://localhost:4173, 5, the
// running example and the largest address of the snapshot.
//
// For each chart it loads the page afresh, with the browser cache off so the Plotly chunk is fetched (first draw), and
// then loads other data into the same page (redraw: another address, for all three). The data
// time is the end of the last response of the chart's endpoint (a Resource Timing entry); the draw time is Plotly's
// own `plotly_afterplot` event. Prints one JSON object on stdout:
//   { G1: { firstDraw: [ms...], redraw: [ms...], sinceNavigation: [ms...] }, G2: ..., G5: ... }
// `sinceNavigation` is the time from the page's start to the first draw, Plotly's download included.

import { setTimeout as sleep } from 'node:timers/promises';
import { findBrowser, launchBrowser } from './cdp.mjs';

const base = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
const repeats = Number(process.argv[3] ?? 5);
const main = process.argv[4] ?? '1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz';
const other = process.argv[5] ?? '36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L';

const charts = {
  G1: { endpoint: '/timeline', first: `#/address/${main}`, next: `#/address/${other}` },
  G2: { endpoint: '/transactions', first: `#/address/${main}/transactions`, next: `#/address/${other}/transactions` },
  G5: { endpoint: '/what-if/curve', first: `#/address/${main}/what-if?direction=out`, next: `#/address/${other}/what-if?direction=out` },
};

// Runs in the page before its own scripts: notes the time of every Plotly draw (Plotly sends the event on the chart's element).
const recordDraws = `(() => {
  window.__draws = [];
  const hook = (el) => {
    if (el.__hooked || typeof el.on !== 'function') return;
    el.__hooked = true;
    el.on('plotly_afterplot', () => window.__draws.push(performance.now()));
  };
  new MutationObserver(() => document.querySelectorAll('.js-plotly-plot').forEach(hook))
    .observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})()`;

// Waits for a draw after the last response of `endpoint` received at or after `since`; returns the milliseconds
// between them, and when the draw happened.
const measure = (endpoint, since) => `(async () => {
  for (let i = 0; i < 150; i++) {
    const ends = performance.getEntriesByType('resource').filter((e) => e.name.includes('/api/') && e.name.includes(${JSON.stringify(endpoint)}) && e.responseEnd >= ${since}).map((e) => e.responseEnd);
    const dataAt = Math.max(...ends);
    const drawnAt = window.__draws.find((t) => t >= dataAt);
    if (ends.length && drawnAt !== undefined) return JSON.stringify({ ms: drawnAt - dataAt, drawnAt });
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('no draw after the data for ' + ${JSON.stringify(endpoint)});
})()`;

const browserPath = findBrowser();
if (!browserPath) {
  console.error('No Edge or Chrome found. Set BROWSER_PATH to a Chromium-based browser.');
  process.exit(1);
}

const { cdp, sessionId, send, close } = await launchBrowser(browserPath, 'charts');
const run = async (expression) => {
  const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
  return JSON.parse(result.value);
};
const results = {};
try {
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: recordDraws });
  for (const [name, { endpoint, first, next }] of Object.entries(charts)) {
    results[name] = { firstDraw: [], redraw: [], sinceNavigation: [] };
    for (let i = 0; i < repeats; i++) {
      // A page load now and then never draws (the cause is not found; it showed once in about forty runs): that run
      // is repeated, up to three times, instead of ending the whole measurement.
      for (let attempt = 1; ; attempt++) {
        try {
          await send('Page.navigate', { url: 'about:blank' });
          const loaded = cdp.waitFor('Page.loadEventFired', sessionId);
          await send('Page.navigate', { url: `${base}/?theme=light${first}` });
          await loaded;
          const drawn = await run(measure(endpoint, 0));
          await sleep(1000);
          const now = await run('JSON.stringify(performance.now())');
          await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(next)}` });
          const redrawn = await run(measure(endpoint, now));
          results[name].firstDraw.push(drawn.ms);
          results[name].sinceNavigation.push(drawn.drawnAt);
          results[name].redraw.push(redrawn.ms);
          break;
        } catch (error) {
          if (attempt === 3) throw error;
          console.error(`${name} run ${i + 1}, attempt ${attempt}: ${error.message}`);
        }
      }
    }
  }
} finally {
  await close();
}
console.log(JSON.stringify(results));
