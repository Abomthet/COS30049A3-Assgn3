// J3: type an address that cannot be shown (plan section 4).
import { examples, expect, test, WIDER_TEXT_CSS } from './fixtures';

test.describe('J3: addresses that cannot be shown', () => {
  test('a typo is caught in the browser, before any request', async ({ page, guard }) => {
    const lookups: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/lookup')) lookups.push(request.url());
    });
    await page.goto('/#/');
    await expect(page.getByRole('table', { name: /Addresses in the snapshot/ })).toBeVisible(); // the page has settled
    await page.getByLabel('Bitcoin address').fill(examples.typo);
    await page.getByRole('button', { name: 'Look up' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toContainText(/\w{5}/);
    await expect(page.getByLabel('Bitcoin address')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Bitcoin address')).toBeFocused();
    expect(lookups, 'no /api/lookup request for a typo').toEqual([]);
    await guard.noSidewaysScroll('after the typo');
  });

  test('a valid address outside the snapshot gets an explanation and three examples', async ({ page, guard }) => {
    // The service answers 404 for it and the browser logs that failed request; this is the one expected console line.
    guard.allow({ text: /Failed to load resource.*404/, url: /\/api\/lookup$/, reason: 'the deliberate 404 of an unsupported address, which the screen handles' });
    await page.goto('/#/');
    await page.getByLabel('Bitcoin address').fill(examples.unsupported);
    await page.getByRole('button', { name: 'Look up' }).click();

    const panel = page.getByTestId('state-unsupported');
    await expect(panel.getByRole('heading', { name: "This address isn't in the snapshot" })).toBeVisible();
    await expect(panel.getByText(/^Only \d+ addresses are covered\. Try one of these:$/)).toBeVisible();
    const examplesList = panel.getByRole('list').getByRole('link');
    await expect(examplesList).toHaveCount(3);
    await guard.noSidewaysScroll('after the unsupported address');
    // Its buttons are whole sentences: with a wider font they must wrap, not widen the page.
    const wider = await page.addStyleTag({ content: WIDER_TEXT_CSS });
    await guard.noSidewaysScroll('after the unsupported address, with wider text');
    await wider.evaluate((el) => (el as Element).remove());

    // An example opens its overview.
    await examplesList.first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^[13]|^bc1/);
  });

  test('a short-history address lists its transactions, unscored', async ({ page, guard }) => {
    await page.goto(`/#/address/${examples.shortHistory}`);
    const notice = page.getByTestId('state-insufficient');
    await expect(notice.getByRole('heading', { name: 'Too little history to score' })).toBeVisible();
    await expect(notice.locator('.stat-block')).toHaveText(/^\d+ transactions? over less than a day$/);
    await expect(page.locator('.stat-row .stat').nth(2).locator('.stat-value')).toHaveText('—');
    const wider = await page.addStyleTag({ content: WIDER_TEXT_CSS });
    await guard.noSidewaysScroll('on the short-history notice, with wider text');
    await wider.evaluate((el) => (el as Element).remove());

    await notice.getByRole('link', { name: 'Browse its transactions' }).click();
    const table = page.getByRole('table', { name: /Transactions of this address/ });
    const rows = table.locator('tbody tr'); // on a phone each row is a card and the header row is not exposed, so the body is counted
    await expect(rows.first()).toBeVisible();
    const body = await rows.count();
    expect(body).toBeGreaterThan(0);
    await expect(table.getByText('Not scored')).toHaveCount(body); // every row says so
    await expect(table.getByText('Unusual')).toHaveCount(0);
    await guard.noSidewaysScroll('on the short-history transactions');
  });
});
