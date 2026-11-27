// The navigation's menus (disclosure navigation): a link plus a button beside it that opens the section's menu. On a wide
// screen the menu is one full-width flyout shared by the four tabs; on a phone it opens in place. The contents come in a
// module loaded on first use, so the tests wait for them.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { api } from '../src/api/client';
import ex from '../src/api/mock/fixtures/examples.json';
import type { AddressSummary } from '../src/api/types';
import { MainNav } from '../src/components/MainNav';
import { saveWatchlistEntry } from '../src/hooks/useWatchlist';
import { METHODS } from '../src/lib/methods';
import { PAGE_SECTIONS, paths, parseRoute } from '../src/lib/router';

const ADDRESSES = ['1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', '1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', '1DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'];
const [MAIN, SHORT] = [ex.mainAddress, ex.shortHistory];

// A phone: the menus open in place.
function show() {
  const user = userEvent.setup();
  render(<MainNav route={parseRoute('#/')} id="main-nav" open />);
  return user;
}
// A wide screen with a mouse: the shared flyout, the scrim, and hovering. The flyout's code comes when the pointer reaches the bar.
async function showWide() {
  const real = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: q.includes('min-width: 720px') }) as MediaQueryList);
  const user = show();
  fireEvent.pointerEnter(screen.getByRole('navigation'));
  await waitFor(() => expect(document.querySelector('.nav-flyout')).not.toBeNull());
  return user;
}
const toggle = (name: string) => screen.getByRole('button', { name: `More in ${name}` });
const panel = (key: string) => document.getElementById(`nav-panel-${key}`)!;

