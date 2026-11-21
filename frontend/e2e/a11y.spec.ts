// Automated accessibility checks (T40's automatable part, wrap-up 2.1 and 2.2).
//
//   npm run e2e:a11y     this file only, Chromium at 390, 820 and 1280 pixels. axe-core runs inside the page and does not
//                        depend on the rendering engine, so one engine is enough; Firefox and WebKit still run this file
//                        under `npm run e2e` (all nine projects), which is slower but harmless.
//   `npm run e2e` and `npm run e2e:quick` run it too (it is an ordinary spec in e2e/): CI's browser job therefore covers it.
//
// Part A scans every view with axe (WCAG 2.0 and 2.1, levels A and AA), in the light and the dark theme.
// Policy: a violation of impact "serious" or "critical" fails the test; "moderate" and "minor" are recorded only (they
// are attached to the test and appended to test-results/a11y-report.jsonl, and summarised in
// docs/usability/a11y-automated-findings.md). A scan that fails today for a known reason is listed in KNOWN with its
// finding ID and marked test.fail(): the suite stays green now, and goes red ("expected to fail but passed") the day a
// fix lands, which is the cue to delete the entry. Nothing is excluded from the scans.
// Part B is the keyboard pass (Chromium and Firefox only: WebKit's Tab skips links by default), part C the reduced-motion, 200% zoom and live-region checks.

import { appendFileSync, mkdirSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { chartTools, drawnChart, examples, expect, test } from './fixtures';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const THEMES = ['light', 'dark'] as const;
type Theme = (typeof THEMES)[number];

/** Scans whose result is a known finding: key is "<scan name>|<theme>" (a trailing "|<width>" narrows it to one width). */
const KNOWN: Record<string, string> = {};
// A-01 (address links) and A-02 (table scroll boxes) were found on 21 Nov 2026 and fixed the same day, so their entries are gone: those scans must pass outright.
// See docs/usability/a11y-automated-findings.md. A scan that fails for a new known reason goes here as KNOWN['<scan name>|<theme>'] = '<finding ID>'.

interface Hit {
  id: string;
  impact: string | null | undefined;
  nodes: string[];
  help: string;
}

async function scan(page: Page, name: string, theme: Theme): Promise<void> {
  const info = test.info();
  const width = page.viewportSize()?.width ?? 0;
  const run = async (): Promise<Hit[]> => {
    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(' ')) }));
  };
  let hits = await run();
  // A loading line fades and spins in; a scan taken in the middle of that reports the contrast of a half-faded line
  // (seen once on V4's empty lab). A result that names only such a line is taken again, up to three times.
  for (let again = 0; again < 3 && hits.some((h) => h.nodes.some((n) => n.includes('.loading'))) && hits.every((h) => h.nodes.every((n) => n.includes('.loading'))); again++) {
    await page.waitForTimeout(1500);
    hits = await run();
  }
  mkdirSync('test-results', { recursive: true });
  appendFileSync('test-results/a11y-report.jsonl', JSON.stringify({ name, theme, width, hits }) + '\n');
  await info.attach('axe-violations.json', { body: JSON.stringify(hits, null, 2), contentType: 'application/json' });
  const blocking = hits.filter((h) => h.impact === 'serious' || h.impact === 'critical');
  const summary = blocking.map((h) => `${h.id} (${h.impact}): ${h.nodes.slice(0, 3).join(' | ')}`);
  expect(summary, `serious or critical axe violations on ${name} (${theme}, ${width}px)`).toEqual([]);
}

async function setTheme(page: Page, theme: Theme, hash: string): Promise<void> {
  // The page URL's query (before the #) picks the theme, as the screenshot script does (src/main.tsx).
  await page.goto(`/?theme=${theme}${hash}`);
}

interface View {
  name: string;
  hash: string;
  ready: (page: Page) => Promise<void>;
  /** Runs before the page opens. */
  before?: (page: Page) => Promise<void>;
  /** Further steps after the page is ready (typing, opening a menu). */
  after?: (page: Page) => Promise<void>;
  allow404?: boolean;
}

const addr = examples.mainAddress;

/** An address no other test uses, one per (project width, purpose): the watchlist is kept by the service, so tests that add
 * entries must not meet in the same row. `purpose` 0 and 1 are V6's two themes, 2 the live-region test, 3 the reduced-motion test. */
