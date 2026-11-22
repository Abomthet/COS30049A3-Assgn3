// Reading a what-if curve (E9): the amounts where a method's score meets its flag line, and the
// stretches of amounts it flags. Amounts are spaced evenly on a log scale, so every position
// between two points is worked out on the logarithm of the amount.

import type { WhatIfDirection } from '../api/types';
import { formatBtcRounded } from './format';

/** One curve of one method: its amounts, with the score and flag at each. */
export interface CurveLine {
  amounts: number[];
  scores: Array<number | null>;
  flags: boolean[];
  threshold: number;
}

const between = (a: number, b: number, fraction: number) => 10 ** (Math.log10(a) + fraction * (Math.log10(b) - Math.log10(a)));

/**
 * Where the line crosses the flag line between point `k` and the next, which have different flags:
 * the amount at which the score, joined straight from one point to the next, reaches the threshold.
 * A method whose flag does not follow its score there (or has no score) is crossed halfway.
 */
function crossingAfter({ amounts, scores, threshold }: CurveLine, k: number): number {
  const [a, b] = [scores[k], scores[k + 1]];
  const inside = a !== null && b !== null && Math.min(a, b) < threshold && threshold < Math.max(a, b);
  return between(amounts[k], amounts[k + 1], inside ? (threshold - a) / (b - a) : 0.5);
}

/** Every amount where the flag changes, smallest first. */
export function crossings(line: CurveLine): number[] {
  return line.flags.flatMap((flag, k) => (k + 1 < line.flags.length && flag !== line.flags[k + 1] ? [crossingAfter(line, k)] : []));
}

/** A run of flagged points, as indexes into the curve; `from` of 0 or `to` of the last index means it reaches the edge of the range drawn. */
export interface Run {
  from: number;
  to: number;
}

/** The stretches of consecutive flagged points, as index ranges, so each can be shaded on the what-if curve. */
export function flaggedRuns(flags: boolean[]): Run[] {
  const runs: Run[] = [];
  flags.forEach((flag, i) => {
    if (!flag) return;
    if (i > 0 && flags[i - 1]) runs[runs.length - 1].to = i;
    else runs.push({ from: i, to: i });
  });
  return runs;
}

/** The amount at the start and end of a run: where the flag begins, or the edge of the range when it begins there. */
export function runBounds(line: CurveLine, run: Run): { start: number; end: number } {
  const last = line.amounts.length - 1;
  return {
    start: run.from === 0 ? line.amounts[0] : crossingAfter(line, run.from - 1),
    end: run.to === last ? line.amounts[last] : crossingAfter(line, run.to),
  };
}

/** The score at any amount inside the range, joined straight between points; null outside it or where a neighbour has no score. */
export function scoreAt(line: CurveLine, btc: number): number | null {
  const { amounts, scores } = line;
  const k = amounts.findIndex((a, i) => i + 1 < amounts.length && a <= btc && btc <= amounts[i + 1]);
  if (k < 0 || scores[k] === null || scores[k + 1] === null) return null;
  const fraction = (Math.log10(btc) - Math.log10(amounts[k])) / (Math.log10(amounts[k + 1]) - Math.log10(amounts[k]));
  return scores[k]! + fraction * (scores[k + 1]! - scores[k]!);
}

/** Whether the point nearest to this amount (on the log scale) is flagged. */
export function flagNear(line: CurveLine, btc: number): boolean {
  const distance = (a: number) => Math.abs(Math.log10(a) - Math.log10(btc));
  const nearest = line.amounts.reduce((best, a, i) => (distance(a) < distance(line.amounts[best]) ? i : best), 0);
  return line.flags[nearest];
}

/**
 * The curve in one sentence: "On this address, a sent amount would be flagged from about 0.023 BTC
 * upwards, and below about 0.00001 BTC." The ranges are what the curve was drawn over, so a stretch
 * that reaches the edge of it says so.
 */
