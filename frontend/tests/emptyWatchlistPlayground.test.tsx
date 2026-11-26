// The empty-watchlist playground: default look unchanged, the variants, "pretend it is empty", gating.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { mockApi } from '../src/api/mock/mockApi';
import { DEFAULTS, parseSettings, playEnabled } from '../src/views/watchlist-empty/playSettings';

function start(hash: string) {
  window.location.hash = hash;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('settings', () => {
  test('defaults when there is no query', () => {
    expect(parseSettings('#/watchlist')).toEqual(DEFAULTS);
  });
  test('reads every key, ignores bad values, and the hash beats the stored value', () => {
    expect(parseSettings('#/watchlist?art=2&align=left&size=l&empty=1&suggest=5')).toEqual({
      art: 2, align: 'left', size: 'l', empty: true, suggest: '5',
    });
    expect(parseSettings('#/watchlist?art=9&suggest=7&size=xl')).toEqual(DEFAULTS);
    expect(parseSettings('#/watchlist?art=1', JSON.stringify({ art: '3', size: 's' }))).toMatchObject({ art: 1, size: 's' });
    expect(parseSettings('#/watchlist', '{not json')).toEqual(DEFAULTS);
  });
  test('gating: development always, production only with play in the hash query', () => {
    expect(playEnabled('#/watchlist', true)).toBe(true);
    expect(playEnabled('#/watchlist', false)).toBe(false);
    expect(playEnabled('#/watchlist?art=2', false)).toBe(false);
    expect(playEnabled('#/watchlist?play', false)).toBe(true);
    expect(playEnabled('#/watchlist?art=2&play', false)).toBe(true);
  });
});

describe('the screen', () => {
  test('with no query it is exactly the current empty state', async () => {
    start('#/watchlist');
    const panel = await screen.findByTestId('state-empty-watchlist');
    expect(panel).toHaveTextContent('No saved addresses yet');
    expect(panel).toHaveTextContent('Select the star on an address to save it.');
    expect(panel.querySelector('svg')).toBeNull();
    expect(within(panel).getByRole('link', { name: 'Choose an address' })).toHaveAttribute('href', '#/');
  });

  test.each([1, 2, 3])('art=%i draws a hidden picture under the new heading, with the same action', async (art) => {
    start(`#/watchlist?art=${art}`);
    const panel = await screen.findByTestId('state-empty-watchlist');
    const svg = panel.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg.textContent).toBe('');
    expect(within(panel).getByRole('heading', { level: 2, name: 'Nothing on your watchlist yet' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('keep it here with a note');
    expect(within(panel).getByRole('link', { name: 'Choose an address' })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeInTheDocument();
  });

  test('align and size reach the markup, and the corner panel changes the hash and is remembered', async () => {
    const user = start('#/watchlist?art=1&align=left&size=l');
    const panel = await screen.findByTestId('state-empty-watchlist');
    expect(panel).toHaveClass('ew-left', 'ew-l');
    await user.selectOptions(screen.getByLabelText('Size'), 's');
    expect(window.location.hash).toContain('size=s');
    expect(await screen.findByTestId('state-empty-watchlist')).toHaveClass('ew-s');
    expect(window.localStorage.getItem('empty-watchlist-play')).toContain('"size":"s"');
  });

  test('empty=1 shows the empty state over saved entries and deletes nothing', async () => {
    await mockApi.putWatchlist(ex.mainAddress, { label: 'Keep me', note: '' });
    const del = vi.spyOn(mockApi, 'deleteWatchlist');
    start('#/watchlist?art=1&empty=1');
    expect(await screen.findByTestId('state-empty-watchlist')).toBeInTheDocument();
    expect(screen.queryByText('Keep me')).not.toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
    expect((await mockApi.watchlist()).entries).toHaveLength(1);
    await mockApi.deleteWatchlist(ex.mainAddress);
  });

  test.each([
    ['3', 3],
    ['5', 5],
  ])('suggest=%s lists that many addresses to watch under the empty state; off lists none', async (suggest, n) => {
    start(`#/watchlist?art=1&suggest=${suggest}`);
    const panel = await screen.findByTestId('state-empty-watchlist');
    await within(panel).findByRole('heading', { level: 3, name: 'Try one of these' }, { timeout: 3000 });
    expect(within(panel).getAllByRole('button', { name: /^Watch / })).toHaveLength(n);
  });

  test('without suggest there is no list', async () => {
    start('#/watchlist?art=1');
    const panel = await screen.findByTestId('state-empty-watchlist');
    await screen.findByRole('heading', { level: 2, name: 'Nothing on your watchlist yet' });
    expect(within(panel).queryByRole('heading', { name: 'Try one of these' })).toBeNull();
  });
});