async function spareAddress(page: Page, purpose: number): Promise<string> {
  const { addresses } = (await (await page.request.get('/api/addresses')).json()) as { addresses: Array<{ address: string }> };
  const used = new Set([examples.mainAddress, examples.shortHistory, examples.flagged.address, examples.scored.address, examples.earlyUnscored.address, examples.notScored.address, examples.whatIf.address]);
  const spare = addresses.map((a) => a.address).filter((a) => !used.has(a));
  const slot = [390, 820, 1280].indexOf(page.viewportSize()?.width ?? 0) * 4 + purpose;
  return spare[slot % spare.length];
}
const settled = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
};
const typeAmount = async (page: Page) => {
  await page.getByRole('radio', { name: 'Sent' }).check();
  await page.getByLabel('Amount (BTC)').fill(examples.whatIf.amountBtc);
  await expect(page.getByTestId('verdict-card').getByRole('heading', { name: /^Flagged by / })).toBeVisible();
  await drawnChart(page, 'How the score changes with the amount');
};

const VIEWS: View[] = [
  { name: 'V1 list', hash: '#/', ready: async (p) => void (await expect(p.getByRole('table', { name: /Addresses in the snapshot/ }).getByRole('row').nth(1)).toBeVisible()) },
  {
    name: 'V1 typo error',
    hash: '#/',
    ready: async (p) => void (await expect(p.getByRole('table', { name: /Addresses in the snapshot/ })).toBeVisible()),
    after: async (p) => {
      await p.getByLabel('Bitcoin address').fill(examples.typo);
      await p.getByRole('button', { name: 'Look up' }).click();
      await expect(p.getByRole('alert').filter({ hasText: /\w{5}/ })).toBeVisible();
    },
  },
  {
    name: 'V1 unsupported address',
    hash: '#/',
    allow404: true,
    ready: async (p) => void (await expect(p.getByRole('table', { name: /Addresses in the snapshot/ })).toBeVisible()),
    after: async (p) => {
      await p.getByLabel('Bitcoin address').fill(examples.unsupported);
      await p.getByRole('button', { name: 'Look up' }).click();
      await expect(p.getByTestId('state-unsupported')).toBeVisible();
    },
  },
  { name: 'V2 overview', hash: `#/address/${addr}`, ready: async (p) => void (await drawnChart(p, 'Transactions per day')) },
  { name: 'V2 transactions tab', hash: `#/address/${addr}/transactions`, ready: async (p) => void (await drawnChart(p, 'Transactions over time')) },
  { name: 'V3 day', hash: `#/address/${addr}/day/${examples.flagged.date}`, ready: settled },
  {
    name: 'V3 flagged transaction',
    hash: `#/address/${addr}/day/${examples.flagged.date}/tx/${examples.flagged.txid}`,
    ready: async (p) => void (await drawnChart(p, 'How this transaction compares with usual')),
  },
  {
    name: 'V4 what-if empty',
    hash: `#/address/${addr}/what-if`,
    // The lab draws its curve chart even with no amount typed; scanning before it is drawn finds only its loading line.
    ready: async (p) => {
      await expect(p.getByTestId('state-whatif-empty')).toBeVisible();
      await drawnChart(p, 'How the score changes with the amount');
    },
  },
  {
    name: 'V4 what-if flagged, one kept scenario',
    hash: `#/address/${addr}/what-if`,
    ready: async (p) => void (await expect(p.getByTestId('state-whatif-empty')).toBeVisible()),
    after: async (p) => {
      await typeAmount(p);
      await p.getByRole('button', { name: 'Keep this scenario' }).click();
      await expect(p.getByRole('table', { name: /Kept what-if scenarios/ })).toBeVisible();
    },
  },
  { name: 'V5 models', hash: '#/models', ready: settled },
  { name: 'V7 about', hash: '#/about', ready: settled },
  {
    name: 'short-history notice',
    hash: `#/address/${examples.shortHistory}`,
    ready: async (p) => void (await expect(p.getByTestId('state-insufficient')).toBeVisible()),
  },
  {
    name: 'watch dialog open',
    hash: '#/',
    before: async (p) => void (await p.request.delete(`/api/watchlist/${addr}`)), // so the star offers "Add", whatever an interrupted run left
    ready: async (p) => void (await expect(p.getByRole('table', { name: /Addresses in the snapshot/ })).toBeVisible()),
    after: async (p) => {
      await p.getByRole('button', { name: `Add ${addr} to the watchlist` }).click();
      await expect(p.getByRole('dialog')).toBeVisible();
    },
  },
  {
    name: 'chart as table',
    hash: `#/address/${addr}`,
    ready: async (p) => void (await drawnChart(p, 'Transactions per day')),
    after: async (p) => {
      const chart = await chartTools(await drawnChart(p, 'Transactions per day'));
      await chart.getByRole('button', { name: 'View as table' }).click();
      await expect(chart.getByRole('table')).toBeVisible();
    },
  },
  {
    name: 'export menu open',
    hash: `#/address/${addr}/transactions`,
    ready: async (p) => void (await drawnChart(p, 'Transactions over time')),
    after: async (p) => {
      await p.getByRole('button', { name: 'Export', exact: true }).click();
      await expect(p.getByRole('button', { name: 'Download CSV' })).toBeVisible();
    },
  },
];

