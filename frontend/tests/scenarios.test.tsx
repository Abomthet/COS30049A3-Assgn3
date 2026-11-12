// S-08, the scenario table of the what-if lab, through the real UI on the mock (which replays the real service's recorded what-ifs).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { App } from '../src/App';
import ex from '../src/api/mock/fixtures/examples.json';
import { compareScenarios, scenarioCsvRows } from '../src/lib/scenarioTable';
import { SCENARIOS_MAX, parseScenarios, type Scenario } from '../src/lib/scenarios';
import { LIMITATION_LINE, settings } from '../src/lib/settings';

const banned = new RegExp(`\\b(${settings.bannedWords.join('|')})`, 'i');
const LATE = { timeout: 3000 };

afterEach(() => {
  expect(document.body.textContent ?? '').not.toMatch(banned);
  vi.restoreAllMocks();
});

const scenario = (over: Partial<Scenario> = {}): Scenario => ({
  id: 'out|0.05|2026-10-20T12:00:00Z',
  amountBtc: '0.05',
  direction: 'out',
  time: '2026-10-20T12:00:00Z',
  method: 'baseline',
  flagged: true,
  score: 5.98,
  flaggedBy: 3,
  of: 8,
  ...over,
});

describe('the scenario helpers', () => {
  test('a comparison says how the amount, the score and the number of methods differ', () => {
    const text = compareScenarios(scenario({ amountBtc: '0.05', score: 5, flaggedBy: 3 }), scenario({ amountBtc: '0.5', score: 7.5, flaggedBy: 2 }));
    expect(text).toBe('10 times larger, a score 2.50 higher, 1 method fewer flagging it');
    expect(compareScenarios(scenario(), scenario())).toBe('the same amount, the same score, the same number of methods flagging it');
  });

  test('every CSV row carries the limitation line', () => {
    const { header, rows } = scenarioCsvRows([scenario(), scenario({ id: 'x', flagged: false })], () => 'Robust z baseline (A1)', LIMITATION_LINE);
    expect(header.at(-1)).toBe('Limitation');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.at(-1) === LIMITATION_LINE && r.length === header.length)).toBe(true);
  });

  test('stored scenarios are trusted for nothing: bad rows go, and an address keeps at most ten', () => {
    const many = Array.from({ length: 12 }, (_, i) => scenario({ id: String(i) }));
    const parsed = parseScenarios({ a: many, b: [{ id: 1 }], c: 'nope', d: [scenario({ method: 'nothing' as never })] });
    expect(Object.keys(parsed)).toEqual(['a']);
    expect(parsed.a).toHaveLength(SCENARIOS_MAX);
    expect(parseScenarios(null)).toEqual({});
  });
});

function openLab() {
  window.location.hash = `#/address/${ex.mainAddress}/what-if?direction=out`;
  const user = userEvent.setup();
  render(<App />);
  return user;
}

/** Types an amount and a day, and waits for the verdict that those values give. */
async function scoreIt(user: ReturnType<typeof userEvent.setup>, amount: string, date: string, verdict: RegExp) {
  const field = await screen.findByLabelText('Amount (BTC)');
  await user.clear(field);
  await user.type(field, amount);
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
  await waitFor(() => expect(screen.getByTestId('verdict-card')).toHaveTextContent(verdict), LATE);
  // The button follows the answer for the values in the form, not the one before.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Keep this scenario' })).toBeEnabled(), LATE);
}

const keep = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: 'Keep this scenario' }));
const table = () => screen.findByRole('table', { name: /Kept what-if scenarios/ });
const rowsOf = async () => within(await table()).getAllByRole('row').slice(1);

describe('keeping scenarios', () => {
  test('nothing can be kept before a verdict, and the table starts empty', async () => {
    openLab();
    expect(await screen.findByRole('button', { name: 'Keep this scenario' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    expect(screen.queryByRole('table', { name: /Kept what-if scenarios/ })).not.toBeInTheDocument();
  });

  test('three scenarios are kept as rows with amount, direction, time, verdict, score and the number of methods; the same one is not kept twice', async () => {
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-20', /Flagged by/);
    await keep(user);
    expect(screen.getByRole('button', { name: 'Keep this scenario' })).toBeDisabled();
    expect(screen.getByText('This scenario is already in the table.')).toBeInTheDocument();
    await scoreIt(user, '0.05', '2026-10-22', /Flagged by/);
    await keep(user);
    await scoreIt(user, '0.0005', '2026-10-22', /Not flagged/);
    await keep(user);

    const rows = await rowsOf();
    expect(rows).toHaveLength(3);
    const first = within(rows[0]).getAllByRole('cell').map((c) => c.textContent);
    expect(first.slice(0, 2)).toEqual(['0.05 BTC', 'Sent']);
    expect(first[2]).toBe('2026-10-20 12:00');
    expect(first[3]).toMatch(/Unusual.*Robust z baseline/);
    expect(first[4]).toBe('5.98');
    expect(first[5]).toMatch(/^\d of \d methods$/);
    expect(within(rows[2]).getAllByRole('cell')[3]).toHaveTextContent(/Not unusual/);
  });

  test('two ticked scenarios are compared, and a row can be removed', async () => {
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-22', /Flagged by/);
    await keep(user);
    await scoreIt(user, '0.0005', '2026-10-22', /Not flagged/);
    await keep(user);
    expect(screen.getByText('Tick two scenarios to compare them.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Scenario 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scenario 2' }));
    expect(await screen.findByText(/Scenario 2 against scenario 1:/)).toBeInTheDocument();
    expect(screen.getByText(/times smaller, a score .* lower/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove scenario 1' }));
    expect(await rowsOf()).toHaveLength(1);
    expect(screen.queryByText(/against scenario/)).not.toBeInTheDocument();
  });

  test('the scenarios are kept for this address in the preferences, and are there when the lab is opened again', async () => {
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-20', /Flagged by/);
    await keep(user);
    expect(JSON.parse(localStorage.getItem('explorer.preferences.v1')!).scenarios[ex.mainAddress]).toHaveLength(1);
    document.body.innerHTML = '';
    render(<App />);
    expect(await rowsOf()).toHaveLength(1);
  });

  test('Download CSV is made in the browser with the limitation line on every row', async () => {
    const files: Array<{ name: string; text: Promise<string> }> = [];
    const blobs = new Map<string, Blob>();
    URL.createObjectURL = vi.fn((blob: Blob) => {
      const url = `blob:test/${blobs.size}`;
      blobs.set(url, blob);
      return url;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      files.push({ name: this.download, text: blobs.get(this.href)!.text() });
    });
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-20', /Flagged by/);
    await keep(user);
    await scoreIt(user, '0.05', '2026-10-22', /Flagged by/);
    await keep(user);
    await scoreIt(user, '0.0005', '2026-10-22', /Not flagged/);
    await keep(user);
    await user.click(within(screen.getByRole('region', { name: 'Kept scenarios' })).getByRole('button', { name: 'Download CSV' }));

    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(new RegExp(`^what-if-scenarios_${ex.mainAddress}.*\\.csv$`));
    const lines = (await files[0].text).trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Amount (BTC),Direction,Time (UTC),Deciding method,Verdict,Score,Methods that flag it,Methods that can score it,Limitation');
    expect(lines.slice(1).every((l) => l.endsWith(LIMITATION_LINE))).toBe(true);
    expect(lines[1]).toMatch(/^0\.05,Sent,2026-10-20T12:00:00Z,/);
  });
});
