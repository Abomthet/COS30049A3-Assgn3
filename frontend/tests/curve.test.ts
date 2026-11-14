import { describe, expect, test } from 'vitest';
import { amountTicks, crossings, describeCurve, flagNear, flaggedRuns, runBounds, scoreAt, type CurveLine } from '../src/lib/curve';
import { formatBtcRounded } from '../src/lib/format';

// Five amounts a decade apart, so every position between two of them is easy to check by hand.
const AMOUNTS = [0.001, 0.01, 0.1, 1, 10];
const line = (scores: Array<number | null>, flags: boolean[], threshold = 5): CurveLine => ({ amounts: AMOUNTS, scores, flags, threshold });
/** Flagged at both ends and not in the middle, as the baseline's curve is for the running example. */
const valley = line([8, 2, 1, 4, 9], [true, false, false, false, true]);

describe('where the curve meets the flag line', () => {
  test('is found on the logarithm of the amount, between the two points whose flags differ', () => {
    // 8 to 2 crosses 5 half way, and 4 to 9 a fifth of the way: 10^-2.5 and 10^0.2.
    expect(crossings(valley)[0]).toBeCloseTo(10 ** -2.5, 6);
    expect(crossings(valley)[1]).toBeCloseTo(10 ** 0.2, 6);
  });

  test('is halfway when the flag does not follow the score (a method that flags on something else)', () => {
    expect(crossings(line([1, 1, 2, 2, 2], [false, false, true, true, true]))).toEqual([expect.closeTo(10 ** -1.5, 6)]);
  });

  test('is empty when nothing flags, or everything does', () => {
    expect(crossings(line([1, 1, 1, 1, 1], [false, false, false, false, false]))).toEqual([]);
    expect(crossings(line([9, 9, 9, 9, 9], [true, true, true, true, true]))).toEqual([]);
  });
});

describe('the flagged stretches', () => {
  test('are runs of flagged points, and run from the edge of the range or from a crossing', () => {
    const runs = flaggedRuns(valley.flags);
    expect(runs).toEqual([{ from: 0, to: 0 }, { from: 4, to: 4 }]);
    expect(runBounds(valley, runs[0])).toEqual({ start: 0.001, end: expect.closeTo(10 ** -2.5, 6) });
    expect(runBounds(valley, runs[1])).toEqual({ start: expect.closeTo(10 ** 0.2, 6), end: 10 });
  });
});

describe('the score and the flag at an amount', () => {
  test('score is joined straight between points on the log scale, and unknown outside the range', () => {
    expect(scoreAt(valley, 10 ** -1.5)).toBeCloseTo(1.5, 6);
    expect(scoreAt(valley, 0.1)).toBe(1);
    expect(scoreAt(valley, 100)).toBeNull();
    expect(scoreAt(valley, 0.0001)).toBeNull();
  });

  test('unknown where a neighbour has no score', () => {
    expect(scoreAt(line([8, null, 1, 4, 9], valley.flags), 0.003)).toBeNull();
  });

  test('flag is the nearest point\'s', () => {
    expect(flagNear(valley, 0.002)).toBe(true);
    expect(flagNear(valley, 0.5)).toBe(false);
    expect(flagNear(valley, 5)).toBe(true);
  });
});

describe('the sentence under the curve', () => {
  test('names the stretches, the upper one first, as the plan words it', () => {
    expect(describeCurve(valley, 'out')).toBe(
      `On this address, a sent amount would be flagged from about ${formatBtcRounded(10 ** 0.2)} upwards, and below about ${formatBtcRounded(10 ** -2.5)}.`,
    );
    expect(describeCurve(valley, 'out')).toBe('On this address, a sent amount would be flagged from about 1.6 BTC upwards, and below about 0.0032 BTC.');
  });

  test('says "between" for a stretch inside the range, and "received" for the other direction', () => {
    const inner = line([1, 8, 8, 1, 1], [false, true, true, false, false]);
    expect(describeCurve(inner, 'in')).toMatch(/^On this address, a received amount would be flagged between about 0\.0\d+ BTC and 0?\.?\d+ BTC\.$/);
  });

  test('says so when nothing, or everything, in the range would be flagged', () => {
    expect(describeCurve(line([1, 1, 1, 1, 1], [false, false, false, false, false]), 'out')).toBe('On this address, no sent amount from 0.001 BTC to 10 BTC would be flagged.');
    expect(describeCurve(line([9, 9, 9, 9, 9], [true, true, true, true, true]), 'in')).toBe('On this address, every received amount from 0.001 BTC to 10 BTC would be flagged.');
  });
});

describe('formatBtcRounded', () => {
  test.each([
    [0.02312, '0.023 BTC'],
    [0.00001, '0.00001 BTC'],
    [0.0000052, '0.0000052 BTC'],
    [52.4, '52 BTC'],
    [1234, '1,234 BTC'],
    [0.05, '0.05 BTC'],
  ])('%s is written %s', (btc, text) => expect(formatBtcRounded(btc)).toBe(text));
});

describe('amountTicks: labels on the log axis of amounts never touch', () => {
  const plain = (a: number) => a.toLocaleString('en-US', { maximumFractionDigits: 8 });

  test('five decades on a desktop chart label the powers of ten (the 1, 2, 5 labels collided there)', () => {
    expect(amountTicks(0.00001, 1, 700, 12)).toEqual([0.00001, 0.0001, 0.001, 0.01, 0.1, 1]);
  });

  test('a narrow range has room for 1, 2 and 5 of each power of ten', () => {
    expect(amountTicks(0.01, 1, 700, 12)).toEqual([0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1]);
  });

  test('a phone keeps every other power of ten', () => {
    expect(amountTicks(0.00001, 1, 260, 11)).toEqual([0.00001, 0.001, 0.1]);
  });

  test.each([
    [0.000001, 10],
    [0.00001, 1],
    [0.0001, 0.5],
    [0.000011, 2.5],
    [0.00000001, 21000000],
  ])('from %s to %s BTC, at every width from a phone to a wide screen, no two labels overlap', (low, high) => {
    for (const [width, fontSize] of [[300, 11], [340, 11], [420, 11], [560, 12], [780, 12], [1000, 12], [1180, 12], [1600, 12]]) {
      const plotWidth = width - 80;
      const ticks = amountTicks(low, high, plotWidth, fontSize);
      const longest = Math.max(...ticks.map((t) => plain(t).length));
      expect(ticks.every((t) => t >= low && t <= high)).toBe(true);
      expect(ticks.every((t, i) => i === 0 || t > ticks[i - 1])).toBe(true);
      // Each label needs its own width plus a gap, in the space the plot has.
      expect(ticks.length * longest * fontSize * 0.6).toBeLessThanOrEqual(plotWidth);
    }
  });

  test('a range with no power of ten in it has no ticks of its own, and Plotly is left to choose', () => {
    expect(amountTicks(0.0006, 0.0009, 700, 12)).toEqual([]);
  });
});