test.describe('axe scans', () => {
  for (const theme of THEMES) {
    for (const view of VIEWS) {
      test(`axe: ${view.name} (${theme})`, async ({ page, guard }) => {
        const width = page.viewportSize()?.width ?? 0;
        const known = KNOWN[`${view.name}|${theme}`] ?? KNOWN[`${view.name}|${theme}|${width}`];
        if (known) test.fail(true, `known finding ${known}`);
        if (view.allow404) guard.allow({ text: /Failed to load resource.*404/, url: /\/api\/lookup$/, reason: 'the deliberate 404 of an unsupported address' });
        await view.before?.(page);
        await setTheme(page, theme, view.hash);
        await view.ready(page);
        await view.after?.(page);
        await scan(page, view.name, theme);
      });
    }

    // V6 is reached with an entry in the service's watchlist (the back end's database, shared by every project), so each
    // project and theme adds its own address through the API and removes it again whatever happens.
    test(`axe: V6 watchlist (${theme})`, async ({ page }) => {
      const width = page.viewportSize()?.width ?? 0;
      const known = KNOWN[`V6 watchlist|${theme}`] ?? KNOWN[`V6 watchlist|${theme}|${width}`];
      if (known) test.fail(true, `known finding ${known}`);
      const mine = await spareAddress(page, theme === 'light' ? 0 : 1);
      await page.request.delete(`/api/watchlist/${mine}`); // a leftover of an interrupted run
      const put = await page.request.put(`/api/watchlist/${mine}`, { data: { label: `a11y ${theme} ${width}`, note: 'Added by the accessibility scan.' } });
      expect(put.ok()).toBe(true);
      try {
        await setTheme(page, theme, '#/watchlist');
        await expect(page.locator('.watch-list')).toBeVisible();
        await scan(page, 'V6 watchlist', theme);
      } finally {
        await page.request.delete(`/api/watchlist/${mine}`);
      }
    });
  }
});

// ------------------------------------------------------------------ B. keyboard

/** Presses Tab until `target` has focus (at most `limit` times), so the focus came from the keyboard and :focus-visible applies. */
async function tabTo(page: Page, target: ReturnType<Page['locator']>, limit = 60): Promise<void> {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error('Tab never reached the element');
}

