// The what-if form's rules (plan section 11, "The validation table"): the same checks, with the same
// words, as the server applies to E8 and E9, so a value is refused in the browser before any request
// and the message is what the server would have said. shared/whatif_vectors.json holds the cases
// both tiers must agree on (tests/whatIf.test.ts reads it).

import type { WhatIfDirection } from '../api/types';
import { dayKey, formatDateTime } from './dates';

const SATS_PER_BTC = 100_000_000n;
const MAX_SATS = 21_000_000n * SATS_PER_BTC;
const MAX_DECIMALS = 8;

export type Check<T> = { ok: true; value: T } | { ok: false; message: string };

/** An accepted amount: the decimal string E8 is sent (no float is involved), and its size in satoshis. */
export interface Amount {
  btc: string;
  sats: number;
}

const NOT_AN_AMOUNT = 'Enter an amount in BTC, such as 0.05.';

/** A plain decimal, with the exponent form of a small number written out. */
const plainDecimal = (n: number) => n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 });

/** An amount from the curve as the text the amount field holds: rounded to the eight places an amount can have, never in exponent form. */
export const amountText = (btc: number): string => plainDecimal(Number(btc.toFixed(MAX_DECIMALS)));

/**
 * The amount rules, in the order the server reports them. One comma is read as the decimal point
 * ("0,05"); a comma with a point, or two commas, is a thousands separator, which is refused rather
 * than guessed at. Digits beyond the eighth are fine only when they are zeros.
 */
export function checkAmount(input: unknown): Check<Amount> {
  if (typeof input !== 'string' && typeof input !== 'number') return { ok: false, message: 'Must be a number.' };
  const text = (typeof input === 'number' ? (Number.isFinite(input) ? plainDecimal(input) : '') : input).trim();
  if (text === '') return { ok: false, message: NOT_AN_AMOUNT };

  const commas = text.split(',').length - 1;
  if (commas > 1 || (commas === 1 && text.includes('.'))) {
    return { ok: false, message: 'Write the amount without thousands separators, such as 1250.5.' };
  }
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text.replace(',', '.'));
  if (!match || (match[2] === '' && !match[3])) return { ok: false, message: NOT_AN_AMOUNT };

  const [, minus, whole, fraction = ''] = match;
  const kept = fraction.slice(0, MAX_DECIMALS).padEnd(MAX_DECIMALS, '0');
  const sats = BigInt(whole || '0') * SATS_PER_BTC + BigInt(kept);
  const extra = /[1-9]/.test(fraction.slice(MAX_DECIMALS));

  if (minus || (sats === 0n && !extra)) return { ok: false, message: 'Must be greater than 0.' };
  if (sats === 0n) return { ok: false, message: 'Must be at least 0.00000001 BTC (one satoshi).' };
  if (sats > MAX_SATS || (sats === MAX_SATS && extra)) return { ok: false, message: 'Must be at most 21,000,000 BTC.' };
  if (extra) return { ok: false, message: `Use at most ${MAX_DECIMALS} decimal places.` };
  return { ok: true, value: { btc: `${whole || '0'}.${kept}`.replace(/\.?0+$/, ''), sats: Number(sats) } };
}

export function checkDirection(input: unknown): Check<WhatIfDirection> {
  return input === 'in' || input === 'out' ? { ok: true, value: input } : { ok: false, message: 'Must be "in" or "out".' };
}

const BAD_TIME = 'Use a date and time such as 2026-10-20T12:00:00Z.';
const ISO_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** A real date and time with a zone, as E8 reads it; the value is that moment in UTC, as `2026-10-20T12:00:00Z`. */
export function checkTime(input: unknown): Check<string> {
  const match = typeof input === 'string' ? ISO_WITH_ZONE.exec(input) : null;
  const moment = match ? Date.parse(input as string) : NaN;
  if (!match || Number.isNaN(moment)) return { ok: false, message: BAD_TIME };
  // Date.parse rolls 30 February into March, so the day is checked as written.
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return { ok: false, message: BAD_TIME };
  return { ok: true, value: new Date(moment).toISOString().slice(0, 19) + 'Z' };
}

/**
 * The time field's two parts joined as UTC, and checked against the address: not before its first
 * transaction, and no more than `maxGapYears` after its last (the server's wording for the second).
 */
export function checkWhen(date: string, clock: string, range: { start: string; end: string }, maxGapYears: number): Check<string> {
  const time = checkTime(`${date}T${clock}:00Z`);
  if (!time.ok) return time;
  if (Date.parse(time.value) < Date.parse(range.start)) {
    return { ok: false, message: `Must not be before this address's first transaction (${formatDateTime(range.start)}).` };
  }
  const latest = new Date(range.end);
  latest.setUTCFullYear(latest.getUTCFullYear() + maxGapYears);
  if (Date.parse(time.value) > latest.getTime()) {
    return { ok: false, message: `At most ${maxGapYears} years after this address's last transaction.` };
  }
  return time;
}

/** Splits E2's default time (or any UTC moment) into the date and clock the two fields hold. */
export function splitTime(iso: string): { date: string; clock: string } {
  return { date: dayKey(iso), clock: new Date(iso).toISOString().slice(11, 16) };
}
