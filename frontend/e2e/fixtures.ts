// The fixture every journey test uses. Besides the page it checks, after each test, the two things the plan's
// browser row asks of every run: the page never scrolls sideways, and the browser console stays empty (no
// console.error, no uncaught error). A test may allow one expected console error, narrowly, with `guard.allow`.

import { readFileSync } from 'node:fs';
import { test as base, expect, type Page } from '@playwright/test';

/** One console error a test expects, and why. It matches on the message AND on the address that failed. */
export interface AllowedConsoleError {
  text: RegExp;
  url: RegExp;
  reason: string;
}

/** Letter spacing that stands in for a wider font than this Mac's (Linux's DejaVu Sans, Windows' Segoe UI, larger text).
 * One-line buttons and the address tabs that fit here pushed a 390 px phone page sideways on the Linux CI machine
 * (19 and 20 Nov). 0.2em makes the Mac's font as wide as Linux's plus a margin: the checks fail on the old CSS here. */
export const WIDER_TEXT_CSS = 'body * { letter-spacing: 0.2em !important; }';

export interface Guard {
  /** Allows one expected console error for this test only. */
  allow: (entry: AllowedConsoleError) => void;
  /** The page is no wider than the viewport; `step` names where in the journey it was checked. */
  noSidewaysScroll: (step: string) => Promise<void>;
}

/** The inputs recorded for the screenshots and the mock (src/api/mock/fixtures/examples.json); the real service answers them the same way. */
export const examples = JSON.parse(readFileSync(new URL('../src/api/mock/fixtures/examples.json', import.meta.url), 'utf8')) as {
  typo: string;
  unsupported: string;
  mainAddress: string;
  shortHistory: string;
  flagged: { address: string; date: string; txid: string };
  scored: { address: string; date: string; txid: string };
  earlyUnscored: { address: string; date: string; txid: string };
  notScored: { address: string; date: string; txid: string };
  whatIf: { address: string; amountBtc: string; direction: 'in' | 'out'; time: string };
};

/** The fixed limitation line, from shared/wording.json, the one file the back end and the app share. */
export const limitationLine = (JSON.parse(readFileSync(new URL('../../shared/wording.json', import.meta.url), 'utf8')) as { limitationLine: string }).limitationLine;

/** The widest the page may be: the width the project asked for (a phone may zoom out a page that is too wide, so innerWidth alone is not a fair limit). */
async function checkWidth(page: Page, step: string): Promise<void> {
  const asked = page.viewportSize()?.width ?? 0;
  // Polled, because a chart that is still measuring itself may be wide for a moment.
  await expect
    .poll(() => page.evaluate((limit) => document.documentElement.scrollWidth - Math.min(window.innerWidth, limit), asked || 100_000), {
      message: `the page scrolls sideways ${step} (scrollWidth over the ${asked}px window, in pixels)`,
    })
    .toBeLessThanOrEqual(0);
}

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page }, use) => {
      const errors: Array<{ text: string; url: string }> = [];
      const allowed: AllowedConsoleError[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push({ text: message.text(), url: message.location().url });
      });
      page.on('pageerror', (error) => errors.push({ text: `Uncaught: ${error.message}`, url: '' }));

      await use({
        allow: (entry) => void allowed.push(entry),
        noSidewaysScroll: (step) => checkWidth(page, step),
      });

      await checkWidth(page, 'at the end of the test');
      const unexpected = errors.filter((e) => !allowed.some((a) => a.text.test(e.text) && a.url.test(e.url)));
      expect(unexpected, 'the browser console must be empty').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Waits until a chart (found by its title) has been drawn by Plotly, and returns its figure. */
export async function drawnChart(page: Page, title: string) {
  const figure = page.getByRole('figure', { name: title });
  // A chart is drawn only once it is in view (src/charts/useInView.ts), so it is scrolled to first.
  await figure.scrollIntoViewIfNeeded();
  await expect(figure.locator('.pchart-plot svg.main-svg').first()).toBeVisible();
  // "Download PNG" is disabled until the chart is ready (it is in the tool bar, or in "Chart tools" on a phone).
  await expect(figure.locator('.pchart-skeleton')).toHaveCount(0);
  return figure;
}

/** The chart's tool buttons: on a phone they sit inside the "Chart tools" disclosure, which is opened first. */
export async function chartTools(figure: ReturnType<Page['getByRole']>) {
  const summary = figure.getByText('Chart tools', { exact: true });
  if (await summary.isVisible()) {
    const details = figure.locator('details.pchart-menu');
    if ((await details.getAttribute('open')) === null) await summary.click();
  }
  return figure;
}

/** RFC 4180 reader for the CSV the service writes (quoted cells, doubled quotes, CRLF or LF line ends). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(cell), (cell = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) (row.push(cell), rows.push(row));
  return rows;
}
