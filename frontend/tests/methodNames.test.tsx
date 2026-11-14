// A method has one name on every screen, and it is E11's. Until E11 answers (or when it cannot) the short
// labels of lib/methods.ts stand in, so a table is never blank.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { METHODS_ANSWER } from '../src/api/mock/fixtures';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { ApiError, type MethodsResponse } from '../src/api/types';

const E11_NAME = (id: string) => METHODS_ANSWER.methods.find((m) => m.id === id)!.name;
const txHash = `#/address/${ex.flagged.address}/day/${ex.flagged.date}/tx/${ex.flagged.txid}`;

function open(hash: string) {
  window.location.hash = hash;
  render(<App />);
}

const verdictRow = (table: HTMLElement, id: string) => within(table).getByRole('rowheader', { name: new RegExp(`^${E11_NAME(id).replace(/[()]/g, '\\$&')}`) });

describe('E11 names the methods everywhere', () => {
  test('V3: the verdict table, the sentence above it and the method note use the same name', async () => {
    open(txHash);
    const table = await screen.findByRole('table', { name: /nine methods for this transaction/ });
    await waitFor(() => expect(verdictRow(table, 'baseline')).toBeInTheDocument());
    expect(verdictRow(table, 'fusion')).toHaveTextContent('Score fusion (two methods, one flag budget)');
    expect(screen.getByText(new RegExp(`deciding method \\(${E11_NAME('baseline').replace(/[()]/g, '\\$&')}\\)`, 'i'))).toBeInTheDocument();
    expect(screen.getByText(/^Method:/).closest('p')).toHaveTextContent(`Method: ${E11_NAME('baseline')}.`);
  });

  test('V4: the verdict heading and the table row say the same', async () => {
    open(`#/address/${ex.mainAddress}/what-if?direction=out`);
    await userEvent.setup().type(await screen.findByLabelText('Amount (BTC)'), '0.05');
    const card = await screen.findByTestId('verdict-card', undefined, { timeout: 3000 });
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent(`Flagged by ${E11_NAME('baseline')}`);
    const table = await screen.findByRole('table', { name: /each method for this hypothetical transaction/ });
    expect(verdictRow(table, 'baseline')).toBeInTheDocument();
  });

  test('V4: the curve chart names its method the same way, in its menu too', async () => {
    open(`#/address/${ex.mainAddress}/what-if?direction=out`);
    const menu = await screen.findByLabelText('Method drawn', undefined, { timeout: 3000 });
    await waitFor(() => expect(within(menu).getByRole('option', { name: `${E11_NAME('baseline')} (deciding)` })).toBeInTheDocument());
  });

  test('a name E11 changes is the name everywhere', async () => {
    const renamed: MethodsResponse = { ...METHODS_ANSWER, methods: METHODS_ANSWER.methods.map((m) => (m.id === 'baseline' ? { ...m, name: 'Median-distance baseline' } : m)) };
    vi.spyOn(mockApi, 'methods').mockResolvedValue(renamed);
    open(txHash);
    const table = await screen.findByRole('table', { name: /nine methods for this transaction/ });
    await waitFor(() => expect(within(table).getByRole('rowheader', { name: /^Median-distance baseline/ })).toBeInTheDocument());
    expect(screen.getByText(/^Method:/).closest('p')).toHaveTextContent('Method: Median-distance baseline.');
  });
});

describe('before E11 answers, or with it down', () => {
  test('the table lists every method by its short label, with its family', async () => {
    vi.spyOn(mockApi, 'methods').mockReturnValue(new Promise(() => {}));
    open(txHash);
    const table = await screen.findByRole('table', { name: /nine methods for this transaction/ });
    expect(within(table).getAllByRole('row')).toHaveLength(10);
    expect(within(table).getByRole('rowheader', { name: /^Robust z baseline/ })).toHaveTextContent(/^Robust z baseline(?! \(A1\))/);
    expect(within(table).getByRole('rowheader', { name: /^Score fusion/ })).toHaveTextContent(/^Score fusion(?! \()/);
    expect(within(table).getAllByText('Statistics')).toHaveLength(1);
  });

  test('when E11 fails the table still names every method', async () => {
    vi.spyOn(mockApi, 'methods').mockRejectedValue(new ApiError(500, { status: 'server_error', message: 'x' }));
    open(txHash);
    const table = await screen.findByRole('table', { name: /nine methods for this transaction/ });
    expect(within(table).getByRole('rowheader', { name: /^Local Outlier Factor/ })).toBeInTheDocument();
    // E11 has not named a flag line either, so the column shows a dash.
    expect(within(within(table).getByRole('rowheader', { name: /^Local Outlier Factor/ }).closest('tr')!).getAllByRole('cell')[2]).toHaveTextContent('—');
  });

  test('the About page counts the methods without E11', async () => {
    mockControls.offline = true;
    open('#/about');
    expect(await screen.findByRole('heading', { level: 1, name: 'About and help' })).toBeInTheDocument();
    expect(screen.getByText(/Alongside it, 8 further methods/)).toBeInTheDocument();
  });
});
