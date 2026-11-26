// J2: find out why a transaction stands out (plan section 4).
import { drawnChart, examples, expect, limitationLine, test, WIDER_TEXT_CSS } from './fixtures';

test('J2: from a flagged day to one transaction and its reasons', async ({ page, guard }) => {
  const { flagged } = examples;
  await page.goto(`/#/address/${flagged.address}`);
  const days = page.getByRole('region', { name: 'Days with unusual transactions' });
  await days.locator(`a[href*="/day/${flagged.date}"]`).click();

  // That day's transactions, with the flagged one marked and its reason on the row.
  await expect(page).toHaveURL(new RegExp(`/day/${flagged.date}`));
  const row = page.locator(`a.tx-row[href*="${flagged.txid}"]`);
  await expect(row).toContainText('Unusual');
  await expect(page.getByRole('heading', { name: 'Pick a transaction to see its details.' })).toBeVisible();
  await guard.noSidewaysScroll('on the day');

  await row.click();
  await expect(page).toHaveURL(new RegExp(`/tx/${flagged.txid}`));
  const detail = page.getByRole('article');
  await expect(detail.getByRole('heading', { name: 'Transaction details' })).toBeVisible();

  // Its facts.
  const facts = detail.locator('dl.facts');
  await expect(facts.getByRole('term')).toHaveText(['Transaction ID', 'Confirmed', 'Amount for this address', 'How the amount is made up', 'Source']);
  await expect(facts.getByText(flagged.txid)).toBeVisible();
  await expect(facts.getByRole('definition').nth(1)).toContainText(/Block \d/);
  await expect(facts.getByRole('definition').nth(2)).toContainText(/BTC/);

  // The reason in plain words, what it was compared with, and the limitation line.
  const why = page.getByRole('region', { name: 'Why it stands out' });
  await expect(why.getByTestId('flag-figure')).toContainText(/\w{4}/);
  await expect(why.getByTestId('flag-figure').locator('.stat-value')).toBeVisible();
  await expect(why).not.toContainText(/Template|Flagged by|What stands out/);
  // Nothing is asked of the Assistant on load: the short reason lines show, and the button asks for its prepared answer.
  await expect(why.getByTestId('reason-lines')).toBeVisible();
  await expect(why.getByText('Written by the Assistant. Checked by code before it is shown.')).toHaveCount(0);
  await expect(why.getByRole('button', { name: 'Ask the Assistant to explain' })).toBeVisible();
  await expect(why.getByRole('heading', { name: 'Compared with' })).toBeVisible();
  await expect(why.getByRole('listitem').filter({ hasText: /\(\d+ \w+ \d{4}/ }).first()).toBeVisible();
  await expect(why.getByTestId('limitation-line')).toHaveText(limitationLine);
  // The box carries the line, once; the footer has only the course credit.
  await expect(page.getByText(limitationLine, { exact: true })).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).not.toContainText(limitationLine);

  // Pressing the button brings the prepared answer, tagged, in place of the reason lines; the figure and the limitation line stay.
  await why.getByRole('button', { name: 'Ask the Assistant to explain' }).click();
  await expect(why.getByText('Written by the Assistant. Checked by code before it is shown.')).toBeVisible();
  await expect(why.getByTestId('reason-lines')).toHaveCount(0);
  await expect(why.getByTestId('flag-figure')).toBeVisible();
  await expect(page.getByText(limitationLine, { exact: true })).toHaveCount(1);

  // The feature chart, and every model's verdict.
  await drawnChart(page, 'How this transaction compares with usual');
  const verdicts = page.getByRole('table', { name: /nine models/ });
  await expect(verdicts.locator('tbody tr')).toHaveCount(9); // one row per model (the header row is not a row for a phone's screen reader, so rows are counted in the body)
  await expect(verdicts.getByRole('row', { name: /Deciding/ })).toContainText('Flag');
  await drawnChart(page, 'Where each model ranks it');
  await guard.noSidewaysScroll('on the transaction');
  // With a wider font (Linux, Windows, larger text) the page must still fit: buttons and tabs wrap.
  const wider = await page.addStyleTag({ content: WIDER_TEXT_CSS });
  await guard.noSidewaysScroll('on the transaction, with wider text');
  await wider.evaluate((el) => (el as Element).remove());
});
