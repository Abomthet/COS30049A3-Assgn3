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
  test('a comparison is three rows: how the amount, the score and the number of models that flag it differ', () => {
    const rows = compareScenarios(scenario({ amountBtc: '0.05', score: 5, flaggedBy: 3 }), scenario({ amountBtc: '0.5', score: 7.5, flaggedBy: 2 }));
    expect(rows).toEqual([
      { label: 'Amount', text: '10× larger' },
      { label: 'Score', text: '2.50 higher' },
      { label: 'Flagged by', text: '1 fewer model' },
    ]);
    expect(compareScenarios(scenario({ amountBtc: '0.5', score: 7.5, flaggedBy: 2 }), scenario({ amountBtc: '0.03', score: 3, flaggedBy: 5 }))).toEqual([
      { label: 'Amount', text: '17× smaller' },
      { label: 'Score', text: '4.50 lower' },
      { label: 'Flagged by', text: '3 more models' },
    ]);
    expect(compareScenarios(scenario(), scenario()).map((r) => r.text)).toEqual(['Same', 'Same', 'Same']);
  });

  test('every CSV row carries the limitation line', () => {
    const { header, rows } = scenarioCsvRows([scenario(), scenario({ id: 'x', flagged: false })], () => 'Baseline', LIMITATION_LINE);
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save this scenario' })).toBeEnabled(), LATE);
}

const keep = async (user: ReturnType<typeof userEvent.setup>) => user.click(await screen.findByRole('button', { name: 'Save this scenario' }));
const table = () => screen.findByRole('table', { name: /Saved what-if scenarios/ });
const rowsOf = async () => within(await table()).getAllByRole('row').slice(1);

describe('keeping scenarios', () => {
  test('nothing can be kept before a verdict, and the table starts empty', async () => {
    openLab();
    expect(await screen.findByRole('button', { name: 'Save this scenario' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeDisabled();
    expect(screen.queryByRole('table', { name: /Saved what-if scenarios/ })).not.toBeInTheDocument();
  });

  test('three scenarios are kept as rows with amount, direction, time, verdict, score and the number of methods; the same one is not kept twice', async () => {
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-20', /Would be flagged/);
    await keep(user);
    expect(screen.getByRole('button', { name: 'Save this scenario' })).toBeDisabled();
    expect(screen.getByText('Already saved.')).toBeInTheDocument();
    await scoreIt(user, '0.05', '2026-10-22', /Would be flagged/);
    await keep(user);
    await scoreIt(user, '0.0005', '2026-10-22', /Would not be flagged/);
    await keep(user);

    const rows = await rowsOf();
    expect(rows).toHaveLength(3);
    const first = within(rows[0]).getAllByRole('cell').map((c) => c.textContent);
    expect(first.slice(0, 2)).toEqual(['0.05 BTC', 'Sent']);
    expect(first[2]).toBe('2026-10-20 12:00');
    expect(first[3]).toBe('Unusual');
    expect(first[4]).toBe('5.98');
    expect(first[5]).toMatch(/^\d of \d models$/);
    expect(within(rows[2]).getAllByRole('cell')[3]).toHaveTextContent(/Not unusual/);
  });

  test('two ticked scenarios are compared, and a row can be removed', async () => {
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-22', /Would be flagged/);
    await keep(user);
    await scoreIt(user, '0.0005', '2026-10-22', /Would not be flagged/);
    await keep(user);
    expect(screen.getByText('Tick two to compare.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Scenario 1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Scenario 2' }));
    const compare = await screen.findByRole('table', { name: 'Scenario 2 vs scenario 1' });
    const rows = within(compare).getAllByRole('row').map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual(['Amount', expect.stringMatching(/^\d+(\.\d)?× smaller$/)]);
    expect(rows[1]).toEqual(['Score', expect.stringMatching(/^\d+\.\d\d lower$/)]);
    expect(rows[2]).toEqual(['Flagged by', expect.stringMatching(/^\d+ fewer models?$/)]);
    expect(screen.queryByText(/against scenario/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove scenario 1' }));
    expect(await rowsOf()).toHaveLength(1);
    expect(screen.queryByRole('table', { name: /vs scenario/ })).not.toBeInTheDocument();
  });

  test('the scenarios are kept for this address in the preferences, and are there when the lab is opened again', async () => {
    const user = openLab();
    await scoreIt(user, '0.05', '2026-10-20', /Would be flagged/);
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
    await scoreIt(user, '0.05', '2026-10-20', /Would be flagged/);
    await keep(user);
    await scoreIt(user, '0.05', '2026-10-22', /Would be flagged/);
    await keep(user);
    await scoreIt(user, '0.0005', '2026-10-22', /Would not be flagged/);
    await keep(user);
    await user.click(within(screen.getByRole('region', { name: 'Saved scenarios' })).getByRole('button', { name: 'Download CSV' }));

    expect(files).toHaveLength(1);
    expect(files[0].name).toMatch(new RegExp(`^what-if-scenarios_${ex.mainAddress}.*\\.csv$`));
    const lines = (await files[0].text).trimEnd().split('\r\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('Amount (BTC),Direction,Time (UTC),Deciding model,Verdict,Score,Models that flag it,Models that can score it,Limitation');
    expect(lines.slice(1).every((l) => l.endsWith(`"${LIMITATION_LINE}"`))).toBe(true); // quoted: the line has a comma
    expect(lines[1]).toMatch(/^0\.05,Sent,2026-10-20T12:00:00Z,/);
  });
});

describe('the scenario panel wording (R6)', () => {
  test('one line and a small footnote; "Saved" after saving; "Already saved." after; the heading and the button say saved', async () => {
    const user = openLab();
    const panel = await screen.findByRole('region', { name: 'Saved scenarios' });
    expect(within(panel).getByText('Save amounts here to compare them.')).toBeInTheDocument();
    expect(within(panel).getByText(`Stays in this browser · up to ${SCENARIOS_MAX} per address.`)).toBeInTheDocument();
    await scoreIt(user, '0.05', '2026-10-20', /Would be flagged/);
    await keep(user);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(within(panel).getByText('Already saved.')).toBeInTheDocument();
    expect(panel).not.toHaveTextContent(/\b(above|below)\b/i);
  });

  test('a full table says "Full: remove one to save another." and the Save button is off', async () => {
    window.localStorage.setItem(
      'explorer.preferences.v1',
      JSON.stringify({ scenarios: { [ex.mainAddress]: Array.from({ length: SCENARIOS_MAX }, (_, i) => scenario({ id: `out|${i + 1}|x`, amountBtc: String(i + 1) })) } }),
    );
    openLab();
    const panel = await screen.findByRole('region', { name: 'Saved scenarios' });
    expect(await within(panel).findByText('Full: remove one to save another.')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Save this scenario' })).toBeDisabled();
  });
});
