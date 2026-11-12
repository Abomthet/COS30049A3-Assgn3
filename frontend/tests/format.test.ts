import { describe, expect, test } from 'vitest';
import { explanationBlocks } from '../src/lib/explanation';
import { formatBtc, formatFeatureValue, formatSpanDays } from '../src/lib/format';
import { LIMITATION_LINE } from '../src/lib/settings';

describe('formatFeatureValue: units come from E2, not from the feature id', () => {
  test.each([
    [0.05, 'BTC', '0.05000000 BTC'],
    [0.000525, 'BTC', '0.00052500 BTC'],
    [1234.5, 'BTC', '1,234.50000000 BTC'],
    [47.92, 'hours', '48 hours'],
    [144.15, 'hours', '6 days'],
    [0.381, 'ratio', '0.4×'],
    [1.3856, 'ratio', '1.4×'],
    [1, 'count', '1'],
    [2.25, 'count', '2.3'],
    [2.25, undefined, '2.25'],
    [144.151944444, undefined, '144'],
  ] as const)('%s as %s is %s', (value, unit, text) => {
    expect(formatFeatureValue(value, unit)).toBe(text);
  });

  test('no value is a dash', () => {
    expect(formatFeatureValue(null, 'BTC')).toBe('—');
  });
});

describe('formatBtc: the one amount format', () => {
  test('eight decimals always, so the same amount reads the same in every place', () => {
    expect(formatBtc(111_260)).toBe('0.00111260 BTC');
    expect(formatBtc(0)).toBe('0.00000000 BTC');
    expect(formatBtc(150_000_000)).toBe('1.50000000 BTC');
  });

  test('a net amount keeps its sign, with a real minus; a plus only when asked for', () => {
    expect(formatBtc(-239_392)).toBe('−0.00239392 BTC');
    expect(formatBtc(56_497)).toBe('0.00056497 BTC');
    expect(formatBtc(56_497, { signed: true })).toBe('+0.00056497 BTC');
  });

  test('a feature value in BTC is printed the same way as the amounts beside it', () => {
    expect(formatFeatureValue(0.0011126, 'BTC')).toBe(formatBtc(111_260));
  });
});

describe('formatSpanDays', () => {
  test('E5 and E7 give fractional days: under a day, or whole days', () => {
    expect(formatSpanDays(0)).toBe('under a day');
    expect(formatSpanDays(0.74)).toBe('under a day');
    expect(formatSpanDays(1)).toBe('1 day');
    expect(formatSpanDays(886.370902778)).toBe('886 days');
  });
});

describe('explanationBlocks', () => {
  const text = `Flagged by Robust z baseline (A1).\nWhat stands out compared with this address's own history:\n- Longer gap than usual: 5 days.\n- Larger amount than usual: 0.002 BTC.\n${LIMITATION_LINE}`;

  test('headings become paragraphs, "- " lines one list, and the limitation line is left to its own place', () => {
    expect(explanationBlocks(text, LIMITATION_LINE)).toEqual([
      { kind: 'text', text: 'Flagged by Robust z baseline (A1).' },
      { kind: 'text', text: "What stands out compared with this address's own history:" },
      { kind: 'list', items: ['Longer gap than usual: 5 days.', 'Larger amount than usual: 0.002 BTC.'] },
    ]);
  });

  test('an explanation without the limitation line (not flagged) is kept whole', () => {
    expect(explanationBlocks('Not flagged by X.\n- One thing.', LIMITATION_LINE)).toHaveLength(2);
  });
});
