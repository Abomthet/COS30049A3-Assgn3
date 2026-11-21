// The hero on V1: its headline is the page's h1, and the stats strip shows what E3 (and E11) say, or nothing when E3 fails.
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { ADDRESSES } from '../src/api/mock/fixtures';
import methods from '../src/api/mock/fixtures/methods.json';
import { mockControls } from '../src/api/mock/mockApi';
import { formatDay } from '../src/lib/dates';
import { formatCount } from '../src/lib/format';

const LATE = { timeout: 3000 };

describe('the hero on the first screen', () => {
  test("its headline is the page's only h1", async () => {
    window.location.hash = '#/';
    render(<App />);
    const h1 = await screen.findByRole('heading', { level: 1, name: "See what's unusual in a Bitcoin address." });
    expect(screen.getAllByRole('heading', { level: 1 })).toEqual([h1]);
    expect(screen.getByRole('textbox', { name: 'Bitcoin address' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Look up' })).toBeInTheDocument();
  });

  test('the stats strip shows the counts, the model count and the snapshot date from the API data', async () => {
    window.location.hash = '#/';
    const { container } = render(<App />);
    const strip = container.querySelector('.hero-stats') as HTMLElement;
    const txTotal = ADDRESSES.addresses.reduce((n, a) => n + a.txCount, 0);
    await waitFor(() => expect(within(strip).getByText(formatCount(txTotal))).toBeInTheDocument(), LATE);
    expect(within(strip).getByText(formatCount(ADDRESSES.snapshot.addressCount))).toBeInTheDocument();
    expect(within(strip).getByText(formatDay(ADDRESSES.snapshot.snapshotDate))).toBeInTheDocument();
    await waitFor(() => expect(within(strip).getByText('Models').nextSibling).toHaveTextContent(formatCount(methods.methods.length)), LATE);
  });

  test('the strip is gone when E3 fails', async () => {
    mockControls.offline = true;
    window.location.hash = '#/';
    const { container } = render(<App />);
    await screen.findByText("Couldn't reach the explorer service", {}, { timeout: 5000 });
    expect(container.querySelector('.hero-stats')).toBeNull();
  });
});