describe('navigation menus', () => {
  test('the chevron button opens and closes the menu, and the label stays a link', async () => {
    const user = show();
    const button = toggle('About');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'nav-panel-about');
    expect(screen.queryByRole('link', { name: 'Limits' })).not.toBeInTheDocument();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('link', { name: 'Limits' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '#/about');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Limits' })).not.toBeInTheDocument();
  });

  test('Escape closes the menu and puts focus back on the button', async () => {
    const user = show();
    await user.click(toggle('Models'));
    (await screen.findByRole('link', { name: 'What a flag means' })).focus();
    await user.keyboard('{Escape}');
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('Models')).toHaveFocus();
  });

  test('ArrowDown on the button opens the menu and moves to its first entry', async () => {
    const user = show();
    toggle('About').focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('link', { name: 'How a flag is decided' })).toHaveFocus());
  });

  test('a change of the address closes it, and so does a click outside or tabbing away', async () => {
    const user = show();
    await user.click(toggle('About'));
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')));
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle('About'));
    await user.click(document.body);
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle('Models'));
    (await screen.findByRole('link', { name: /^TxGPT/ })).focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveFocus();
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'false');
  });

  test('following an entry closes the menu', async () => {
    const user = show();
    await user.click(toggle('About'));
    await user.click(await screen.findByRole('link', { name: 'Limits' }));
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');
  });

  test('only one menu is open at a time', async () => {
    const user = show();
    await user.click(toggle('About'));
    await user.click(toggle('Models'));
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'true');
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('the About menu', () => {
  test('shows the three main places, and See more adds the other four, each with its own address', async () => {
    const user = show();
    await user.click(toggle('About'));
    await screen.findByRole('link', { name: 'Limits' });
    const links = () => within(panel('about')).getAllByRole('link');
    expect(links().map((a) => a.getAttribute('href'))).toEqual([paths.about('decided'), paths.about('unusual'), paths.about('limits')]);
    expect(links().map((a) => a.textContent)).toEqual(['How a flag is decided', 'What "unusual" means', 'Limits']);

    const more = screen.getByRole('button', { name: 'See more' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveTextContent('See less');
    expect(more.getAttribute('aria-controls')).toBe(within(panel('about')).getByRole('list', { name: 'More about the explorer' }).closest('.nav-col')!.id);
    const rest = ['shows', 'charts', 'data', 'keys'];
    expect(links().map((a) => a.getAttribute('href'))).toEqual([...['decided', 'unusual', 'limits'], ...rest].map((id) => paths.about(id)));
    expect(
      links()
        .slice(3)
        .map((a) => a.textContent),
    ).toEqual(rest.map((id) => PAGE_SECTIONS.about.find((s) => s.id === id)!.label));
    // Every one of the seven sections is there.
    expect(new Set(links().map((a) => a.getAttribute('href')))).toEqual(new Set(PAGE_SECTIONS.about.map((s) => paths.about(s.id))));

    await user.click(more);
    expect(more).toHaveTextContent('See more');
    expect(links()).toHaveLength(3);
  });

  test('is folded again after the menu has been closed', async () => {
    const user = show();
    await user.click(toggle('About'));
    await user.click(await screen.findByRole('button', { name: 'See more' }));
    await user.click(toggle('About'));
    await user.click(toggle('About'));
    expect(await screen.findByRole('button', { name: 'See more' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(panel('about')).getAllByRole('link')).toHaveLength(3);
  });
});

describe('the Models menu', () => {
  test('says test pattern, not planted spike, and lists the three places on the page', async () => {
    const user = show();
    await user.click(toggle('Models'));
    expect(await screen.findByRole('link', { name: 'Test-pattern results' })).toHaveAttribute('href', '#/models?section=test');
    expect(screen.getByRole('link', { name: 'Compare the nine models' })).toHaveAttribute('href', '#/models?section=models');
    expect(screen.getByRole('link', { name: 'What a flag means' })).toHaveAttribute('href', '#/models?section=flag');
  });

  test('lists the nine models, each linking to its own card', async () => {
    const user = show();
    await user.click(toggle('Models'));
    await screen.findByRole('link', { name: 'Compare the nine models' });
    const list = within(panel('models')).getByRole('list', { name: 'The models' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(9);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(METHODS.map((m) => `#/models?section=model-${m.id}`));
    expect(within(list).getByRole('link', { name: /^Local outlier,\s*Outlier detection$/ })).toHaveAttribute('href', '#/models?section=model-lof');
  });
});

describe('the Addresses menu', () => {
  const summary = (address: string, flaggedCount: number): AddressSummary => ({
    address,
    firstSeen: '2020-01-01',
    lastSeen: '2020-02-01',
    txCount: 10,
    scoredCount: 10,
    flaggedCount,
    history: 'sufficient',
    kind: 'p2pkh',
    source: 'snapshot',
  });
  const listing = (flags: number[]) => ({ snapshot: {} as never, addresses: flags.map((n, i) => summary(ADDRESSES[i], n)) });

  test('asks for the addresses only when it is opened', async () => {
    const spy = vi.spyOn(api, 'listAddresses');
    const user = show();
    await user.click(toggle('Models'));
    await screen.findByRole('link', { name: 'Compare the nine models' });
    expect(spy).not.toHaveBeenCalled();
    await user.click(toggle('Addresses'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });

  test('offers the two ways in, and counts the addresses once they are known', async () => {
    vi.spyOn(api, 'listAddresses').mockResolvedValue(listing([1, 2, 3, 4]) as never);
    const user = show();
    await user.click(toggle('Addresses'));
    expect(await screen.findByRole('link', { name: 'Look up an address' })).toHaveAttribute('href', '#/?section=lookup');
    expect(await screen.findByRole('link', { name: 'Browse all 4 addresses' })).toHaveAttribute('href', '#/?section=snapshot');
    expect(screen.queryByText('Recently opened')).not.toBeInTheDocument();
  });

  test('"Most flagged" shows the three with the most flags, most first, ties by address', async () => {
    vi.spyOn(api, 'listAddresses').mockResolvedValue(listing([2, 9, 2, 0]) as never);
    const user = show();
    await user.click(toggle('Addresses'));
    const list = await within(panel('addresses')).findByRole('list', { name: 'Most flagged' });
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([paths.timeline(ADDRESSES[1]), paths.timeline(ADDRESSES[0]), paths.timeline(ADDRESSES[2])]);
    expect(links[0]).toHaveAccessibleName(/^1BBBBBBB…BBBBBB, full address 1B+,\s*9 flags$/);
    expect(links[0]).toHaveTextContent('9 flags');
    expect(links[1]).toHaveTextContent('2 flags');
  });

  test('"Most flagged" is left out when the addresses cannot be loaded', async () => {
    vi.spyOn(api, 'listAddresses').mockRejectedValue(new Error('down'));
    const user = show();
    await user.click(toggle('Addresses'));
    await screen.findByRole('link', { name: 'Browse all addresses' });
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
    expect(screen.queryByText('Most flagged')).not.toBeInTheDocument();
  });

  test('names up to three recent addresses, with the whole address available, only when there are some', async () => {
    localStorage.setItem('explorer.preferences.v1', JSON.stringify({ recent: ADDRESSES }));
    const user = show();
    await user.click(toggle('Addresses'));
    const recent = await within(panel('addresses')).findByRole('list', { name: 'Recently opened' });
    const links = within(recent).getAllByRole('link', { name: /full address/ });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/^1AAAAAAA…AAAAAA, full address 1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$/);
    expect(links[0]).toHaveAttribute('href', paths.timeline(ADDRESSES[0]));
  });
});

describe('the Watchlist menu', () => {
  test('asks the service only when it is opened, then lists what is watched with a quiet line under each', async () => {
    const spy = vi.spyOn(api, 'watchlist');
    await saveWatchlistEntry(MAIN, { label: 'Savings', note: '' });
    await saveWatchlistEntry(SHORT, { label: '', note: '' });
    const user = show();
    expect(spy).not.toHaveBeenCalled();
    await user.click(toggle('Addresses'));
    await user.click(toggle('Models'));
    expect(spy).not.toHaveBeenCalled();
    await user.click(toggle('Watchlist'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const list = panel('watchlist');
    const saved = await within(list).findByRole('link', { name: /^Savings/ });
    expect(saved).toHaveAttribute('href', paths.timeline(MAIN));
    expect(saved).toHaveTextContent(/flags?$/);
    expect(within(list).getByRole('link', { name: 'Open the watchlist' })).toHaveAttribute('href', '#/watchlist');
    // The entry without a label is named by its short address, with the flag count beside it.
    expect(within(list).getAllByRole('link')).toHaveLength(3);
    expect(within(list).getByTitle(SHORT)).toHaveAttribute('href', paths.timeline(SHORT));
  });

  test('says so when nothing is watched', async () => {
    const user = show();
    await user.click(toggle('Watchlist'));
    expect(await screen.findByText('Nothing watched yet. Use the star beside an address to add it.')).toBeInTheDocument();
  });

  test('shows five entries and a link to all of them', async () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({ address: `1${'ABCDEFG'[i].repeat(33)}`, label: `Name ${i}`, note: '', addedAt: '', updatedAt: '', summary: {} }));
    vi.spyOn(api, 'watchlist').mockResolvedValue({ entries } as never);
    const user = show();
    await user.click(toggle('Watchlist'));
    expect(await screen.findByRole('link', { name: 'All 7 on the watchlist' })).toHaveAttribute('href', '#/watchlist');
    expect(within(panel('watchlist')).getAllByRole('link')).toHaveLength(7);
  });

  test('shows only the way in when the list cannot be loaded', async () => {
    vi.spyOn(api, 'watchlist').mockRejectedValue(new Error('down'));
    const user = show();
    await user.click(toggle('Watchlist'));
    const list = panel('watchlist');
    await within(list).findByRole('link', { name: 'Open the watchlist' });
    await waitFor(() => expect(within(list).queryByText('Loading…')).not.toBeInTheDocument());
    expect(within(list).getAllByRole('link')).toHaveLength(1);
  });
});

describe('the wide flyout', () => {
  const flyout = () => document.querySelector('.nav-flyout')!;
  const scrim = () => document.querySelector('.nav-scrim')!;

  test('is not built until the pointer or focus reaches the bar', () => {
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: q.includes('min-width: 720px') }) as MediaQueryList);
    show();
    expect(flyout()).toBeNull();
    expect(scrim()).toBeNull();
  });

  test('is one surface with the four panels in it, closed to the keyboard and screen readers until a menu opens', async () => {
    const user = await showWide();
    expect(flyout()).not.toHaveAttribute('data-open');
    expect(flyout().querySelectorAll('a')).toHaveLength(0);
    expect(flyout().querySelector('[aria-hidden="true"]')).not.toBeNull();
    await user.click(toggle('Models'));
    await waitFor(() => expect(flyout()).toHaveAttribute('data-open'));
    expect(await within(flyout() as HTMLElement).findByRole('link', { name: 'Compare the nine models' })).toBeVisible();
  });

  test('keeps the same surface when another tab is opened, and swaps only the content', async () => {
    const user = await showWide();
    await user.click(toggle('Models'));
    await screen.findByRole('link', { name: 'Compare the nine models' });
    const surface = flyout();
    await user.click(toggle('About'));
    expect(flyout()).toBe(surface);
    expect(surface).toHaveAttribute('data-open');
    expect(await screen.findByRole('link', { name: 'Limits' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Compare the nine models' })).not.toBeInTheDocument();
    expect(panel('models')).toHaveAttribute('hidden');
  });

  test('dims the page with a scrim that is out of the accessibility tree and closes the menu when clicked', async () => {
    const user = await showWide();
    expect(scrim()).toHaveAttribute('aria-hidden', 'true');
    expect(scrim().parentElement).toBe(document.body);
    expect(scrim()).not.toHaveAttribute('data-open');
    await user.click(toggle('About'));
    await waitFor(() => expect(scrim()).toHaveAttribute('data-open'));
    fireEvent.pointerDown(scrim());
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');
    expect(scrim()).not.toHaveAttribute('data-open');
  });

  test('a closed flyout holds no links once it has folded away', async () => {
    const user = await showWide();
    await user.click(toggle('About'));
    await screen.findByRole('link', { name: 'Limits' });
    await user.click(toggle('About'));
    await waitFor(() => expect(flyout().querySelectorAll('a')).toHaveLength(0));
  });

  test('Tab goes from the button into the menu, and from its last entry to the next tab', async () => {
    const user = await showWide();
    toggle('About').focus();
    await user.keyboard('{Enter}');
    const first = await screen.findByRole('link', { name: 'How a flag is decided' });
    await user.tab();
    expect(first).toHaveFocus();
    await user.tab({ shift: true });
    expect(toggle('About')).toHaveFocus();
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggle('Models'));
    (await screen.findByRole('link', { name: /^TxGPT/ })).focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveFocus();
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'false');
  });

  test("Shift+Tab from the next tab goes to the open menu's last entry, mirroring the forward order", async () => {
    const user = await showWide();
    await user.click(toggle('Models'));
    const last = await screen.findByRole('link', { name: /^TxGPT/ });
    const entries = Array.from(panel('models').querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
    expect(entries[entries.length - 1]).toBe(last);
    const next = screen.getByRole('link', { name: 'Watchlist' });
    // The menu was opened by the pointer while the keyboard sits on the next tab's link (focusing it would close the menu).
    fireEvent.keyDown(next, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  test('Escape closes it and returns to the button; ArrowDown goes in', async () => {
    const user = await showWide();
    toggle('Models').focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Compare the nine models' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(toggle('Models')).toHaveFocus();
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the Watchlist is not requested until its menu opens, here too', async () => {
    const spy = vi.spyOn(api, 'watchlist');
    const user = await showWide();
    await user.click(toggle('About'));
    await screen.findByRole('link', { name: 'Limits' });
    expect(spy).not.toHaveBeenCalled();
    await user.click(toggle('Watchlist'));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  });
});

describe('opening by hover', () => {
  test('a mouse opens the menu and leaving closes it after a short delay', async () => {
    await showWide();
    const item = toggle('About').closest('li')!;
    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    await waitFor(() => expect(toggle('About')).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(toggle('About')).toHaveAttribute('aria-expanded', 'false'));
  });

  test('moving from the tab into the flyout keeps it open', async () => {
    await showWide();
    const item = toggle('About').closest('li')!;
    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    await waitFor(() => expect(toggle('About')).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    fireEvent.pointerEnter(document.querySelector('.nav-flyout')!, { pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 300));
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'true');
  });

  test('a menu opened with the button stays open when the mouse leaves', async () => {
    const user = await showWide();
    const item = toggle('About').closest('li')!;
    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    await user.click(toggle('About'));
    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 300));
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'true');
  });
});