test.describe('keyboard', () => {
  // Safari does not Tab to links and some controls unless the user turns that on (or presses Option+Tab), so a
  // "Tab reaches the link" check says nothing about the app in WebKit. These run in Chromium and Firefox.
  test.skip(({ browserName }) => browserName === 'webkit', 'WebKit does not Tab to links by default');

  test('the first Tab shows the skip link, and it moves focus into main', async ({ page }) => {
    for (const hash of ['#/', `#/address/${addr}`, '#/about']) {
      await page.goto('about:blank'); // a fresh document, so the first Tab starts from the top of the page
      await page.goto(`/${hash}`);
      await settled(page);
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', { name: 'Skip to content' });
      await expect(skip, `skip link focused first on ${hash}`).toBeFocused();
      await expect(skip).toBeInViewport();
      await page.keyboard.press('Enter');
      const inMain = await page.evaluate(() => !!document.querySelector('main')?.contains(document.activeElement));
      expect(inMain, `focus is inside main after the skip link on ${hash}`).toBe(true);
    }
  });

  test('V1: Tab reaches the address field, Look up and the first row link in reading order', async ({ page }) => {
    await page.goto('/#/');
    const table = page.getByRole('table', { name: /Addresses in the snapshot/ });
    await expect(table.getByRole('row').nth(1)).toBeVisible();
    const order = await page.evaluate(() => {
      const first = document.querySelector('table a[href*="#/address/"]');
      return { field: document.getElementById('address-input'), first };
    }).then(() => null);
    void order;
    const seen: string[] = [];
    for (let i = 0; i < 40 && seen.length < 3; i++) {
      await page.keyboard.press('Tab');
      const mark = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        if (el.id === 'address-input') return 'field';
        if (el.tagName === 'BUTTON' && /Look up/.test(el.textContent ?? '')) return 'lookup';
        if (el.tagName === 'A' && el.closest('table') && /, full address /.test(el.textContent ?? '')) return 'rowlink';
        return '';
      });
      if (mark && !seen.includes(mark)) seen.push(mark);
    }
    expect(seen).toEqual(['field', 'lookup', 'rowlink']);
  });

  test('focus is visible on a link, a button, a field and a tab', async ({ page }) => {
    const visible = (locator: ReturnType<Page['locator']>) =>
      locator.evaluate((el) => {
        // A stretched link (the address and row links) draws its ring on ::after, so both are read.
        return [getComputedStyle(el), getComputedStyle(el, '::after')].some(
          (s) => (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow !== 'none' && s.boxShadow !== ''),
        );
      });
    await page.goto('/#/');
    await expect(page.getByRole('table', { name: /Addresses in the snapshot/ }).getByRole('row').nth(1)).toBeVisible();
    const field = page.getByLabel('Bitcoin address');
    await field.focus();
    expect(await visible(field), 'field').toBe(true);
    const button = page.getByRole('button', { name: 'Look up' });
    await field.press('Tab');
    await expect(button).toBeFocused();
    expect(await visible(button), 'button').toBe(true);
    await page.keyboard.press('Tab');
    const link = page.getByRole('table').getByRole('link').first();
    await tabTo(page, link);
    expect(await visible(link), 'link').toBe(true);
    await page.goto(`/#/address/${addr}`);
    await settled(page);
    const tab = page.getByRole('navigation', { name: 'Views of this address' }).getByRole('link').nth(1);
    await tabTo(page, tab);
    expect(await visible(tab), 'tab').toBe(true);
  });

  test('the watch dialog traps focus, Escape closes it and focus returns to the opener', async ({ page }) => {
    await page.request.delete(`/api/watchlist/${addr}`); // so the star offers "Add", whatever an interrupted run left
    await page.goto('/#/');
    await expect(page.getByRole('table', { name: /Addresses in the snapshot/ }).getByRole('row').nth(1)).toBeVisible();
    const opener = page.getByRole('button', { name: `Add ${addr} to the watchlist` });
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const inside = () => page.evaluate(() => !!document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `Tab ${i + 1} stays inside`).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Shift+Tab');
      expect(await inside(), `Shift+Tab ${i + 1} stays inside`).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('G1: focus the chart, arrow keys move between days, Enter opens a day', async ({ page }) => {
    await page.goto(`/#/address/${addr}`);
    const chart = await drawnChart(page, 'Transactions per day');
    const group = chart.getByRole('group', { name: /arrow keys/i });
    await group.focus();
    await expect(group).toBeFocused();
    const hover = chart.locator('.pchart-plot .hoverlayer .hovertext');
    await expect(hover.first()).toBeAttached();
    const text = () => hover.first().evaluate((el) => el.textContent ?? '');
    const first = await text();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(text).not.toBe(first);
    const moved = await text();
    await page.keyboard.press('ArrowRight');
    await expect.poll(text).not.toBe(moved);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/address\/[^/]+\/day\/\d{4}-\d{2}-\d{2}/);
  });

  test('the What-if error is tied to its field and announced', async ({ page }) => {
    await page.goto(`/#/address/${addr}/what-if`);
    await expect(page.getByTestId('state-whatif-empty')).toBeVisible();
    const field = page.getByLabel('Amount (BTC)');
    await field.fill('0.123456789');
    const alert = page.getByRole('alert').filter({ hasText: /decimal/i });
    await expect(alert).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    const errorId = await alert.getAttribute('id');
    expect(errorId).toBeTruthy();
    expect(await field.getAttribute('aria-describedby')).toContain(errorId!);
  });
});

