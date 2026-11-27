// The replay (S-06): an address's history played forward over rows already loaded. Time is controlled here: the
// rows are loaded with the real clock, then the timers are faked, so a second of replay is one call.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { RECORDED } from '../src/api/mock/fixtures';
import { mockApi } from '../src/api/mock/mockApi';
import { countsOf, daysOf, timelineAfter } from '../src/lib/replay';
import { settings } from '../src/lib/settings';
import { fakePlotly } from './plotlyFake';

const main = RECORDED[0];
const rows = main.transactionPages.flatMap((p) => p.transactions).sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
const firstFlagged = rows.findIndex((r) => r.status === 'flagged');

afterEach(() => {
  vi.useRealTimers();
});

describe('the arithmetic', () => {
  test('replaying every row gives exactly the days and totals the service gave for the whole history', () => {
    const view = timelineAfter(main.timeline, rows, rows.length);
    expect(view.days).toEqual(main.timeline.days);
    expect(view.totals).toEqual(main.timeline.totals);
    expect(view.range).toEqual(main.timeline.range);
  });

  test('a part of the history counts only the rows shown', () => {
    const part = rows.slice(0, 10);
    const days = daysOf(part);
    expect(days.reduce((n, d) => n + d.txCount, 0)).toBe(10);
    expect(countsOf(part, days)).toMatchObject({ txCount: 10, flaggedCount: 0, flaggedDays: 0 });
  });
});

/** Opens the overview of the running example and its replay, once the rows have arrived; the clock is then fake. */
async function openReplay() {
  window.location.hash = `#/address/${ex.mainAddress}`;
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open the replay' }));
  await screen.findByRole('button', { name: 'Play' });
  vi.useFakeTimers();
}

const tile = (name: string) => screen.getByText(name, { selector: 'dt' }).nextElementSibling!;
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const drawOf = (title: string) =>
  fakePlotly.chartDraws().filter((d) => d.el.closest('figure')?.querySelector('h2')?.textContent === title).at(-1)!;
const pointsIn = (title: string) => (drawOf(title).data as Array<{ x: unknown[] }>).reduce((n, t) => n + t.x.length, 0);

