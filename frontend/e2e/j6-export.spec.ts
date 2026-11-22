// J6: take results away (plan section 4): the scored transactions as a CSV file, and a chart as a PNG picture.
import { readFile } from 'node:fs/promises';
import { chartTools, drawnChart, examples, expect, limitationLine, parseCsv, test } from './fixtures';

test.describe('J6: export', () => {
  test('the address\'s scored transactions download as a CSV with the limitation line in every row', async ({ page, guard }) => {
    await page.goto(`/#/address/${examples.mainAddress}/transactions`);
    const count = page.getByRole('region', { name: 'Filter transactions' }).getByRole('status');
    await expect(count).toHaveText(/Showing \d+ of \d+ transactions?$/);
    const total = Number((await count.innerText()).match(/Showing (\d+)/)![1]);

    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^1Bbcsfxj-\d{4}-\d{2}-\d{2}\.csv$/); // first eight characters of the address, and the snapshot date
    const rows = parseCsv(await readFile((await download.path())!, 'utf8'));

    const header = rows[0];
    expect(header.slice(0, 4)).toEqual(['address', 'txid', 'time_utc', 'direction']);
    expect(header).toContain('flagged');
    expect(header.at(-1)).toBe('limitation');
    const data = rows.slice(1);
    expect(data).toHaveLength(total);
    for (const row of data) {
      expect(row, 'every row has every column').toHaveLength(header.length);
      expect(row.at(-1), 'the limitation line is in every row').toBe(limitationLine);
      expect(row[0]).toBe(examples.mainAddress);
    }
    expect(data.some((row) => row[header.indexOf('flagged')] === 'true')).toBe(true);
    await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(/Exported \d+ rows? to 1Bbcsfxj/);
    await guard.noSidewaysScroll('after the CSV export');
  });

  test('a chart\'s table downloads as a CSV with the limitation line in a last column on every row', async ({ page }) => {
    await page.goto(`/#/address/${examples.mainAddress}`);
    const chart = await chartTools(await drawnChart(page, 'Transactions per day'));
    await chart.getByRole('button', { name: 'View as table' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), chart.getByRole('button', { name: 'Download CSV' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^daily-activity_1Bbcsfxj\w+_\d{4}-\d{2}-\d{2}\.csv$/);
    const rows = parseCsv(await readFile((await download.path())!, 'utf8'));
    expect(rows[0].at(-1)).toBe('limitation');
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.slice(1)) {
      expect(row, 'every row has every column').toHaveLength(rows[0].length);
      expect(row.at(-1), 'the limitation line is in every row').toBe(limitationLine);
    }
  });

  test('a chart downloads as a PNG picture', async ({ page, guard }) => {
    await page.goto(`/#/address/${examples.mainAddress}`);
    const chart = await chartTools(await drawnChart(page, 'Transactions per day'));
    const [download] = await Promise.all([page.waitForEvent('download'), chart.getByRole('button', { name: 'Download PNG' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^daily-activity_1Bbcsfxj\w+_\d{4}-\d{2}-\d{2}\.png$/);
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(0, 8).toString('hex'), 'a PNG file starts with the PNG signature').toBe('89504e470d0a1a0a');
    expect(bytes.length).toBeGreaterThan(5_000);
    await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Chart image downloaded');
    await guard.noSidewaysScroll('after the PNG export');
  });
});
