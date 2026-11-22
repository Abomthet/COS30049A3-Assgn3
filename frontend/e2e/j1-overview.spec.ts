// J1: open an address and read its activity (plan section 4).
import { drawnChart, examples, expect, test, WIDER_TEXT_CSS } from './fixtures';

test('J1: pick an address from the list and read its overview', async ({ page, guard }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1, name: /See what's unusual in a Bitcoin address/ })).toBeVisible();
  const list = page.getByRole('table', { name: /Addresses in the snapshot/ });
  await expect(list.getByRole('row')).not.toHaveCount(1);
  await guard.noSidewaysScroll('on the address list');

  // The header strip names the snapshot's date and source, once; the list repeats neither.
  await expect(page.getByTestId('header-meta')).toHaveText(/^Snapshot of \d+ \w+ \d{4} · .+$/);
  await expect(page.getByTestId('header-meta')).not.toContainText('days in UTC');
  await expect(page.locator('.section-meta')).toHaveCount(0);

  await list.getByRole('link', { name: `full address ${examples.mainAddress}` }).click();
  await expect(page).toHaveURL(new RegExp(`#/address/${examples.mainAddress}`));
  await expect(page.getByRole('heading', { level: 1, name: examples.mainAddress })).toBeVisible();

  // The header strip and the chart footnote carry the source and the date, so the page has no source line of its own.
  await expect(page.getByText(/^Source: /)).toHaveCount(0);

  // The four summary tiles, each a label and a figure; the date range is in the "Active" tile.
  const tiles = page.locator('.stat-row .stat');
  await expect(tiles.locator('.stat-label')).toHaveText(['Transactions', 'Active', 'Unusual', 'Scored']);
  await expect(tiles.nth(0).locator('.stat-value')).toHaveText(/^\d[\d,]*$/);
  await expect(tiles.nth(1)).toContainText(/\d+ \w+ \d{4}( – \d+ \w+ \d{4})?/);
  await expect(tiles.nth(1).locator('.stat-note')).toHaveText(/^\d+ days?$/);
  await expect(tiles.nth(2).locator('.stat-value')).toHaveText(/^[1-9]\d*$/);
  await expect(tiles.nth(2).locator('.stat-note')).toHaveText(/^on \d+ days?$/);
  await expect(tiles.nth(3).locator('.stat-value')).toHaveText(/^\d[\d,]* of \d[\d,]*$/);
  await expect(tiles.nth(3).locator('.stat-note')).toHaveText(/^the first \d+ are too early to score$/);

  // The daily chart is drawn: bars, and a footnote with the source and the date (no "Data:", no "days in UTC").
  const chart = await drawnChart(page, 'Transactions per day');
  await expect(chart.locator('.pchart-plot .barlayer .point').first()).toBeAttached();
  await expect(chart.locator('.pchart-footnote')).toHaveText(/^.+ · snapshot of \d+ \w+ \d{4}$/);
  await expect(chart.locator('.pchart-footnote')).not.toContainText(/Data:|days in UTC|flagged by/);

  // The days with unusual transactions: the running example's flagged day is among them, newest first.
  const days = page.getByRole('region', { name: 'Days with unusual transactions' });
  await expect(days.getByRole('link').first()).toBeVisible();
  await expect(days.getByTestId('flagged-headline')).toHaveText(/^\d+ days? with unusual transactions · \d+ \w+ \d{4} – \d+ \w+ \d{4}$/);
  const [y, m, d] = examples.flagged.date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  await expect(days.getByRole('link', { name: new RegExp(`${d} ${month} ${y}`) })).toBeVisible();
  await guard.noSidewaysScroll('on the overview');
  // With a wider font (Linux, Windows, larger text) the page must still fit: buttons and tabs wrap.
  const wider = await page.addStyleTag({ content: WIDER_TEXT_CSS });
  await guard.noSidewaysScroll('on the overview, with wider text');
  await wider.evaluate((el) => (el as Element).remove());
});
