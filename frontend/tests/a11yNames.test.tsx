// A-01 (WCAG 2.5.3 Label in Name) and A-02 (WCAG 2.1.1 Keyboard): the accessible name of a shortened address link and
// the keyboard stop on a table's scroll box.
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { AddressLink } from '../src/components/AddressLink';
import { TableScroll } from '../src/components/TableScroll';
import { shortAddress } from '../src/lib/format';

const ADDRESS = '36V7afbhZnvpAbCdEfGhJkLmNpQrStUv2vtHDB6L';

describe('AddressLink', () => {
  test('the accessible name starts with the visible text and still holds the full address', () => {
    render(<AddressLink address={ADDRESS} href="#/a" />);
    const link = screen.getByRole('link');
    const visible = shortAddress(ADDRESS, 12, 8);
    expect(visible).not.toBe(ADDRESS);
    expect(link.getAttribute('aria-label')).toBeNull();
    expect(link).toHaveAccessibleName(new RegExp(`^${visible}`));
    expect(link).toHaveAccessibleName(new RegExp(ADDRESS));
  });

  test('the extra words are visually hidden, so the link shows only the short form', () => {
    render(<AddressLink address={ADDRESS} href="#/a" />);
    const hidden = screen.getByRole('link').querySelector('.sr-only');
    expect(hidden?.textContent).toContain(ADDRESS);
  });

  test('an address too short to be shortened is not repeated', () => {
    render(<AddressLink address="1abc" href="#/a" />);
    expect(screen.getByRole('link')).toHaveAccessibleName('1abc');
  });
});

describe('TableScroll', () => {
  test('is a named, focusable region', () => {
    render(
      <TableScroll label="Kept scenarios">
        <table />
      </TableScroll>,
    );
    const box = screen.getByRole('region', { name: 'Kept scenarios' });
    expect(box.tabIndex).toBe(0);
    box.focus();
    expect(box).toHaveFocus();
  });
});
