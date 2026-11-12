import { describe, expect, test } from 'vitest';
import { NO_FILTERS, filtersToSearch, isFiltered, parseFilters, toQuery, validateFilters } from '../src/lib/transactionFilters';
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
    expect(filters).toEqual({ status: ['flagged', 'not-scored'], direction: ['out'], from: '2024-07-01', to: '2025-01-31', sort: '-score', page: 3 });
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
    expect(parseRoute('#/address/1abc/transactions?status=flagged&page=2')).toEqual({ screen: 'transactions', address: '1abc', search: 'status=flagged&page=2' });
    expect(parseRoute('#/address/1abc/transactions')).toEqual({ screen: 'transactions', address: '1abc', search: '' });
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
