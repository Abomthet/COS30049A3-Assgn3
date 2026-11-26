// The navigation's menus (disclosure navigation): a link plus a button beside it that lists places inside the section.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { api } from '../src/api/client';
import ex from '../src/api/mock/fixtures/examples.json';
import { MainNav } from '../src/components/MainNav';
import { saveWatchlistEntry } from '../src/hooks/useWatchlist';
import { PAGE_SECTIONS, paths, parseRoute } from '../src/lib/router';

const ADDRESSES = ['1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '1BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', '1CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', '1DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD'];
const [MAIN, SHORT] = [ex.mainAddress, ex.shortHistory];

function show() {
  const user = userEvent.setup();
  render(<MainNav route={parseRoute('#/')} id="main-nav" open />);
  return user;
}
const toggle = (name: string) => screen.getByRole('button', { name: `More in ${name}` });

describe('navigation menus', () => {
  test('the chevron button opens and closes the list, and the label stays a link', async () => {
    const user = show();
    const button = toggle('About');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', 'nav-panel-about');
    expect(screen.queryByRole('link', { name: 'Limits' })).not.toBeInTheDocument();
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Limits' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '#/about');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Limits' })).not.toBeInTheDocument();
  });

  test('Escape closes the list and puts focus back on the button', async () => {
    const user = show();
    await user.click(toggle('Models'));
    screen.getByRole('link', { name: 'What a flag means' }).focus();
    await user.keyboard('{Escape}');
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'false');
    expect(toggle('Models')).toHaveFocus();
  });

  test('ArrowDown on the button opens the list and moves to its first entry', async () => {
    const user = show();
    toggle('About').focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'What it shows' })).toHaveFocus();
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
    screen.getByRole('link', { name: 'What a flag means' }).focus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Watchlist' })).toHaveFocus();
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'false');
  });

  test('following an entry closes the list', async () => {
    const user = show();
    await user.click(toggle('About'));
    await user.click(screen.getByRole('link', { name: 'Limits' }));
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');
  });

  test('only one list is open at a time', async () => {
    const user = show();
    await user.click(toggle('About'));
    await user.click(toggle('Models'));
    expect(toggle('Models')).toHaveAttribute('aria-expanded', 'true');
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the About list has the seven sections, each with its own address', async () => {
    const user = show();
    await user.click(toggle('About'));
    const list = document.getElementById('nav-panel-about')!;
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(7);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(PAGE_SECTIONS.about.map((s) => paths.about(s.id)));
    expect(within(list).getByRole('link', { name: 'Limits' })).toHaveAttribute('href', '#/about?section=limits');
  });

  test('the Models list says test pattern, not planted spike', async () => {
    const user = show();
    await user.click(toggle('Models'));
    expect(screen.getByRole('link', { name: 'Test-pattern results' })).toHaveAttribute('href', '#/models?section=test');
  });

  test('the Addresses list shows up to three recent addresses only when there are some', async () => {
    const user = show();
    await user.click(toggle('Addresses'));
    expect(screen.getByRole('link', { name: 'Look up an address' })).toHaveAttribute('href', '#/?section=lookup');
    expect(screen.getByRole('link', { name: 'Addresses in the snapshot' })).toBeInTheDocument();
    expect(screen.queryByText('Recently opened')).not.toBeInTheDocument();
  });

  test('the Addresses list names the recent addresses, with the whole address available', async () => {
    localStorage.setItem('explorer.preferences.v1', JSON.stringify({ recent: ADDRESSES }));
    const user = show();
    await user.click(toggle('Addresses'));
    const list = document.getElementById('nav-panel-addresses')!;
    expect(within(list).getByText('Recently opened')).toBeInTheDocument();
    const recent = within(list).getAllByRole('link', { name: /full address/ });
    expect(recent).toHaveLength(3);
    expect(recent[0]).toHaveAccessibleName(/^1AAAAAAA…AAAAAA, full address 1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA$/);
    expect(recent[0]).toHaveAttribute('href', paths.timeline(ADDRESSES[0]));
  });
});

describe('the Watchlist menu', () => {
  test('asks the service only when it is opened, then lists what is watched', async () => {
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
    const list = document.getElementById('nav-panel-watchlist')!;
    expect(await within(list).findByRole('link', { name: 'Savings' })).toHaveAttribute('href', paths.timeline(MAIN));
    expect(within(list).getByRole('link', { name: 'Open the watchlist' })).toHaveAttribute('href', '#/watchlist');
    expect(within(list).getAllByRole('link')).toHaveLength(3);
  });

  test('says so when nothing is watched', async () => {
    const user = show();
    await user.click(toggle('Watchlist'));
    expect(await screen.findByText('Nothing watched yet')).toBeInTheDocument();
  });

  test('shows five entries and a link to all of them', async () => {
    const entries = Array.from({ length: 7 }, (_, i) => ({ address: `1${'ABCDEFG'[i].repeat(33)}`, label: `Name ${i}`, note: '', addedAt: '', updatedAt: '', summary: {} }));
    vi.spyOn(api, 'watchlist').mockResolvedValue({ entries } as never);
    const user = show();
    await user.click(toggle('Watchlist'));
    expect(await screen.findByRole('link', { name: 'All 7 on the watchlist' })).toHaveAttribute('href', '#/watchlist');
    expect(within(document.getElementById('nav-panel-watchlist')!).getAllByRole('link')).toHaveLength(7);
  });

  test('shows only the way in when the list cannot be loaded', async () => {
    vi.spyOn(api, 'watchlist').mockRejectedValue(new Error('down'));
    const user = show();
    await user.click(toggle('Watchlist'));
    const list = document.getElementById('nav-panel-watchlist')!;
    await waitFor(() => expect(within(list).queryByText('Loading…')).not.toBeInTheDocument());
    expect(within(list).getAllByRole('link')).toHaveLength(1);
  });
});

describe('opening by hover', () => {
  test('a mouse opens the list and leaving closes it after a short delay', async () => {
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: q.includes('hover: hover') }) as MediaQueryList);
    show();
    const item = toggle('About').closest('li')!;
    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    await waitFor(() => expect(toggle('About')).toHaveAttribute('aria-expanded', 'true'));
    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(toggle('About')).toHaveAttribute('aria-expanded', 'false'));
  });

  test('a list opened with the button stays open when the mouse leaves', async () => {
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({ ...real(q), matches: q.includes('hover: hover') }) as MediaQueryList);
    const user = show();
    const item = toggle('About').closest('li')!;
    fireEvent.pointerEnter(item, { pointerType: 'mouse' });
    await user.click(toggle('About'));
    fireEvent.pointerLeave(item, { pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 300));
    expect(toggle('About')).toHaveAttribute('aria-expanded', 'true');
  });
});
