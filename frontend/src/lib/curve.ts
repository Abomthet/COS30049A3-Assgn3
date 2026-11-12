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
