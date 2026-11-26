// "Try one of these" on the empty watchlist: the most flagged snapshot addresses, each with a Watch button.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { mockApi } from '../src/api/mock/mockApi';
import { ApiError } from '../src/api/types';
import { ServiceStatusProvider } from '../src/hooks/useServiceStatus';
import { SettingsProvider } from '../src/hooks/useSettings';
import { ToastProvider } from '../src/hooks/useToasts';
import { shortAddress } from '../src/lib/format';
import { settings } from '../src/lib/settings';
import { SuggestedAddresses } from '../src/views/watchlist-empty/SuggestedAddresses';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

function mount(count: 3 | 5) {
  return render(
    <ServiceStatusProvider>
      <SettingsProvider>
        <ToastProvider>
          <SuggestedAddresses count={count} />
        </ToastProvider>
      </SettingsProvider>
    </ServiceStatusProvider>,
  );
}

/** The order the navigation's "Most flagged" menu uses. */
async function expected() {
  const { addresses } = await mockApi.listAddresses({});
  return addresses
    .filter((a) => a.flaggedCount > 0)
    .sort((a, b) => b.flaggedCount - a.flaggedCount || a.address.localeCompare(b.address));
}

const hrefs = (list: Array<{ address: string }>) => list.map((a) => `#/address/${encodeURIComponent(a.address)}`);
const rowLinks = (list: HTMLElement) => within(list).getAllByRole('listitem').map((li) => within(li).getAllByRole('link')[0].getAttribute('href'));

describe('SuggestedAddresses', () => {
  test.each([3, 5] as const)('shows the %i most flagged addresses in order, with a heading and a link to the list', async (count) => {
    const top = (await expected()).slice(0, count);
    mount(count);
    const list = await screen.findByRole('list');
    expect(screen.getByRole('heading', { level: 3, name: 'Try one of these' })).toBeInTheDocument();
    expect(rowLinks(list)).toEqual(hrefs(top));
    top.forEach((a, i) => {
      const row = within(list).getAllByRole('listitem')[i];
      expect(row.textContent).toContain(`${a.flaggedCount.toLocaleString('en')} unusual`);
      expect(within(row).getByRole('button', { name: `Watch ${shortAddress(a.address, 8, 6)}` })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: 'Browse all addresses' })).toHaveAttribute('href', '#/?section=snapshot');
    expect(document.body.textContent ?? '').not.toMatch(banned);
  });

  test('skips an address already on the watchlist', async () => {
    const all = await expected();
    await mockApi.putWatchlist(all[0].address, { label: '', note: '' });
    mount(3);
    const list = await screen.findByRole('list');
    expect(rowLinks(list)).toEqual(hrefs(all.slice(1, 4)));
  });

  test('Watch saves the address on the watchlist and removes its row', async () => {
    const all = await expected();
    const user = userEvent.setup();
    mount(3);
    const first = (await screen.findAllByRole('button', { name: /^Watch / }))[0];
    expect(first).toHaveAccessibleName(`Watch ${shortAddress(all[0].address, 8, 6)}`);
    await user.click(first);
    await waitFor(async () => expect((await mockApi.watchlist({})).entries.map((e) => e.address)).toEqual([all[0].address]));
    await waitFor(() => expect(rowLinks(screen.getByRole('list'))).toEqual(hrefs(all.slice(1, 4))));
    expect(screen.getByText(/to the watchlist\./)).toBeInTheDocument();
  });

  test('renders nothing when the address list cannot be loaded', async () => {
    const spy = vi.spyOn(mockApi, 'listAddresses').mockRejectedValue(new ApiError(500, { status: 'internal', message: 'down' } as never));
    const { container } = mount(3);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('.suggest')).toBeNull();
    expect(screen.queryByText('Try one of these')).toBeNull();
    spy.mockRestore();
  });
});
