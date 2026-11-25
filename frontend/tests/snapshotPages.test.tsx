// The snapshot table on V1 shows ten addresses a page, with a pager under it (28 addresses: pages 1 to 3).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { ADDRESSES } from '../src/api/mock/fixtures';

const LATE = { timeout: 3000 };

/** The address each body row of the snapshot table links to, in order. */
function rowAddresses(table: HTMLElement): string[] {
  return Array.from(table.querySelectorAll('tbody tr th a')).map((a) => (a.getAttribute('href') ?? '').split('/').pop() ?? '');
}

describe('the snapshot table pages', () => {
  test('ten rows show, Next shows rows 11 to 20, Previous is off on page 1, and aria-current marks the page', async () => {
    window.location.hash = '#/';
    render(<App />);
    const table = await screen.findByRole('table', { name: /Addresses in the snapshot/ }, LATE);
    const all = ADDRESSES.addresses.map((a) => a.address);
    await waitFor(() => expect(rowAddresses(table)).toHaveLength(10), LATE);
    expect(rowAddresses(table)).toEqual(all.slice(0, 10));

    const pager = screen.getByRole('navigation', { name: 'Snapshot pages' });
    expect(within(pager).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getByRole('button', { name: 'Page 2' })).not.toHaveAttribute('aria-current');
    expect(pager).toHaveTextContent('1–10 of 28');

    fireEvent.click(within(pager).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(rowAddresses(table)).toEqual(all.slice(10, 20)), LATE);
    expect(within(pager).getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(within(pager).getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current');
    expect(pager).toHaveTextContent('11–20 of 28');
    expect(within(pager).getByRole('button', { name: 'Previous' })).toBeEnabled();
  });
});