export function describeCurve(line: CurveLine, direction: WhatIfDirection): string {
  const kind = direction === 'out' ? 'sent' : 'received';
  const { amounts } = line;
  const last = amounts.length - 1;
  const runs = flaggedRuns(line.flags);
  if (runs.length === 0) {
    return `On this address, no ${kind} amount from ${formatBtcRounded(amounts[0])} to ${formatBtcRounded(amounts[last])} would be flagged.`;
  }
  if (runs.length === 1 && runs[0].from === 0 && runs[0].to === last) {
    return `On this address, every ${kind} amount from ${formatBtcRounded(amounts[0])} to ${formatBtcRounded(amounts[last])} would be flagged.`;
  }
  const upper = runs.filter((r) => r.to === last).map((r) => `from about ${formatBtcRounded(runBounds(line, r).start)} upwards`);
  const inner = runs.filter((r) => r.from > 0 && r.to < last).map((r) => `between about ${formatBtcRounded(runBounds(line, r).start)} and ${formatBtcRounded(runBounds(line, r).end)}`);
  const lower = runs.filter((r) => r.from === 0).map((r) => `below about ${formatBtcRounded(runBounds(line, r).end)}`);
  return `On this address, a ${kind} amount would be flagged ${[...upper, ...inner, ...lower].join(', and ')}.`;
}

/** The curve read for a big-number block: a tiny label, the big amount (or a whole sentence), and an optional small "and ..." line. */
export interface CurveReading {
  label?: string;
  value: string;
  note?: string;
}

/**
 * The same reading as `describeCurve`, in the parts of a stat block: "Flagged from" / "0.023 BTC" / "and below 0.000011 BTC".
 * Nothing flagged and everything flagged are whole sentences; a stretch strictly inside the range reads "Flagged between"
 * and a stretch at the low end only reads "Flagged below".
 */
export function readCurve(line: CurveLine): CurveReading {
  const { amounts } = line;
  const last = amounts.length - 1;
  const runs = flaggedRuns(line.flags);
  if (runs.length === 0) return { value: 'No amount in this range is flagged.' };
  if (runs.length === 1 && runs[0].from === 0 && runs[0].to === last) return { value: 'Every amount in this range is flagged.' };
  const upper = runs.filter((r) => r.to === last).map((r) => ({ lead: 'from', text: formatBtcRounded(runBounds(line, r).start) }));
  const inner = runs
    .filter((r) => r.from > 0 && r.to < last)
    .map((r) => ({ lead: 'between', text: `${formatBtcRounded(runBounds(line, r).start)} and ${formatBtcRounded(runBounds(line, r).end)}` }));
  const lower = runs.filter((r) => r.from === 0).map((r) => ({ lead: 'below', text: formatBtcRounded(runBounds(line, r).end) }));
  const [first, ...rest] = [...upper, ...inner, ...lower];
  return {
    label: `Flagged ${first.lead}`,
    value: first.text,
    ...(rest.length > 0 ? { note: `and ${rest.map((p) => `${p.lead} ${p.text}`).join(', and ')}` } : {}),
  };
}

/** The width of one character, as a share of the font size, in the sans-serif the charts use. */
const CHAR_EM = 0.6;
/** The gap left between two tick labels, in pixels. */
const TICK_GAP_PX = 24;

const plain = (amount: number) => amount.toLocaleString('en-US', { maximumFractionDigits: 8 });

/**
 * Where to label a log axis of amounts from `low` to `high` BTC, so that no two labels touch in
 * `plotWidth` pixels. Amounts are written in full ('0.000005', never '5e-6'), so their labels are long:
 * the finest set that fits is chosen, 1, 2 and 5 of each power of ten, then the powers of ten, then every
 * second power, every third, and so on. An empty list means no power of ten lies in the range, and the
 * caller leaves the ticks to Plotly.
 */
export function amountTicks(low: number, high: number, plotWidth: number, fontSize: number): number[] {
  const [first, last] = [Math.floor(Math.log10(low)), Math.ceil(Math.log10(high))];
  const ticksOf = (mantissas: number[], every: number) => {
    const found: number[] = [];
    for (let power = first; power <= last; power += every) {
      for (const m of mantissas) {
        // Built from text so that 1e-5 is exactly the double the label names.
        const amount = Number(`${m}e${power}`);
        if (amount >= low && amount <= high) found.push(amount);
      }
    }
    return found;
  };
  const fits = (ticks: number[]) => ticks.length * (Math.max(0, ...ticks.map((t) => plain(t).length)) * fontSize * CHAR_EM + TICK_GAP_PX) <= plotWidth;

  for (const mantissas of [[1, 2, 5], [1]]) {
    const ticks = ticksOf(mantissas, 1);
    if (fits(ticks)) return ticks;
  }
  let every = 2;
  while (!fits(ticksOf([1], every)) && every < last - first) every++;
  return ticksOf([1], every);
}
