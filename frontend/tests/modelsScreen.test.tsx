// V5, models and limits, against E11: every method is a card, and every number on the page is the answer's.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import { CONFIG, METHODS_ANSWER } from '../src/api/mock/fixtures';
import { mockApi, mockControls } from '../src/api/mock/mockApi';
import { formatShare } from '../src/lib/format';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
  vi.restoreAllMocks();
});

function start() {
  window.location.hash = '#/models';
  render(<App />);
}

describe('the methods', () => {
  test('there is a card for each method E11 lists, with its name, family, description, flag line and whether it scores a new amount', async () => {
    start();
    expect(await screen.findByRole('heading', { level: 1, name: 'Models and limits' })).toBeInTheDocument();
    const cards = await screen.findAllByTestId(/^method-/);
    expect(cards).toHaveLength(METHODS_ANSWER.methods.length);
    METHODS_ANSWER.methods.forEach((m, i) => {
      const card = within(cards[i]);
      expect(card.getByRole('heading', { level: 3 })).toHaveTextContent(m.name);
      expect(cards[i]).toHaveTextContent(m.family.charAt(0).toUpperCase() + m.family.slice(1));
      expect(cards[i]).toHaveTextContent(m.description);
      expect(card.getByText('Flag line').nextElementSibling).toHaveTextContent(m.threshold.toFixed(2));
      expect(card.getByText('Works in the what-if lab').nextElementSibling).toHaveTextContent(m.scoresNewInput ? 'Yes' : 'No');
    });
  });

  test('the test results are E11\'s, with their intervals: mean recall, each planted pattern and the flag rate', async () => {
    start();
    const [baseline] = await screen.findAllByTestId(/^method-/);
    const { evaluation } = METHODS_ANSWER.methods[0];
    const range = (i: { value: number; ciLow: number; ciHigh: number }) => `${formatShare(i.value)} (${formatShare(i.ciLow)} to ${formatShare(i.ciHigh)})`;
    const rows = within(baseline).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      `All patterns${range(evaluation.meanRecall)}`,
      `Spike${range(evaluation.recallByPattern.spike)}`,
      `Burst${range(evaluation.recallByPattern.burst)}`,
      `Dormant${range(evaluation.recallByPattern.dormant)}`,
    ]);
    expect(within(baseline).getByRole('table')).toHaveAccessibleName('Caught in tests with simulated unusual transactions');
    expect(within(baseline).getByText('Flags').nextElementSibling).toHaveTextContent(`${formatShare(evaluation.flagRate)} of real transactions`);
  });

  test('a change in E11 is a change on the page: nothing is typed in', async () => {
    const answer = await mockApi.methods();
    const changed = { ...answer, methods: answer.methods.map((m) => (m.id === 'lof' ? { ...m, threshold: 7.77, name: 'Another name', evaluation: { ...m.evaluation, flagRate: 0.5 } } : m)) };
    vi.spyOn(mockApi, 'methods').mockResolvedValue(changed);
    start();
    const lof = (await screen.findAllByTestId(/^method-/))[2];
    expect(lof).toHaveTextContent('Another name');
    expect(lof).toHaveTextContent('7.77');
    expect(lof).toHaveTextContent('50% of real transactions');
  });
});

describe('the page head and the long names', () => {
  test('the lede counts the models and says what a flag means', async () => {
    start();
    expect(await screen.findAllByTestId(/^method-/)).toHaveLength(9);
    expect(document.querySelector('.lede')!.textContent).toBe(
      `${METHODS_ANSWER.methods.length} models score every transaction, each on its own scale. A flag means a model's score reached its flag line.`,
    );
  });

  test('a card whose long name differs from its short name shows it under the title; one that does not shows nothing', async () => {
    start();
    const cards = await screen.findAllByTestId(/^method-/);
    METHODS_ANSWER.methods.forEach((m, i) => {
      const sub = within(cards[i]).queryByTestId('long-name');
      if (m.longName === m.name) expect(sub).not.toBeInTheDocument();
      else expect(sub).toHaveTextContent(m.longName);
    });
    expect(within(cards[0]).getByTestId('long-name')).toHaveTextContent('Robust z baseline');
    expect(within(cards[1]).queryByTestId('long-name')).not.toBeInTheDocument(); // Isolation Forest is its own long name
    expect(within(cards[7]).getByTestId('long-name')).toHaveTextContent('Score fusion (Regression + Isolation Forest)');
  });

  test('the nine card lines are plain: none carries an internal word', async () => {
    start();
    const cards = await screen.findAllByTestId(/^method-/);
    const internal = /F1|F4|robust z|z-score|flag budget|planted|recall|Assignment 2|\(A1\)/i;
    METHODS_ANSWER.methods.forEach((m, i) => {
      expect(cards[i]).toHaveTextContent(m.description);
      expect(m.description).not.toMatch(internal);
    });
    expect(cards[3]).toHaveTextContent('How far it sits from the nearest group of similar transactions.');
  });
});

describe('the limits', () => {
  test('"What a flag means" has three short points, the snapshot\'s size and date from E2, and the limitation line only in the footer', async () => {
    start();
    const section = (await screen.findByRole('heading', { name: 'What a flag means' })).closest('section')!;
    await within(section).findByText(new RegExp(`${CONFIG.snapshot.addressCount} addresses on one date`));
    const points = within(section).getAllByRole('listitem').map((li) => li.textContent);
    expect(points).toEqual([
      "A flag means different from this address's own past.",
      'Real transactions have no labels, so we cannot say how often a flag is right.',
      `The snapshot covers ${CONFIG.snapshot.addressCount} addresses on one date, 22 Oct 2026.`,
    ]);
    expect(section.textContent ?? '').not.toMatch(/planted|recall|accuracy is claimed/i);
    expect(section).not.toHaveTextContent(LIMITATION_LINE); // once per screen: the footer has it
    expect(screen.getByRole('contentinfo')).toHaveTextContent(LIMITATION_LINE);
  });

  test('"Why the test numbers are not accuracy" is a closed disclosure that holds the detail', async () => {
    start();
    const user = userEvent.setup();
    const details = (await screen.findByTestId('test-numbers-disclosure')) as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByText('Why the test numbers are not accuracy').tagName).toBe('SUMMARY');
    expect(details).toHaveClass('pchart-guide');
    await user.click(within(details).getByText('Why the test numbers are not accuracy'));
    expect(details.open).toBe(true);
    expect(details).toHaveTextContent(
      'The test counts how many simulated unusual transactions a model flags. It shows a model notices spikes, bursts and a dormant address waking up. It does not show how often a flag on a real address is right.',
    );
  });
});

describe('states', () => {
  test('while E11 loads the page says so, and the limits are already there', async () => {
    mockControls.latencyMs = 50;
    start();
    expect(screen.getByText('Loading the models…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What a flag means' })).toBeInTheDocument();
    expect(await screen.findAllByTestId(/^method-/)).toHaveLength(9);
  });

  test('a failure is an error state with "Try again", which asks again', async () => {
    mockControls.offline = true;
    start();
    const user = userEvent.setup();
    expect(await screen.findByText("Can't reach the Explorer")).toBeInTheDocument();
    mockControls.offline = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId(/^method-/)).toHaveLength(9);
  });
});
