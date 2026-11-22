// The wording pass on V2's overview (R5): the "{count} days" headline, the day rows, the empty list, the tiles' sub-lines,
// the live banner line and the illustrative tag, each with the timeline the mock would not give on its own.
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { mockApi } from '../src/api/mock/mockApi';
import type { LiveInfo, TimelineResponse } from '../src/api/types';

const FETCHED = '2026-11-21T13:28:00Z';

async function open(patch: (real: TimelineResponse) => TimelineResponse, address = ex.mainAddress) {
  const real = await mockApi.timeline(address);
  vi.spyOn(mockApi, 'timeline').mockResolvedValue(patch(real));
  window.location.hash = `#/address/${address}`;
  render(<App />);
  await screen.findByRole('heading', { level: 1, name: address });
}

const withDays = (real: TimelineResponse, flagged: Array<[string, number, number]>): TimelineResponse => ({
  ...real,
  days: flagged.map(([date, txCount, flaggedCount]) => ({ date, txCount, flaggedCount })),
  totals: { ...real.totals, flaggedDays: flagged.length, flaggedCount: flagged.reduce((n, d) => n + d[2], 0) },
});
const live = (over: Partial<LiveInfo>): LiveInfo => ({ fetchedAt: FETCHED, transactions: 500, total: 1164, maxTx: 500, truncated: true, ...over });
const tile = (label: string) => screen.getByText(label, { selector: '.stat-label' }).closest('.stat')!;

afterEach(() => vi.restoreAllMocks());

describe('"Days with unusual transactions"', () => {
  test('many days: the count is the headline, set against the whole active period, newest first', async () => {
    await open((real) => withDays(real, [['2025-03-01', 4, 1], ['2025-03-02', 2, 1], ['2025-03-03', 3, 2]]));
    const section = (await screen.findByRole('heading', { name: 'Days with unusual transactions' })).closest('section')!;
    const headline = within(section).getByTestId('flagged-headline');
    expect(headline.querySelector('.stat-value')).toHaveTextContent('3 days');
    expect(headline.querySelector('.stat-note')).toHaveTextContent('with unusual transactions · 16 May 2024 – 19 Oct 2026');
    expect(within(section).getByText('Newest first')).toBeInTheDocument();
    expect(section).not.toHaveTextContent('Open one to see');
    expect(within(section).getAllByRole('link')[0]).toHaveTextContent('3 Mar 2025');
  });

  test('one day reads "1 day"', async () => {
    await open((real) => withDays(real, [['2025-03-01', 4, 1]]));
    const headline = await screen.findByTestId('flagged-headline');
    expect(headline.querySelector('.stat-value')).toHaveTextContent(/^1 day$/);
  });

  test('no days: "No unusual days." and a way on, and no headline', async () => {
    await open((real) => withDays(real, []));
    const section = (await screen.findByRole('heading', { name: 'Days with unusual transactions' })).closest('section')!;
    expect(section).toHaveTextContent('No unusual days.');
    expect(within(section).getByRole('link', { name: 'Browse all transactions' })).toHaveAttribute('href', `#/address/${ex.mainAddress}/transactions`);
    expect(screen.queryByTestId('flagged-headline')).not.toBeInTheDocument();
  });

  test('a row is the date, the short reason on its own line, and "{flagged} of {txCount}" at the end, in one link', async () => {
    await open((real) => withDays(real, [['2024-07-11', 4, 1]]));
    const link = await screen.findByRole('link', { name: /11 Jul 2024/ });
    await waitFor(() => expect(link.querySelector('.day-link-reason')).not.toBeNull());
    const parts = Array.from(link.children).map((c) => c.className);
    expect(parts).toEqual(['day-link-date', 'day-link-reason', 'day-link-count']);
    expect(link.querySelector('.day-link-date')).toHaveTextContent('11 Jul 2024');
    expect(link.querySelector('.day-link-reason')!.textContent).toMatch(/\S/);
    expect(link.querySelector('.day-link-count')).toHaveTextContent(/^1 of 4/);
    expect(link.querySelector('svg')).toBeNull(); // no decorative icon
    expect(link.parentElement!.parentElement!.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('the tiles', () => {
  test('all scored: nothing under "Scored"', async () => {
    await open((real) => ({ ...real, totals: { ...real.totals, scoredCount: real.totals.txCount } }));
    expect(tile('Scored')).toHaveTextContent(/^Scored 377 of 377$/);
  });

  test('some unscored: "the first {n} are too early to score"', async () => {
    await open((real) => ({ ...real, totals: { ...real.totals, scoredCount: real.totals.txCount - 10 } }));
    expect(tile('Scored')).toHaveTextContent('367 of 377 the first 10 are too early to score');
  });

  test('a fetched address that was cut off: "the oldest {n} ..."', async () => {
    await open((real) => ({ ...real, live: live({ transactions: real.totals.txCount, total: 1164 }), totals: { ...real.totals, scoredCount: real.totals.txCount - 10 } }));
    expect(tile('Scored')).toHaveTextContent('the oldest 10 are too early to score');
  });

  test('Active gives the days, Unusual gives the days and no model name', async () => {
    await open((real) => real);
    expect(tile('Active')).toHaveTextContent('16 May 2024 – 19 Oct 2026 887 days');
    expect(tile('Unusual')).toHaveTextContent(/^Unusual 3 on 3 days$/);
  });

  test('a short-history address shows "—" for Unusual and no day list', async () => {
    window.location.hash = `#/address/${ex.shortHistory}`;
    render(<App />);
    await screen.findByTestId('state-insufficient');
    expect(tile('Unusual')).toHaveTextContent(/^Unusual —$/);
    expect(screen.queryByTestId('flagged-headline')).not.toBeInTheDocument();
  });
});

describe('the live banner and the header', () => {
  test('cut off: one line with "latest {n} of {total}", and no second sentence', async () => {
    await open((real) => ({ ...real, live: live({ transactions: 500, total: 1164 }) }));
    const banner = await screen.findByTestId('live-banner');
    expect(banner.querySelectorAll('p')).toHaveLength(1);
    expect(banner).toHaveTextContent('Live data · fetched 21 Nov 2026, 13:28 UTC · latest 500 of 1,164 transactions');
    expect(banner).not.toHaveTextContent('not part of the snapshot');
  });

  test('not cut off: "{n} transactions"', async () => {
    await open((real) => ({ ...real, live: live({ transactions: 377, total: 377, truncated: false }) }));
    const banner = await screen.findByTestId('live-banner');
    expect(banner.querySelector('p')!.textContent).toBe('Live data · fetched 21 Nov 2026, 13:28 UTC · 377 transactions');
  });

  test('the source line is gone; an illustrative snapshot keeps a small tag by the title', async () => {
    await open((real) => ({ ...real, snapshot: { ...real.snapshot, illustrative: true } }));
    expect(screen.queryByText(/Source: /)).not.toBeInTheDocument();
    expect(document.querySelector('.address-heading .tag-illustrative')).toHaveTextContent('Illustrative data');
  });

  test('a real snapshot has no tag', async () => {
    await open((real) => ({ ...real, snapshot: { ...real.snapshot, illustrative: false } }));
    expect(document.querySelector('.tag-illustrative')).toBeNull();
  });
});
