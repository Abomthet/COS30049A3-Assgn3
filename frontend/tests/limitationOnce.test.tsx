// Mod-19: the limitation line shows once per screen. The footer carries it on every screen except while
// the flag box (a flagged transaction or what-if verdict) or the replay's flagged line shows it; then
// the footer leaves its copy out, so it is read once (and a screen reader hears it once).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { LIMITATION_LINE } from '../src/lib/settings';

const OLD_LINE = 'Unusual activity requires investigation; it does not indicate wrongdoing.';

function start(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

const footer = () => screen.getByRole('contentinfo');
const copies = () => screen.queryAllByText(LIMITATION_LINE);
const flaggedTx = `#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}`;

afterEach(() => {
  expect(document.body.textContent ?? '').not.toContain(OLD_LINE);
});

describe('the limitation line, once per screen', () => {
  test('the new line is the web application\'s own', () => {
    expect(LIMITATION_LINE).toBe('Worth investigating, not proof of wrongdoing.');
  });

  test('an ordinary screen (the address overview) has it in the footer, once', async () => {
    start(`#/address/${ex.mainAddress}`);
    await screen.findByRole('heading', { level: 1, name: ex.mainAddress });
    expect(within(footer()).getByText(LIMITATION_LINE)).toBeInTheDocument();
    expect(copies()).toHaveLength(1);
  });

  test.each([['Models', '#/models'], ['About', '#/about'], ['the first screen', '#/']])('%s has it in the footer and nowhere else', async (_name, hash) => {
    start(hash);
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(within(footer()).getByText(LIMITATION_LINE)).toBeInTheDocument());
    expect(copies()).toHaveLength(1);
  });

  test('a flagged transaction has it once, in the flag box, and the footer leaves its copy out', async () => {
    start(flaggedTx);
    const why = await screen.findByTestId('flag-explanation');
    expect(within(why).getByTestId('limitation-line')).toHaveTextContent(LIMITATION_LINE);
    expect(copies()).toHaveLength(1);
    expect(footer()).not.toHaveTextContent(LIMITATION_LINE);
    expect(footer().querySelector('.footer-limitation')).toBeNull(); // not rendered, not just hidden
  });

  test('the line comes back in the footer after navigating away from a flagged transaction', async () => {
    const user = start(flaggedTx);
    await screen.findByTestId('flag-explanation');
    expect(footer()).not.toHaveTextContent(LIMITATION_LINE);
    await user.click(screen.getByRole('link', { name: 'Bitcoin Address Activity Explorer' }));
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(within(footer()).getByText(LIMITATION_LINE)).toBeInTheDocument());
    expect(copies()).toHaveLength(1);
  });

  test('a flagged what-if verdict has it once, in the box; an unflagged one leaves it in the footer', async () => {
    window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
    const user = userEvent.setup();
    render(<App />);
    const amount = await screen.findByLabelText('Amount (BTC)');
    await user.clear(amount);
    await user.type(amount, '0.05');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Time of day'), { target: { value: '12:00' } });
    const card = await screen.findByTestId('verdict-card', undefined, { timeout: 4000 });
    expect(within(card).getByTestId('flag-explanation')).toBeInTheDocument();
    expect(copies()).toHaveLength(1);
    expect(footer()).not.toHaveTextContent(LIMITATION_LINE);

    await user.clear(amount);
    await user.type(amount, '0.0005');
    await waitFor(() => expect(screen.queryByTestId('flag-explanation')).toBeNull(), { timeout: 4000 });
    await waitFor(() => expect(within(footer()).getByText(LIMITATION_LINE)).toBeInTheDocument());
    expect(copies()).toHaveLength(1);
  });
});
