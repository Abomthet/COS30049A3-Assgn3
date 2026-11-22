import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import { App } from '../src/App';
import { CONFIG, HEALTH } from '../src/api/mock/fixtures';
import { mockControls } from '../src/api/mock/mockApi';
import { METHODS } from '../src/lib/methods';
import { settings } from '../src/lib/settings';

// V7 states no figure of its own: what it says about the source, snapshot, flag levels and features
// comes from E2, so these tests compare it with the recorded E2 answer.

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

function open() {
  window.location.hash = '#/about';
  render(<App />);
}

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
});

const METHODS_COUNT = METHODS.length;
const section = async (name: string) => within((await screen.findByRole('heading', { level: 2, name })).closest('section')!);

const flatten = (el: Element) => {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('*').forEach((n) => n.append(' ')); // block elements read as separate phrases
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

describe('About and help', () => {
  test('it replaces the placeholder and starts with the lede', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'About and help' })).toBeInTheDocument();
    expect(screen.queryByText('This page is not available yet')).not.toBeInTheDocument();
    expect(screen.getByText('See how a Bitcoin address has been used, day by day, and which transactions are unusual for it.')).toBeInTheDocument();
  });

  test('the sections come in the approved order', async () => {
    open();
    await screen.findByRole('heading', { level: 2, name: 'Keyboard' });
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(['What it shows', 'What "unusual" means', 'How a flag is decided', 'How to read the charts', 'Limits', 'Where the data comes from', 'Keyboard']);
  });

  test('what it shows: three points, the model count from E11', async () => {
    open();
    const shows = await section('What it shows');
    expect(shows.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Daily activity of an address.',
      'Unusual transactions, with the reason and what each was compared with.',
      `${METHODS_COUNT} models side by side, so you can see where they agree.`,
    ]);
  });

  test('limits: three short lines, no "does not claim", the address count moved to the data section', async () => {
    open();
    const limits = await section('Limits');
    expect(limits.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'A flag says nothing about who is behind an address or why a payment was made.',
      'An address is compared only with its own past.',
      'Real transactions have no labels, so no accuracy is claimed for flags.',
    ]);
    expect(limits.queryByText(/covers the/)).not.toBeInTheDocument();
    expect(screen.queryByText(/does not claim/i)).not.toBeInTheDocument();
  });

  test('the data source, snapshot, addresses and version are E2\'s and the health answer\'s', async () => {
    open();
    const data = await section('Where the data comes from');
    const link = await data.findByRole('link', { name: /Blockstream Esplora/ });
    expect(link).toHaveAttribute('href', CONFIG.snapshot.sourceUrl);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(data.getByText('Everything here is public blockchain data from a fixed snapshot.')).toBeInTheDocument();
    expect(data.getByText('22 Oct 2026')).toBeInTheDocument();
    expect(data.getByText('UTC')).toBeInTheDocument();
    expect(data.getByText('Addresses').nextElementSibling).toHaveTextContent(String(CONFIG.snapshot.addressCount));
    await waitFor(() => expect(data.getByText('Version').nextElementSibling).toHaveTextContent(HEALTH.version));
    expect(screen.queryByText(/Explorer service version/)).not.toBeInTheDocument();
  });

  test('"unusual" has a lead, a qualifier with E2\'s flag level, and the flag level as a highlighted figure', async () => {
    open();
    const unusual = await section('What "unusual" means');
    expect(unusual.getByText("Unusual means different from this address's own past.")).toBeInTheDocument();
    const flag = String(CONFIG.thresholds.flagAbsZ);
    await waitFor(() => expect(unusual.getByText(`A transaction is flagged when a measure is ${flag} or more of this address's typical swings away from usual.`)).toBeInTheDocument());
    const figure = unusual.getByTestId('about-flag-level');
    expect(figure).toHaveTextContent(`Flag level ${flag} typical swings from usual`);
    expect(within(figure).getByText(flag)).toHaveClass('stat-value');
  });

  test('"unusual" has three status tiles with the real badges', async () => {
    open();
    const unusual = await section('What "unusual" means');
    const tiles = unusual.getAllByRole('listitem');
    expect(tiles).toHaveLength(3);
    const { minTx, minSpanDays } = CONFIG.history;
    const expected: Array<[string, string, string]> = [
      ['badge-flagged', 'Unusual', 'Flagged, with the strongest reason beside it.'],
      ['badge-not-flagged', 'Not unusual', 'Scored, and within the usual range.'],
      ['badge-not-scored', 'Not scored', `Too little earlier history. Scoring needs ${minTx} transactions over ${minSpanDays} days.`],
    ];
    expected.forEach(([cls, word, line], i) => {
      const badge = tiles[i].querySelector('.badge')!;
      expect(badge).toHaveClass(cls);
      expect(badge).toHaveTextContent(word);
      expect(flatten(tiles[i])).toBe(`${word} ${line}`);
    });
  });

  test('the four measures are E2\'s features, name and description unchanged', async () => {
    open();
    const unusual = await section('What "unusual" means');
    expect(await unusual.findByRole('heading', { level: 3, name: 'The four measures' })).toBeInTheDocument();
    expect(CONFIG.features).toHaveLength(4);
    for (const f of CONFIG.features) {
      expect(unusual.getByText(f.name, { selector: 'dt' })).toBeInTheDocument();
      expect(unusual.getByText(f.description)).toBeInTheDocument();
    }
  });

  test('how a flag is decided: three steps with E2\'s levels and E11\'s count', async () => {
    open();
    const decided = await section('How a flag is decided');
    const steps = decided.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    await waitFor(() => expect(flatten(steps[2])).toContain(`Flag at ${CONFIG.thresholds.flagAbsZ}.`));
    expect(flatten(steps[0])).toBe('Compare with its own past. Each transaction is compared only with earlier ones from the same address, so a score never uses the future.');
    expect(flatten(steps[1])).toBe('Measure four things. Size, Burst, Gap and Relative size, each as a distance from usual.');
    expect(flatten(steps[2])).toBe(
      `Flag at ${CONFIG.thresholds.flagAbsZ}. A measure counts as contributing from ${CONFIG.thresholds.contributingAbsZ}. Baseline decides which transactions are flagged; ${METHODS_COUNT - 1} more models are shown beside it.`,
    );
  });

  test('the charts section is two short lines and the keys have their own part', async () => {
    open();
    const charts = await section('How to read the charts');
    expect(charts.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Each chart has a "How to read this chart" note.',
      'Every chart can be viewed as a table and downloaded as a picture.',
    ]);
    const keys = await section('Keyboard');
    expect(keys.getByText('Tab and Shift+Tab')).toBeInTheDocument();
    expect(keys.getByText('Left and right arrows on a chart')).toBeInTheDocument();
  });

  test('no internal words and no decorative icon: the only svg is the unusual badge\'s flag', async () => {
    open();
    await screen.findByRole('heading', { level: 2, name: 'Keyboard' });
    await waitFor(() => expect(screen.getByTestId('about-flag-level')).toBeInTheDocument());
    const text = document.querySelector('.page-about')!.textContent ?? '';
    expect(text).not.toMatch(/F1 to F4|robust z-score|flag budget|planted|recall|Assignment 2|\(A1\)|template|method in one paragraph/i);
    const svgs = document.querySelectorAll('.page-about svg');
    expect(svgs).toHaveLength(1);
    expect(svgs[0]).toHaveClass('icon-flag');
    expect(svgs[0].closest('.badge')).toHaveClass('badge-flagged');
  });

  test('with the service unreachable the page still reads, without a figure it cannot know', async () => {
    mockControls.offline = true;
    open();
    const data = await section('Where the data comes from');
    await waitFor(() => expect(data.getByText(/The data comes from Blockstream Esplora\./)).toBeInTheDocument());
    const unusual = await section('What "unusual" means');
    expect(unusual.queryByText(/typical swings away from usual/)).not.toBeInTheDocument();
    expect(unusual.queryByTestId('about-flag-level')).not.toBeInTheDocument();
    expect(unusual.getByText(/Scoring needs 10 transactions over/)).toBeInTheDocument();
    expect(screen.queryByText('Version')).not.toBeInTheDocument();
    const decided = await section('How a flag is decided');
    expect(decided.getByText(/8 more models are shown beside/)).toBeInTheDocument();
  });
});