// ------------------------------------------------------------------ C. motion, zoom, live regions

/** Adds a spare address to the watchlist through the star's dialog (the service's real answer makes the toast), runs `check`
 * on the toast, and removes the entry again whatever happens. */
async function withToast<T>(page: Page, purpose: number, check: (toast: ReturnType<Page['locator']>) => Promise<T>): Promise<T> {
  const mine = await spareAddress(page, purpose);
  await page.request.delete(`/api/watchlist/${mine}`);
  try {
    await page.goto(`/#/address/${mine}`);
    await settled(page);
    await page.getByRole('button', { name: /add it to the watchlist/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Add to the watchlist' }).click();
    const toast = page.getByRole('region', { name: 'Notifications' }).locator('.toast').first();
    await expect(toast).toBeVisible();
    return await check(toast);
  } finally {
    await page.request.delete(`/api/watchlist/${mine}`);
  }
}

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the switch does not transition, toasts do not animate, the replay does not run by itself', async ({ page }) => {
    await page.goto(`/#/address/${addr}`);
    await settled(page);
    const durations = await page.evaluate(() => {
      const t = (sel: string) => {
        const el = document.querySelector(sel);
        const s = el ? getComputedStyle(el) : null;
        return s ? { transition: s.transitionDuration, animation: s.animationName } : null;
      };
      return { track: t('.switch-track'), thumb: t('.switch-thumb') };
    });
    for (const [name, v] of Object.entries(durations)) {
      expect(v, `${name} exists`).not.toBeNull();
      expect(v!.transition.split(',').every((d) => parseFloat(d) === 0), `${name} transition ${v!.transition}`).toBe(true);
    }
    // A toast (a watchlist add) appears with no animation.
    const toast = await withToast(page, 3, async (toastItem) => toastItem.evaluate((el) => getComputedStyle(el).animationName));
    expect(toast).toBe('none');
    // The replay offers no Play button and says why.
    await page.getByRole('button', { name: 'Open the replay' }).click();
    await expect(page.getByText(/asks for less motion/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Play|Resume|Pause)/ })).toHaveCount(0);
  });
});

test.describe('200% zoom', () => {
  // 200% zoom of a 1280 px window is a 640 CSS px viewport at twice the device pixel ratio.
  test.use({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false });
  const pages: Array<[string, string, (p: Page) => Promise<void>]> = [
    ['V2', `#/address/${addr}`, async (p) => void (await drawnChart(p, 'Transactions per day'))],
    ['V3 transaction', `#/address/${addr}/day/${examples.flagged.date}/tx/${examples.flagged.txid}`, async (p) => void (await drawnChart(p, 'How this transaction compares with usual'))],
    ['V4', `#/address/${addr}/what-if`, async (p) => void (await expect(p.getByTestId('state-whatif-empty')).toBeVisible())],
  ];
  for (const [name, hash, ready] of pages) {
    test(`${name} holds its layout`, async ({ page, guard }, info) => {
      test.skip(info.project.name !== 'chromium-1280', 'the viewport is set here, so the three projects would run the same test');
      await page.goto(`/${hash}`);
      await ready(page);
      await guard.noSidewaysScroll(`at 200% zoom on ${name}`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(wide).toBeLessThanOrEqual(0);
    });
  }
});

test('a toast appears in a polite live region that was already on the page', async ({ page }) => {
  await page.goto('/#/');
  await settled(page);
  const region = page.getByRole('region', { name: 'Notifications' });
  await expect(region).toHaveAttribute('aria-live', 'polite');
  await expect(region.locator('.toast')).toHaveCount(0);
  await withToast(page, 2, async (toast) => {
    expect(await toast.evaluate((el) => !!el.closest('[aria-live="polite"]'))).toBe(true);
    await expect(toast).toContainText(/Added .* to the watchlist/);
  });
});
