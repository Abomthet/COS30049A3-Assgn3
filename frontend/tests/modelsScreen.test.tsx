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
      expect(card.getByText('Scores a new amount').nextElementSibling).toHaveTextContent(m.scoresNewInput ? 'Yes' : 'No');
    });
  });

  test('the test results are E11\'s, with their intervals: mean recall, each planted pattern and the flag rate', async () => {
    start();
    const [baseline] = await screen.findAllByTestId(/^method-/);
    const { evaluation } = METHODS_ANSWER.methods[0];
    const range = (i: { value: number; ciLow: number; ciHigh: number }) => `${formatShare(i.value)} (${formatShare(i.ciLow)} to ${formatShare(i.ciHigh)})`;
    const rows = within(baseline).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      `All three patterns${range(evaluation.meanRecall)}`,
      `Spike${range(evaluation.recallByPattern.spike)}`,
      `Burst${range(evaluation.recallByPattern.burst)}`,
      `Dormant${range(evaluation.recallByPattern.dormant)}`,
    ]);
    expect(within(baseline).getByText('Flags real transactions').nextElementSibling).toHaveTextContent(`${formatShare(evaluation.flagRate)} of them`);
  });

  test('a change in E11 is a change on the page: nothing is typed in', async () => {
    const answer = await mockApi.methods();
    const changed = { ...answer, methods: answer.methods.map((m) => (m.id === 'lof' ? { ...m, threshold: 7.77, name: 'Another name', evaluation: { ...m.evaluation, flagRate: 0.5 } } : m)) };
    vi.spyOn(mockApi, 'methods').mockResolvedValue(changed);
    start();
    const lof = (await screen.findAllByTestId(/^method-/))[2];
    expect(lof).toHaveTextContent('Another name');
    expect(lof).toHaveTextContent('7.77');
    expect(lof).toHaveTextContent('50% of them');
  });
});

describe('the limits', () => {
  test('say what a flag means and what it does not, with the snapshot\'s size and date from E2 and the limitation line', async () => {
    start();
    const section = (await screen.findByRole('heading', { name: 'What a flag means, and what it does not' })).closest('section')!;
    expect(section).toHaveTextContent('compares an address with its own past');
    expect(section).toHaveTextContent('no accuracy is claimed');
    expect(section).toHaveTextContent('planted test transactions');
    await within(section).findByText(new RegExp(`${CONFIG.snapshot.addressCount} addresses on one date, 22 Oct 2026`));
    expect(section).not.toHaveTextContent(LIMITATION_LINE); // once per screen: the footer has it
    expect(screen.getByRole('contentinfo')).toHaveTextContent(LIMITATION_LINE);
  });
});

describe('states', () => {
  test('while E11 loads the page says so, and the limits are already there', async () => {
    mockControls.latencyMs = 50;
    start();
    expect(screen.getByText('Loading the models…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What a flag means, and what it does not' })).toBeInTheDocument();
    expect(await screen.findAllByTestId(/^method-/)).toHaveLength(9);
  });

  test('a failure is an error state with "Try again", which asks again', async () => {
    mockControls.offline = true;
    start();
    const user = userEvent.setup();
    expect(await screen.findByText("Couldn't reach the explorer service")).toBeInTheDocument();
    mockControls.offline = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findAllByTestId(/^method-/)).toHaveLength(9);
  });
});
