// J4: what-if (plan section 4). The scenarios are kept in the browser's own storage, so a test starts with none and leaves nothing behind.
import { drawnChart, examples, expect, test } from './fixtures';

test('J4: the verdict and the curve follow the values, and a scenario is kept', async ({ page, guard }) => {
  await page.goto(`/#/address/${examples.mainAddress}`);
  await page.getByRole('navigation', { name: 'Views of this address' }).getByRole('link', { name: 'What-if' }).click();
  await expect(page).toHaveURL(/\/what-if/);

  await expect(page.getByTestId('state-whatif-empty')).toBeVisible();
  await guard.noSidewaysScroll('in the empty lab');

  // A large amount sent: flagged.
  await page.getByRole('radio', { name: 'Sent' }).check();
  await page.getByLabel('Amount (BTC)').fill(examples.whatIf.amountBtc);
  const verdict = page.getByTestId('verdict-card');
  await expect(verdict.getByRole('heading', { name: /^Flagged by / })).toBeVisible();
  await expect(verdict).toContainText(/Score \d+\.\d+ against a flag line of \d+\.\d+/);
  await expect(page.getByRole('region', { name: 'Why this amount stands out' })).toBeVisible();
  const curve = await drawnChart(page, 'How the score changes with the amount');
  await expect(curve.locator('.pchart-plot .scatterlayer .trace').first()).toBeAttached();
  await expect(page.getByRole('group', { name: /Line chart of the .* sent amounts/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'The verdict below is for these values.' })).toBeVisible();
  await guard.noSidewaysScroll('with a flagged verdict');

  // Keep it.
  const keep = page.getByRole('button', { name: 'Keep this scenario' });
  await keep.click();
  const kept = page.getByRole('table', { name: /Kept what-if scenarios/ });
  await expect(kept.getByRole('row')).toHaveCount(2); // the header and one scenario
  await expect(kept.getByRole('row').nth(1)).toContainText(`${examples.whatIf.amountBtc} BTC`);
  await expect(kept.getByRole('row').nth(1)).toContainText('Unusual');
  await expect(keep).toBeDisabled(); // the same scenario is not kept twice

  // A tiny amount: the verdict changes to not flagged.
  await page.getByLabel('Amount (BTC)').fill('0.0005');
  await expect(verdict.getByRole('heading', { name: 'Not flagged' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Why this amount stands out' })).toHaveCount(0);
  await expect(keep).toBeEnabled();
  await keep.click();
  await expect(kept.getByRole('row')).toHaveCount(3);
  await expect(kept.getByRole('row').nth(2)).toContainText('Not unusual');

  // Another direction redraws the curve for received amounts.
  await page.getByRole('radio', { name: 'Received' }).check();
  await expect(page.getByRole('group', { name: /Line chart of the .* received amounts/ })).toBeVisible();
  await expect(verdict).toContainText(/Received/);
  await guard.noSidewaysScroll('after changing the direction');

  // A mistyped amount is explained under the field, with no verdict for it.
  await page.getByLabel('Amount (BTC)').fill('0.123456789');
  await expect(page.getByRole('alert').filter({ hasText: /decimal/i })).toBeVisible();
  await guard.noSidewaysScroll('with an invalid amount');
});
