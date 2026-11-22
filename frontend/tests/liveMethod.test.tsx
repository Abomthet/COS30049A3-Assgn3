// A fetched (live) address has no TxGPT scores: the menu says so, a remembered TxGPT falls back to the default with a note,
// a link that names it gets an explanation with a way out, and V1 words and orders its live-lookup offer truthfully.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const LIVE = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

/** A fetched address in the mock's world, as the live lookup leaves it. */
async function fetchLive() {
  mockControls.liveLookup = true;
  mockControls.liveStepMs = 1;
  const job = await mockApi.startLiveLookup(LIVE);
  await waitFor(async () => expect((await mockApi.liveLookup(job.id)).status).toBe('done'), { timeout: 4000 });
}
const remember = (method: string) => localStorage.setItem('explorer.preferences.v1', JSON.stringify({ theme: null, method }));
const menu = () => screen.findByRole('combobox', { name: 'Deciding method' });

function start(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

describe('a fetched address and an unavailable method', () => {
  test('a remembered TxGPT opens with the default method and a note, with no error', async () => {
    await fetchLive();
    remember('txgpt_method');
    start(`#/address/${LIVE}?method=txgpt_method`);
    expect(await screen.findByTestId('live-banner')).toBeInTheDocument();
    expect(await menu()).toHaveValue('baseline');
    expect(window.location.hash).toBe(`#/address/${LIVE}`);
    expect(screen.getByText(/has no scores for this address, so it opens with Baseline/)).toBeInTheDocument();
    expect(screen.queryByText("That isn't a valid Bitcoin address")).not.toBeInTheDocument();
  });

  test('TxGPT cannot be chosen for it, and says why', async () => {
    await fetchLive();
    start(`#/address/${LIVE}`);
    const option = within(await menu()).getByRole('option', { name: /TxGPT/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent('snapshot addresses only');
    expect(within(await menu()).getByRole('option', { name: /^Regression(?! range)/ })).toBeEnabled();
  });

  test('a link that names TxGPT explains it, and the button switches to the default method keeping the address', async () => {
    await fetchLive();
    const user = start(`#/address/${LIVE}?method=txgpt_method`);
    const panel = await screen.findByTestId('state-method');
    expect(panel).toHaveTextContent("This method can't score this address");
    expect(panel).toHaveTextContent('This method has no scores for a fetched address.');
    expect(panel).toHaveTextContent('choose another method');
    expect(screen.queryByRole('link', { name: 'Choose an address' })).not.toBeInTheDocument();
    await user.click(within(panel).getByRole('button', { name: /Use Baseline/ }));
    expect(await screen.findByTestId('live-banner')).toBeInTheDocument();
    expect(window.location.hash).toBe(`#/address/${LIVE}`);
  });

  test('the transactions tab and a day page behave the same way', async () => {
    await fetchLive();
    const user = start(`#/address/${LIVE}/transactions?method=txgpt_method`);
    await user.click(within(await screen.findByTestId('state-method')).getByRole('button', { name: /Use Baseline/ }));
    await screen.findByTestId('live-banner');
    expect(window.location.hash).toBe(`#/address/${LIVE}/transactions`);

    window.location.hash = `#/address/${LIVE}/day/2024-01-01?method=txgpt_method`;
    await user.click(await screen.findByRole('button', { name: /Use Baseline/ }));
    await waitFor(() => expect(window.location.hash).toBe(`#/address/${LIVE}/day/2024-01-01`));
    expect(screen.queryByTestId('state-method')).not.toBeInTheDocument();
  });

  test('a genuine address error keeps the generic panel', async () => {
    start('#/address/not-an-address');
    expect(await screen.findByText("That isn't a valid Bitcoin address")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose an address' })).toBeInTheDocument();
  });
});

describe("V1's live-lookup wording", () => {
  const OUTSIDE = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const ask = async () => {
    const user = start('#/');
    await user.type(await screen.findByLabelText('Bitcoin address'), OUTSIDE);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    return screen.findByTestId('state-unsupported');
  };

  test('the help line differs with live lookup on and off', async () => {
    start('#/');
    expect(await screen.findByText(/Only addresses in the snapshot have results\./)).toBeInTheDocument();
    mockControls.liveLookup = true;
    start('#/');
    expect(await screen.findByText(/any other address can be fetched from the public blockchain/)).toBeInTheDocument();
  });

  test('the unsupported panel reads: what happened, the fetch offer with its button, then the snapshot examples', async () => {
    mockControls.liveLookup = true;
    const panel = await ask();
    const text = panel.textContent ?? '';
    const [offer, button, examples, clear] = ['You can fetch its most recent', "Fetch this address's public history", 'Or open one of these snapshot addresses:', 'Clear and try another address'].map((s) => text.indexOf(s));
    expect(offer).toBeGreaterThan(0);
    expect(button).toBeGreaterThan(offer);
    expect(examples).toBeGreaterThan(button);
    expect(clear).toBeGreaterThan(examples);
    expect(text).toContain('Only the address is sent to it');
  });

  test('with live lookup off the panel has no fetch offer', async () => {
    const panel = await ask();
    expect(panel).not.toHaveTextContent('fetch');
    expect(panel).toHaveTextContent('Try one of these instead:');
  });
});
