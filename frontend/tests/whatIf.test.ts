import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { amountText, checkAmount, checkDirection, checkTime, checkWhen, splitTime } from '../src/lib/whatIf';

// The vectors both tiers must agree on (backend/tests/test_whatif_api.py reads the same file). Each is
// one field of an E8 body; a refused one carries the message the server sends under `fields`.
interface Vector {
  id: string;
  input: unknown;
  ok: boolean;
  message?: string;
  sats?: number;
  utc?: string;
}
const vectors = JSON.parse(readFileSync(join(__dirname, '..', '..', 'shared', 'whatif_vectors.json'), 'utf8')) as {
  limits: { minAmountBtc: string; maxAmountBtc: string; maxDecimals: number };
  amountBtc: Vector[];
  direction: Vector[];
  time: Vector[];
};

describe('the shared what-if vectors', () => {
  test('the vectors cover accepted and refused values of every field, and every one is run below', () => {
    for (const field of [vectors.amountBtc, vectors.direction, vectors.time]) {
      expect(field.some((v) => v.ok)).toBe(true);
      expect(field.some((v) => !v.ok)).toBe(true);
    }
    expect(vectors.amountBtc.length).toBeGreaterThanOrEqual(19);
  });

  test.each(vectors.amountBtc.map((v) => [v.id, v] as const))('amountBtc %s: same verdict, size and message as the server', (_id, v) => {
    const r = checkAmount(v.input);
    expect(r.ok).toBe(v.ok);
    if (r.ok) expect(r.value.sats).toBe(v.sats);
    else expect(r.message).toBe(v.message);
  });

  test.each(vectors.direction.map((v) => [v.id, v] as const))('direction %s: same verdict and message as the server', (_id, v) => {
    const r = checkDirection(v.input);
    expect(r.ok).toBe(v.ok);
    if (!r.ok) expect(r.message).toBe(v.message);
  });

  test.each(vectors.time.map((v) => [v.id, v] as const))('time %s: same verdict, UTC moment and message as the server', (_id, v) => {
    const r = checkTime(v.input);
    expect(r.ok).toBe(v.ok);
    if (r.ok) expect(r.value).toBe(v.utc);
    else expect(r.message).toBe(v.message);
  });

  test("the limits are the settings' (web.whatIf) and the vectors' own", async () => {
    const { WEB } = await import('../src/lib/settings');
    expect(WEB.whatIf.minAmountBtc).toBe(Number(vectors.limits.minAmountBtc));
    expect(WEB.whatIf.maxAmountBtc).toBe(Number(vectors.limits.maxAmountBtc));
  });
});

describe('checkAmount beyond the vectors', () => {
  test('the value sent is a decimal string with no float in it, and trailing zeros are dropped', () => {
    expect(checkAmount('0,0500')).toMatchObject({ ok: true, value: { btc: '0.05', sats: 5_000_000 } });
    expect(checkAmount('100')).toMatchObject({ ok: true, value: { btc: '100', sats: 10_000_000_000 } });
    expect(checkAmount('.5')).toMatchObject({ ok: true, value: { btc: '0.5' } });
    expect(checkAmount('0.123456780')).toMatchObject({ ok: true, value: { btc: '0.12345678' } });
  });

  test('a float that prints in exponent form is read as the decimal it stands for', () => {
    expect(checkAmount(0.0000001)).toMatchObject({ ok: true, value: { btc: '0.0000001', sats: 10 } });
  });

  test('two commas, or a letter among the digits, are refused with the server\'s words', () => {
    expect(checkAmount('1,2,3')).toMatchObject({ ok: false, message: expect.stringMatching(/thousands separators/) });
    expect(checkAmount('0.0x5')).toMatchObject({ ok: false, message: 'Enter an amount in BTC, such as 0.05.' });
    expect(checkAmount('.')).toMatchObject({ ok: false, message: 'Enter an amount in BTC, such as 0.05.' });
  });

  test('amountText writes a curve amount in the plain decimals the field holds', () => {
    expect(amountText(0.0000052494759)).toBe('0.00000525');
    expect(amountText(0.05)).toBe('0.05');
    expect(amountText(12)).toBe('12');
  });
});

describe('checkTime beyond the vectors', () => {
  test('refuses a day that does not exist even though Date would roll it into the next month', () => {
    expect(checkTime('2026-02-30T00:00:00Z')).toMatchObject({ ok: false });
    expect(checkTime('2028-02-29T00:00:00Z')).toMatchObject({ ok: true, value: '2028-02-29T00:00:00Z' });
  });
});

describe('checkWhen: the time field against the address', () => {
  const range = { start: '2024-05-16T05:16:19Z', end: '2026-10-19T14:10:25Z' };

  test('joins the date and the time of day as UTC', () => {
    expect(checkWhen('2026-10-20', '12:00', range, 5)).toEqual({ ok: true, value: '2026-10-20T12:00:00Z' });
    expect(splitTime('2026-10-22T12:00:00Z')).toEqual({ date: '2026-10-22', clock: '12:00' });
  });

  test('before the first transaction, and more than maxGapYears after the last, are refused', () => {
    expect(checkWhen('2024-05-16', '04:00', range, 5)).toEqual({ ok: false, message: 'Pick a time after its first transaction (16 May 2024, 05:16 UTC).' });
    expect(checkWhen('2031-10-19', '14:10', range, 5)).toMatchObject({ ok: true });
    expect(checkWhen('2031-10-19', '14:11', range, 5)).toEqual({ ok: false, message: 'Pick a time within 5 years of its last transaction.' });
  });

  test('an empty date or time of day is the shared message for a time that is not a time', () => {
    expect(checkWhen('', '12:00', range, 5)).toEqual({ ok: false, message: 'Enter a valid date and time.' });
    expect(checkWhen('2026-10-20', '', range, 5)).toMatchObject({ ok: false });
  });
});
