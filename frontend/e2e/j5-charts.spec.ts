// J5: working with the charts (plan section 4): zoom the daily chart, filter the scatter, hover, open a transaction.
import { drawnChart, examples, expect, test } from './fixtures';

test.describe('J5: charts', () => {
  test('zoom the daily chart with its period buttons', async ({ page, guard }) => {
    await page.goto(`/#/address/${examples.mainAddress}`);
    const chart = await drawnChart(page, 'Transactions per day');
    const axis = chart.locator('.pchart-plot .xaxislayer-above .xtick text');
    // The range slider is the second row of the chart; zooming moves the axis to fewer, finer ticks.
    await expect(chart.locator('.pchart-plot .rangeslider-container')).toBeAttached();
    const rangeOf = () => chart.locator('.pchart-plot').evaluate((el) => JSON.stringify((el as unknown as { layout: { xaxis: { range: string[] } } }).layout.xaxis.range));
    const before = await rangeOf();
    await chart.getByRole('group', { name: 'Zoom to a period' }).getByRole('button', { name: '1 month' }).click();
    await expect.poll(rangeOf).not.toBe(before);
    const zoomed = await rangeOf();
    await expect(axis.first()).toBeVisible();
    await chart.getByRole('group', { name: 'Zoom to a period' }).getByRole('button', { name: 'All' }).click();
    await expect.poll(rangeOf).not.toBe(zoomed);
    await guard.noSidewaysScroll('after zooming');
  });

  test('"How to read this chart" is closed, opens and closes from the keyboard, and the one action hint stays visible', async ({ page }) => {
    await page.goto(`/#/address/${examples.mainAddress}`);
    const chart = await drawnChart(page, 'Transactions per day');
    const disclosure = chart.locator('details.pchart-guide');
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(chart.getByText('Select a bar to open that day.', { exact: true })).toBeVisible();
    await expect(chart.getByText(/Drag across the chart/)).toBeHidden();
    await disclosure.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(disclosure).toHaveAttribute('open', '');
    await expect(chart.getByText(/Drag across the chart/)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(disclosure).not.toHaveAttribute('open', '');
  });

  test('filter the scatter to sent, unusual transactions; hover; open one', async ({ page, guard }) => {
    await page.goto(`/#/address/${examples.mainAddress}/transactions`);
    const filters = page.getByRole('region', { name: 'Filter transactions' });
    const count = filters.getByRole('status');
    await expect(count).toHaveText(/Showing \d+ of \d+ transactions?$/);
    const all = Number((await count.innerText()).match(/of (\d+)/)![1]);
    const chart = await drawnChart(page, 'Transactions over time');

    await filters.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Unusual', exact: true }).click();
    await filters.getByRole('group', { name: 'Direction' }).getByRole('button', { name: 'Sent' }).click();
    await expect(filters.getByRole('button', { name: 'Unusual', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/status=flagged/);
    await expect(page).toHaveURL(/direction=out/);
    await expect(count).toHaveText(new RegExp(`^Showing [1-9]\\d* of ${all} transactions$`));
    // The table follows: every row is unusual and sent.
    const table = page.getByRole('table', { name: /Transactions of this address/ });
    const rows = table.locator('tbody tr'); // on a phone each row is a card and the header row is not exposed
    const body = await rows.count();
    expect(body).toBeGreaterThan(0);
    await expect(table.getByText('Unusual', { exact: true })).toHaveCount(body);
    await expect(table.getByText('Sent', { exact: true })).toHaveCount(body);
    await drawnChart(page, 'Transactions over time');
    await guard.noSidewaysScroll('after filtering');

    // Hover shows the facts of a point. The app keeps the tooltip on every device that sends mouse movement, so this runs at every width.
    const point = chart.locator('.pchart-plot .scatterlayer .points path').first();
    await point.scrollIntoViewIfNeeded();
    await point.hover({ force: true });
    await expect(chart.locator('.pchart-plot .hoverlayer .hovertext')).toContainText(/Unusual:/);
    await expect(chart.locator('.pchart-plot .hoverlayer .hovertext')).toContainText(/Select to open/);

    // Open a transaction from the table.
    await rows.first().getByRole('link').click();
    await expect(page).toHaveURL(/\/tx\/[0-9a-f]{64}/);
    await expect(page.getByRole('article').getByRole('heading', { name: 'Transaction details' })).toBeVisible();
    await guard.noSidewaysScroll('on the opened transaction');
  });

  test('open a transaction from the chart', async ({ page, guard }) => {
    await page.goto(`/#/address/${examples.mainAddress}/transactions?status=flagged`);
    const chart = await drawnChart(page, 'Transactions over time');
    const point = chart.locator('.pchart-plot .scatterlayer .points path').first();
    await point.scrollIntoViewIfNeeded();
    // Plotly opens the point it has hovered, so the mouse rests on it (and the tooltip shows) before the click.
    await point.hover({ force: true });
    await expect(chart.locator('.pchart-plot .hoverlayer .hovertext')).toContainText(/Select to open/);
    await point.click({ force: true });
    // On a touch screen the first tap shows the tooltip and the second opens the transaction (PlotlyChart, plan section 8).
    if (await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)) await point.click({ force: true });
    await expect(page).toHaveURL(/\/tx\/[0-9a-f]{64}/);
    await expect(page.getByRole('article').getByRole('heading', { name: 'Transaction details' })).toBeVisible();
    await guard.noSidewaysScroll('after opening from the chart');
  });
});
