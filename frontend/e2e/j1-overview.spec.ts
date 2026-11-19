// J1: open an address and read its activity (plan section 4).
import { drawnChart, examples, expect, test } from './fixtures';

test('J1: pick an address from the list and read its overview', async ({ page, guard }) => {
  await page.goto('/#/');
  await expect(page.getByRole('heading', { level: 1, name: /Explore a Bitcoin address/ })).toBeVisible();
  const list = page.getByRole('table', { name: /Addresses in the snapshot/ });
  await expect(list.getByRole('row')).not.toHaveCount(1);
  await guard.noSidewaysScroll('on the address list');

  // The address list names the snapshot's source and date.
  await expect(page.getByText(/snapshot of \d+ \w+ \d{4}/).first()).toBeVisible();

  await list.getByRole('link', { name: `Open activity for ${examples.mainAddress}` }).click();
  await expect(page).toHaveURL(new RegExp(`#/address/${examples.mainAddress}`));
  await expect(page.getByRole('heading', { level: 1, name: examples.mainAddress })).toBeVisible();

  // The source and the snapshot date.
  await expect(page.getByText(/^Source: .+ · snapshot of \d+ \w+ \d{4} · days in UTC/)).toBeVisible();

  // The four summary tiles, each with a value; the date range is in the "Active" tile.
  const tiles = page.locator('dl.stat-row');
  await expect(tiles.getByRole('term')).toHaveText(['Transactions', 'Active', 'Unusual', 'Scored']);
  const values = tiles.getByRole('definition');
  await expect(values).toHaveCount(4);
  await expect(values.nth(0)).toHaveText(/^\d[\d,]*$/);
  await expect(values.nth(1)).toHaveText(/\d+ \w+ \d{4}( – \d+ \w+ \d{4})?\d+ calendar days?/);
  await expect(values.nth(2)).toHaveText(/^[1-9]\d*on \d+ days? by /);
  await expect(values.nth(3)).toHaveText(/^\d[\d,]* of \d[\d,]*enough earlier history$/);

  // The daily chart is drawn: bars, and a caption that repeats the source.
  const chart = await drawnChart(page, 'Transactions per day');
  await expect(chart.locator('.pchart-plot .barlayer .point').first()).toBeAttached();
  await expect(chart.locator('.pchart-caption')).toContainText('days in UTC');

  // The days with unusual transactions: the running example's flagged day is among them, newest first.
  const days = page.getByRole('region', { name: 'Days with unusual transactions' });
  await expect(days.getByRole('link').first()).toBeVisible();
  const [y, m, d] = examples.flagged.date.split('-').map(Number);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  await expect(days.getByRole('link', { name: new RegExp(`${d} ${month} ${y}`) })).toBeVisible();
  await guard.noSidewaysScroll('on the overview');
});
