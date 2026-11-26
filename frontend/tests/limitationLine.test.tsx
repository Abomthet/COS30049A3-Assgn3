// Mod-19: the limitation line lives in the flag box (a flagged transaction or what-if verdict), the replay's flagged
// line and the exports. The footer carries only the course credit, so the line is on a screen only where a flag is.
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

describe('the limitation line', () => {
  test('the new line is the web application\'s own', () => {
    expect(LIMITATION_LINE).toBe('Flagged as unusual for this address, not proof of wrongdoing.');
  });

  test.each([['the address overview', `#/address/${ex.mainAddress}`], ['Models', '#/models'], ['About', '#/about'], ['the first screen', '#/']])(
    '%s has no copy of it, and the footer is the course credit alone',
    async (_name, hash) => {
      start(hash);
      await screen.findByRole('heading', { level: 1 });
      expect(copies()).toHaveLength(0);
      expect(footer()).toHaveTextContent(/^COS30049 Computing Technology Innovation Project · group HCMC_COS30049\.1_4$/);
    },
  );

  test('a flagged transaction has it once, in the flag box, with the flag icon, and not in the footer', async () => {
    start(flaggedTx);
    const why = await screen.findByTestId('flag-explanation');
    const line = within(why).getByTestId('limitation-line');
    expect(line).toHaveTextContent(LIMITATION_LINE);
    expect(line.querySelector('svg.limitation-icon')).not.toBeNull();
    expect(copies()).toHaveLength(1);
    expect(footer()).not.toHaveTextContent(LIMITATION_LINE);
  });

  test('a flagged what-if verdict has it once, in the box; an unflagged one has none', async () => {
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

    await user.clear(amount);
    await user.type(amount, '0.0005');
    await waitFor(() => expect(screen.queryByTestId('flag-explanation')).toBeNull(), { timeout: 4000 });
    expect(copies()).toHaveLength(0);
  });
});
