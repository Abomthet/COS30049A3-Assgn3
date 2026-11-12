import { describe, expect, test } from 'vitest';
import { NO_FILTERS, filtersToSearch, isFiltered, parseFilters, toQuery, validateFilters } from '../src/lib/transactionFilters';
import { withMethod } from '../src/lib/methods';
import { parseRoute, paths } from '../src/lib/router';

describe('the filters in the link', () => {
  test('no query string is the default view: newest first, page 1, nothing filtered', () => {
    expect(parseFilters('')).toEqual(NO_FILTERS);
    expect(isFiltered(NO_FILTERS)).toBe(false);
    expect(filtersToSearch(NO_FILTERS)).toBe('');
  });

  test('every filter survives a round trip through the link, and equal filters give equal links', () => {
    const search = 'status=flagged&status=not-scored&direction=out&from=2024-07-01&to=2025-01-31&sort=-score&page=3';
    const filters = parseFilters(search);
    expect(filters).toEqual({ status: ['flagged', 'not-scored'], direction: ['out'], from: '2024-07-01', to: '2025-01-31', sort: '-score', page: 3, method: 'baseline' });
    expect(filtersToSearch(filters)).toBe(search);
    // The order the link was typed in does not matter.
    expect(filtersToSearch(parseFilters('page=3&sort=-score&to=2025-01-31&from=2024-07-01&direction=out&status=not-scored&status=flagged'))).toBe(
      'status=flagged&status=not-scored&direction=out&from=2024-07-01&to=2025-01-31&sort=-score&page=3',
    );
  });

  test('a hand-edited link cannot reach the server malformed: unknown values are dropped', () => {
    expect(parseFilters('status=bogus&direction=none&sort=amount&page=0')).toEqual(NO_FILTERS);
    expect(parseFilters('page=2.5').page).toBe(1);
    expect(parseFilters('page=abc').page).toBe(1);
  });

  test('a date that is not a real day is kept as typed, so it can be corrected', () => {
    expect(parseFilters('from=2024-13-01').from).toBe('2024-13-01');
  });

  test('E6 gets the narrowing filters only; the sort and the page are the caller\'s', () => {
    expect(toQuery(parseFilters('status=flagged&direction=in&direction=out&from=2024-07-01&sort=-score&page=2'))).toEqual({
      status: ['flagged'],
      direction: ['in', 'out'],
      from: '2024-07-01',
    });
    expect(toQuery(NO_FILTERS)).toEqual({});
  });

  test('the transactions tab has its own route, which carries the filters', () => {
    expect(paths.transactions('1abc')).toBe('#/address/1abc/transactions');
    expect(paths.transactions('1abc', 'status=flagged')).toBe('#/address/1abc/transactions?status=flagged');
    expect(parseRoute('#/address/1abc/transactions?status=flagged&page=2')).toEqual({ screen: 'transactions', address: '1abc', search: 'status=flagged&page=2', method: 'baseline' });
    expect(parseRoute('#/address/1abc/transactions')).toEqual({ screen: 'transactions', address: '1abc', search: '', method: 'baseline' });
  });
});

describe('the deciding method in the link', () => {
  test('the default is left out, any other method is kept, and the filters carry it to every request', () => {
    expect(parseFilters('method=baseline').method).toBe('baseline');
    expect(filtersToSearch(parseFilters('method=baseline&status=flagged'))).toBe('status=flagged');
    const lof = parseFilters('status=flagged&method=lof');
    expect(lof.method).toBe('lof');
    expect(filtersToSearch(lof)).toBe('status=flagged&method=lof');
    expect(toQuery(lof)).toEqual({ status: ['flagged'], method: 'lof' });
    expect(toQuery(parseFilters('method=baseline'))).toEqual({});
    // Only the filters narrow the list; a method alone does not.
    expect(isFiltered(lof)).toBe(true);
    expect(isFiltered(parseFilters('method=lof'))).toBe(false);
  });

  test('a method that does not exist is dropped, so a hand-edited link cannot reach the server malformed', () => {
    expect(parseFilters('method=bogus').method).toBe('baseline');
    expect(parseFilters('method=')).toEqual(NO_FILTERS);
  });

  test('every address route reads it and every link builder keeps it, leaving the default out', () => {
    expect(parseRoute('#/address/1abc?method=fusion')).toEqual({ screen: 'timeline', address: '1abc', method: 'fusion' });
    expect(parseRoute('#/address/1abc')).toEqual({ screen: 'timeline', address: '1abc', method: 'baseline' });
    expect(parseRoute('#/address/1abc/day/2026-10-19/tx/ff?method=lof')).toEqual({ screen: 'day', address: '1abc', date: '2026-10-19', txid: 'ff', method: 'lof' });
    expect(parseRoute('#/address/1abc/what-if?direction=out&method=lof')).toMatchObject({ screen: 'what-if', method: 'lof' });
    expect(paths.timeline('1abc', 'lof')).toBe('#/address/1abc?method=lof');
    expect(paths.timeline('1abc', 'baseline')).toBe('#/address/1abc');
    expect(paths.day('1abc', '2026-10-19', 'lof')).toBe('#/address/1abc/day/2026-10-19?method=lof');
    expect(paths.tx('1abc', '2026-10-19', 'ff', 'lof')).toBe('#/address/1abc/day/2026-10-19/tx/ff?method=lof');
    expect(paths.whatIf('1abc', 'out', 'lof')).toBe('#/address/1abc/what-if?direction=out&method=lof');
    expect(paths.whatIf('1abc', undefined, 'baseline')).toBe('#/address/1abc/what-if');
  });

  test('changing the method of a link keeps the filters, resets the page and drops the method for the default', () => {
    expect(withMethod('#/address/1abc/transactions?status=flagged&page=3', 'lof')).toBe('#/address/1abc/transactions?status=flagged&method=lof');
    expect(withMethod('#/address/1abc?method=lof', 'baseline')).toBe('#/address/1abc');
    expect(withMethod('#/address/1abc/day/2026-10-19/tx/ff?method=lof', 'fusion')).toBe('#/address/1abc/day/2026-10-19/tx/ff?method=fusion');
  });
});

describe('validation: the rules the server applies to E6, with its words', () => {
  const example = '2026-10-19';

  test('empty dates and a valid range are fine', () => {
    expect(validateFilters({ from: '', to: '' }, example)).toEqual({});
    expect(validateFilters({ from: '2024-07-01', to: '' }, example)).toEqual({});
    expect(validateFilters({ from: '2024-07-01', to: '2024-07-01' }, example)).toEqual({});
  });

  test.each(['abc', '2024-13-01', '2024-02-30', '2024-1-1', '20240701'])('%s is not a day', (bad) => {
    expect(validateFilters({ from: bad, to: '' }, example)).toEqual({ from: 'Use a day such as 2026-10-19.' });
    expect(validateFilters({ from: '', to: bad }, example)).toEqual({ to: 'Use a day such as 2026-10-19.' });
  });

  test('a first day after the last day marks both fields', () => {
    expect(validateFilters({ from: '2025-01-01', to: '2024-01-01' }, example)).toEqual({
      from: 'Must not be after the last day.',
      to: 'Must not be before the first day.',
    });
  });

  test('a wrong day is reported on its own, not as an order problem', () => {
    expect(validateFilters({ from: '2025-13-01', to: '2024-01-01' }, example)).toEqual({ from: 'Use a day such as 2026-10-19.' });
  });
});
