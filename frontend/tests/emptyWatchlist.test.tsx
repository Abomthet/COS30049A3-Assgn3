// The empty watchlist: the picture, the words, the action, three addresses to start with; and no leftovers of the old looks.
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { mockApi } from '../src/api/mock/mockApi';

function start(hash: string) {
  window.location.hash = hash;
  render(<App />);
}

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('the empty watchlist', () => {
  test('a hidden picture with no text, then the heading, the line and the action', async () => {
    start('#/watchlist');
    const panel = await screen.findByTestId('state-empty-watchlist');
    const svg = panel.querySelector('svg')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg.textContent).toBe('');
    expect(svg.querySelector('text, title, script, foreignObject, image')).toBeNull();
    expect(within(panel).getByRole('heading', { level: 2, name: 'Nothing on your watchlist yet' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('Press the star on an address to keep it here with a note.');
    expect(within(panel).getByRole('link', { name: 'Choose an address' })).toHaveAttribute('href', '#/');
    expect(screen.getByRole('heading', { level: 1, name: 'Watchlist' })).toBeInTheDocument();
  });

  test('three addresses to watch are offered beneath', async () => {
    start('#/watchlist');
    const panel = await screen.findByTestId('state-empty-watchlist');
    await within(panel).findByRole('heading', { level: 3, name: 'Try one of these' }, { timeout: 3000 });
    expect(within(panel).getAllByRole('button', { name: /^Watch / })).toHaveLength(3);
  });

  test('with saved entries there is no empty state', async () => {
    await mockApi.putWatchlist(ex.mainAddress, { label: 'Keep me', note: '' });
    start('#/watchlist');
    expect(await screen.findByText('Keep me')).toBeInTheDocument();
    expect(screen.queryByTestId('state-empty-watchlist')).toBeNull();
    await mockApi.deleteWatchlist(ex.mainAddress);
  });

  test('old play links are ignored: the normal list, no corner panel', async () => {
    await mockApi.putWatchlist(ex.mainAddress, { label: 'Keep me', note: '' });
    start('#/watchlist?play&art=1&empty=1');
    expect(await screen.findByText('Keep me')).toBeInTheDocument();
    expect(screen.queryByTestId('state-empty-watchlist')).toBeNull();
    expect(screen.queryByLabelText('Size')).toBeNull();
    await mockApi.deleteWatchlist(ex.mainAddress);
  });
});
