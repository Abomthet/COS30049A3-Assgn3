import type { Direction, FeatureUnit } from '../api/types';

const SATS_PER_BTC = 100_000_000;
const MAX_DECIMALS = 8;

/** The one way every amount is printed: '1,204.00042100 BTC'. Always 8 decimals, so amounts agree everywhere and line up in monospace columns. */
export function formatBtc(sats: number, opts: { signed?: boolean } = {}): string {
  const sign = sats < 0 ? '−' : opts.signed && sats > 0 ? '+' : '';
  const abs = Math.abs(Math.round(sats));
  const whole = Math.floor(abs / SATS_PER_BTC).toLocaleString('en-US');
  const frac = String(abs % SATS_PER_BTC).padStart(8, '0');
  return `${sign}${whole}.${frac} BTC`;
}

/** An amount in BTC (not satoshis) rounded to two significant digits and written out in full, for labels and sentences: '0.023 BTC', '0.00001 BTC'. */
export function formatBtcRounded(btc: number): string {
  const digits = Math.min(MAX_DECIMALS, Math.max(0, 1 - Math.floor(Math.log10(btc))));
  return `${Number(btc.toFixed(digits)).toLocaleString('en-US', { maximumFractionDigits: MAX_DECIMALS })} BTC`;
}

/** A share between 0 and 1 as a whole percentage: '66%'. */
export const formatShare = (share: number): string => `${Math.round(share * 100)}%`;

/** A measured share with its 95% interval: '66% (58% to 73%)'. */
export const formatInterval = ({ value, ciLow, ciHigh }: { value: number; ciLow: number; ciHigh: number }): string => `${formatShare(value)} (${formatShare(ciLow)} to ${formatShare(ciHigh)})`;

/** A whole number with thousands separators: formatCount(1204) is '1,204'. */
export function formatCount(n: number): string {
  return n.toLocaleString('en-US');
}

/** A count with its noun in the right form: plural(1, 'transaction') is '1 transaction', plural(2, 'transaction') is '2 transactions'. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatCount(n)} ${n === 1 ? one : many}`;
}

/** Gap length in words: '35 min', '22 hours', '3.5 days', '75 days'. */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) {
    const h = hours < 10 ? Number(hours.toFixed(1)) : Math.round(hours);
    return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  }
  const days = hours / 24;
  return `${days < 10 ? Number(days.toFixed(1)) : Math.round(days)} days`;
}

/** A ratio with a times sign and few decimals: formatRatio(12.34) is '12×', formatRatio(0.5) is '0.5×'. */
export function formatRatio(r: number): string {
  if (r >= 100) return `${Math.round(r).toLocaleString('en-US')}×`;
  if (r >= 10) return `${r.toFixed(0)}×`;
  if (r >= 0.1) return `${r.toFixed(1)}×`;
  return `${r.toFixed(3)}×`;
}

/** A feature's value or usual value in the unit E2 names for it; a unit that is not known yet shows the bare number. */
export function formatFeatureValue(value: number | null, unit: FeatureUnit | undefined): string {
  if (value === null) return '—';
  switch (unit) {
    case 'BTC':
      return formatBtc(value * SATS_PER_BTC);
    case 'hours':
      return formatHours(value);
    case 'ratio':
      return formatRatio(value);
    case 'count':
      return String(Number(value.toFixed(1)));
    default:
      return String(Number(value.toPrecision(3)));
  }
}

/** A span of days from E5 or E7, which is fractional: '12 days', or 'under a day'. */
export function formatSpanDays(days: number): string {
  return days < 1 ? 'under a day' : plural(Math.floor(days), 'day');
}

/** A robust z-score with its sign: formatZ(5.9) is '+5.9', formatZ(-12.4) is '−12'. */
export function formatZ(z: number): string {
  const s = Math.abs(z) >= 10 ? Math.abs(z).toFixed(0) : Math.abs(z).toFixed(1);
  return `${z < 0 ? '−' : '+'}${s}`;
}

/** 'bc1qyzcv…m9n8qa' — keep both ends, which is what people compare by eye. */
export function shortAddress(address: string, head = 8, tail = 6): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

/** A transaction ID shortened for display: its first 10 and last 6 characters with an ellipsis between. */
export function shortTxid(txid: string): string {
  return `${txid.slice(0, 10)}…${txid.slice(-6)}`;
}

export const DIRECTION_LABEL: Record<Direction, string> = {
  in: 'Received',
  out: 'Sent',
  none: 'No net change',
};

const LIST = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

/** Items in a sentence: 'Size, Burst, Gap and Relative size'. British style, with no comma before the "and", as in the rest of the text. */
export const formatList = (items: string[]): string => LIST.format(items);

/** Capitalises the first letter of a text: capitalised('unusual') is 'Unusual'. */
export const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
