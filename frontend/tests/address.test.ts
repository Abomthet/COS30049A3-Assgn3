import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { base58CheckEncode, segwitEncode, validateAddress, type AddressKind } from '../src/lib/address';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

// The vectors both tiers must agree on (backend/tests/test_validation.py reads the same file): valid
// addresses of every type, and one invalid address for each failure the checker names.
interface AddressVector {
  id: string;
  input: string;
  ok: boolean;
  address?: string;
  kind?: AddressKind;
  message?: string;
  hint?: string;
  /** Checked by the server alone: the browser has no length limit. */
  serverOnly?: true;
}
const vectors = (JSON.parse(readFileSync(join(__dirname, '..', '..', 'shared', 'address_vectors.json'), 'utf8')) as { addresses: AddressVector[] }).addresses;

describe('validateAddress', () => {
  const shared = vectors.filter((v) => !v.serverOnly);

  test('the shared vectors cover every type and failure, and every one is run', () => {
    expect(shared.length).toBeGreaterThanOrEqual(50);
    expect(new Set(shared.filter((v) => v.ok).map((v) => v.kind))).toEqual(new Set(['p2pkh', 'p2sh', 'p2wpkh', 'p2wsh', 'p2tr', 'segwit']));
  });

  test.each(shared.map((v) => [v.id, v] as const))('shared vector %s: same verdict, type and message as the server', (_id, v) => {
    const r = validateAddress(v.input);
    expect(r.ok).toBe(v.ok);
    if (r.ok) expect(r).toEqual({ ok: true, address: v.address, kind: v.kind });
    else expect(r).toEqual({ ok: false, message: v.message, hint: v.hint });
  });

  test('accepts the genesis block address', () => {
    expect(validateAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toMatchObject({ ok: true, kind: 'p2pkh' });
  });

  test('round-trips addresses it encodes', () => {
    const bytes = (n: number, s: number) => Uint8Array.from({ length: n }, (_, i) => (i * 17 + s) & 255);
    expect(validateAddress(segwitEncode(0, bytes(20, 1)))).toMatchObject({ ok: true, kind: 'p2wpkh' });
    expect(validateAddress(segwitEncode(0, bytes(32, 2)))).toMatchObject({ ok: true, kind: 'p2wsh' });
    expect(validateAddress(segwitEncode(1, bytes(32, 3)))).toMatchObject({ ok: true, kind: 'p2tr' });
    expect(validateAddress(base58CheckEncode(0x00, bytes(20, 4)))).toMatchObject({ ok: true, kind: 'p2pkh' });
    expect(validateAddress(base58CheckEncode(0x05, bytes(20, 5)))).toMatchObject({ ok: true, kind: 'p2sh' });
  });

  test('catches every single-character typo in a bc1 address', () => {
    const good = segwitEncode(0, Uint8Array.from({ length: 20 }, (_, i) => i * 7));
    for (let pos = 4; pos < good.length; pos++) {
      for (const ch of CHARSET) {
        if (ch === good[pos]) continue;
        const typo = good.slice(0, pos) + ch + good.slice(pos + 1);
        expect(validateAddress(typo).ok, typo).toBe(false);
      }
    }
  });

  test('catches typos in legacy addresses', () => {
    const good = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
    for (const pos of [1, 5, 12, 20, 33]) {
      const typo = good.slice(0, pos) + (good[pos] === 'x' ? 'y' : 'x') + good.slice(pos + 1);
      const r = validateAddress(typo);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toBe('Check the address for a typo.');
    }
  });

  test('bc1 addresses: upper case is fine, mixed case is not', () => {
    const good = segwitEncode(0, Uint8Array.from({ length: 20 }, (_, i) => i));
    expect(validateAddress(good.toUpperCase())).toMatchObject({ ok: true, address: good });
    const mixed = good.slice(0, 10) + good.slice(10).toUpperCase();
    expect(validateAddress(mixed)).toMatchObject({ ok: false, message: 'bc1 addresses are all lower case.' });
  });

  test('explains common mistakes with a specific message', () => {
    const msg = (s: string) => {
      const r = validateAddress(s);
      return r.ok ? 'ok' : r.message;
    };
    expect(msg('')).toBe('Paste a Bitcoin address or pick one from the list.');
    expect(msg('   ')).toBe('Paste a Bitcoin address or pick one from the list.');
    expect(msg('bc1q abc')).toBe('Remove the spaces.');
    expect(msg('0x52908400098527886E0F7030069857D2E4169EE7')).toBe('That looks like an Ethereum address. Enter a Bitcoin address.');
    expect(msg('tb1qw508d6qejxtdg4c5r56hfjn3gye7jn8xyr0kud')).toBe('That is a test-network address. Enter a main-network address.');
    expect(msg('hello')).toBe("That isn't a Bitcoin address.");
    expect(msg('1A1zP1eP5QGefi2DMPTfTL5SLmv7Div0Na')).toBe('"0" isn\'t allowed. Remove it.');
    expect(msg('bc1qbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')).toBe('"b" isn\'t allowed. Remove it.');
    // The placeholders are filled from the same values as before: the length found, and the range of that kind.
    expect(msg('1'.repeat(12))).toBe('12 characters; this kind has 26 to 35.');
    expect(msg('bc1q')).toBe('4 characters; bc1 addresses have 42 or 62.');
    expect(msg('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5')).toBe("Check the address for a typo.");
  });

  test('no message carries a hint, so nothing under the field repeats the helper line', () => {
    for (const v of vectors.filter((x) => !x.ok && !x.serverOnly)) {
      const r = validateAddress(v.input);
      expect(r).toMatchObject({ ok: false, hint: '' });
      expect(!r.ok && r.message).not.toMatch(/start with 1, 3 or bc1/);
    }
  });

  test('surrounding spaces from a paste are ignored', () => {
    expect(validateAddress('  1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa \n')).toMatchObject({ ok: true });
  });
});