describe('the controls', () => {
  test('is labelled as a replay of recorded history and never as live; nothing is asked for until it is opened', async () => {
    const asked = vi.spyOn(mockApi, 'transactions');
    window.location.hash = `#/address/${ex.mainAddress}`;
    render(<App />);
    const card = (await screen.findByRole('heading', { name: 'Replay' })).closest('section')!;
    await screen.findByRole('heading', { name: 'Days with unusual transactions' });
    expect(card.textContent).not.toMatch(/\blive\b/i);
    expect(card).toHaveTextContent("Play this address's history forward, one transaction at a time.");
    // The look-ahead point is a closed disclosure, styled like the charts' "How to read this chart".
    const guide = within(card).getByText('How the replay avoids look-ahead').closest('details')!;
    expect(guide).not.toHaveAttribute('open');
    expect(guide).toHaveClass('pchart-guide');
    expect(guide).toHaveTextContent('Each flag appears when its transaction does, using only what came before it.');
    expect(asked.mock.calls.every(([, query]) => query.pageSize !== 200 || query.status?.[0] === 'flagged')).toBe(true);
  });

  test('Play runs at the chosen speed: 20 a second adds twenty transactions to the tiles, to G2 and to G1, and asks for nothing', async () => {
    await openReplay();
    const asked = vi.spyOn(mockApi, 'transactions');
    expect(settings.web.replay.speeds).toEqual([1, 5, 20]);
    expect(screen.getByRole('button', { name: '5 a second' })).toHaveAttribute('aria-pressed', 'true');
    press('20 a second');
    press('Play');
    await advance(1000);
    expect(tile('Transactions so far')).toHaveTextContent('20');
    expect(screen.getByRole('progressbar', { name: 'Replay progress' })).toHaveAttribute('value', '20');
    expect(pointsIn('Transactions over time')).toBe(20);
    const bars = (drawOf('Transactions per day').data as Array<{ type: string; y: number[] }>).filter((t) => t.type === 'bar');
    expect(bars.flatMap((t) => t.y).reduce((n, y) => n + y, 0)).toBe(20);
    await advance(500);
    expect(tile('Transactions so far')).toHaveTextContent('30');
    expect(asked).not.toHaveBeenCalled();
  });

  test('the slowest speed is one a second, and Pause holds the place', async () => {
    await openReplay();
    press('1 a second');
    press('Play');
    await advance(3000);
    expect(tile('Transactions so far')).toHaveTextContent('3');
    press('Pause');
    await advance(5000);
    expect(tile('Transactions so far')).toHaveTextContent('3');
    expect(screen.getByText('Replay paused at transaction 3 of 377.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  test('Step moves one transaction and stops a running replay; Restart goes back to the beginning', async () => {
    await openReplay();
    press('Step');
    press('Step');
    expect(tile('Transactions so far')).toHaveTextContent('2');
    press(/Play|Resume/);
    await advance(1000);
    press('Step');
    const after = Number(tile('Transactions so far').textContent);
    await advance(2000);
    expect(tile('Transactions so far')).toHaveTextContent(String(after));
    press('Restart');
    expect(tile('Transactions so far')).toHaveTextContent('0');
    expect(screen.queryByRole('heading', { name: 'Transactions over time' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart' })).toBeDisabled();
  });

  test('the stage says how to begin, then "{i} of {n} · up to {time}" with the zone printed once', async () => {
    await openReplay();
    expect(screen.getByText('Press Play or Step to begin.')).toBeInTheDocument();
    press('Step');
    const progress = document.querySelector('.replay-progress span')!;
    expect(progress.textContent).toMatch(/^1 of 377 · up to \d{1,2} \w{3} \d{4}, \d\d:\d\d UTC$/);
    expect(document.body.textContent).not.toContain('UTC UTC');
    expect(screen.queryByText('Press Play or Step to begin.')).not.toBeInTheDocument();
  });

  test('a flag appears when its transaction does, with the limitation line, and not before', async () => {
    await openReplay();
    const to = (n: number) => {
      for (let i = 0; i < n; i++) press('Step');
    };
    to(firstFlagged);
    await advance(0);
    expect(tile('Unusual so far')).toHaveTextContent('0');
    expect(screen.queryByText(settings.limitationLine, { selector: '.replay .card-sub' })).not.toBeInTheDocument();
    // No flag yet: the replay has no line (the overview's flagged-days list has its own, outside the replay).
    to(1);
    await advance(0);
    expect(tile('Unusual so far')).toHaveTextContent('1on 1 day');
    expect(screen.getByText(/^Latest:/).parentElement).toHaveTextContent('Unusual');
    expect(screen.getByText(settings.limitationLine, { selector: '.replay .card-sub' })).toBeInTheDocument();
    expect(within(document.querySelector('.replay') as HTMLElement).getAllByText(settings.limitationLine)).toHaveLength(1); // the replay's flagged line is the only copy in the replay
    expect(within(screen.getByRole('contentinfo')).queryByText(settings.limitationLine)).not.toBeInTheDocument();
    const unusual = (drawOf('Transactions over time').data as Array<{ name: string; x: unknown[] }>).find((t) => /Unusual/.test(t.name));
    expect(unusual?.x).toHaveLength(1);
  });

  test('it finishes by itself at the last transaction with the totals of the whole history, and can play again', async () => {
    await openReplay();
    press('20 a second');
    press('Play');
    await advance(25_000);
    expect(tile('Transactions so far')).toHaveTextContent('377');
    expect(tile('Scored so far')).toHaveTextContent('367');
    expect(tile('Unusual so far')).toHaveTextContent('3on 3 days');
    expect(screen.getByText('Replay finished: all 377 transactions shown.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Step' })).toBeDisabled();
    expect(vi.getTimerCount()).toBe(0);
    press('Play again');
    await advance(1000);
    expect(tile('Transactions so far')).toHaveTextContent('20');
  });
});

describe('reduced motion and leaving', () => {
  test('with reduced motion there is no Play and no speed: only Step moves it, and no timer is ever set', async () => {
    const real = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...real(query), matches: query.includes('reduced-motion') }));
    window.location.hash = `#/address/${ex.mainAddress}`;
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the replay' }));
    await screen.findByRole('button', { name: 'Step' });
    vi.useFakeTimers();
    expect(screen.queryByRole('button', { name: /Play|Resume|Pause/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Speed/ })).not.toBeInTheDocument();
    expect(screen.getByText('Reduced motion is on. Press Step to move one transaction.')).toBeInTheDocument();
    press('Step');
    press('Step');
    await advance(5000);
    expect(tile('Transactions so far')).toHaveTextContent('2');
    expect(vi.getTimerCount()).toBe(0);
  });

  test('leaving the screen stops the replay: no timer is left running', async () => {
    await openReplay();
    press('Play');
    await advance(1000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await act(async () => {
      window.location.hash = '#/models';
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.queryByRole('heading', { name: 'Replay' })).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });

  test('a change of method starts the replay again, from the rows scored by that method', async () => {
    window.location.hash = `#/address/${ex.mainAddress}`;
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the replay' }));
    await screen.findByRole('button', { name: 'Play' });
    fireEvent.click(screen.getByRole('button', { name: 'Step' }));
    expect(tile('Transactions so far')).toHaveTextContent('1');
    window.location.hash = `#/address/${ex.mainAddress}?method=regression`;
    await within(await screen.findByRole('heading', { name: 'Replay' }).then((h) => h.closest('section')!)).findByRole('button', { name: 'Play' });
    expect(tile('Transactions so far')).toHaveTextContent('0');
  });
});
