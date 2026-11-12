// A minimal Chrome DevTools Protocol client over an installed Edge or Chrome (no extra packages), shared by
// screenshots.mjs and chart-timings.mjs.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

/** The browser to drive: BROWSER_PATH, or the first Edge or Chrome found in the usual places; undefined if none. */
export function findBrowser() {
  return [
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
}

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

/**
 * Starts the browser headless with a throwaway profile and opens one page. Returns `cdp` (the connection, with
 * `waitFor(event, sessionId)`), `sessionId`, `send(method, params)` for that page, and `close()`, which stops the
 * browser and removes the profile.
 */
export async function launchBrowser(browserPath, tag) {
  const profile = mkdtempSync(join(tmpdir(), `explorer-${tag}-`));
  const browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ]);
  const stop = async () => {
    browser.kill();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
    const cdp = await connect(`ws://127.0.0.1:${port}${path}`);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    return {
      cdp,
      sessionId,
      send: (method, params) => cdp.send(method, params, sessionId),
      close: async () => {
        cdp.close();
        await stop();
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}
