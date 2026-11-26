import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AboutScreen } from '../src/views/AboutScreen';
import { ModelsScreen } from '../src/views/ModelsScreen';
import { SelectScreen } from '../src/views/SelectScreen';
import { PAGE_SECTIONS, parseRoute, paths } from '../src/lib/router';

describe('section links in the router', () => {
  it('reads the section only when it is present and not empty', () => {
    expect(parseRoute('#/about')).toEqual({ screen: 'about' });
    expect(parseRoute('#/about?section=')).toEqual({ screen: 'about' });
    expect(parseRoute('#/about?section=limits')).toEqual({ screen: 'about', section: 'limits' });
    expect(parseRoute('#/models?section=flag')).toEqual({ screen: 'models', section: 'flag' });
    expect(parseRoute('#/watchlist')).toEqual({ screen: 'watchlist' });
    expect(parseRoute('#/')).toEqual({ screen: 'select', query: null });
    expect(parseRoute('#/?section=snapshot')).toEqual({ screen: 'select', query: null, section: 'snapshot' });
    expect(parseRoute('#/?q=abc&section=lookup')).toEqual({ screen: 'select', query: 'abc', section: 'lookup' });
  });

  it('builds the same paths as before without a section, and a query with one', () => {
    expect(paths.select()).toBe('#/');
    expect(paths.models()).toBe('#/models');
    expect(paths.about()).toBe('#/about');
    expect(paths.about('limits')).toBe('#/about?section=limits');
    expect(paths.models('flag')).toBe('#/models?section=flag');
    expect(paths.select('snapshot')).toBe('#/?section=snapshot');
  });

  it('every listed section makes a path that parses back to it', () => {
    for (const screen of ['select', 'models', 'about'] as const) {
      for (const { id } of PAGE_SECTIONS[screen]) {
        expect(parseRoute(paths[screen](id))).toMatchObject({ screen, section: id });
      }
    }
  });
});

describe('opening a section', () => {
  it('scrolls to the Limits heading and focuses it', async () => {
    render(<AboutScreen section="limits" />);
    const heading = screen.getByRole('heading', { name: 'Limits' });
    await waitFor(() => expect(heading).toHaveFocus());
  });

  it('moves to the new section when it changes on the same page', async () => {
    const { rerender } = render(<AboutScreen section="limits" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Limits' })).toHaveFocus());
    rerender(<AboutScreen section="keys" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Keyboard' })).toHaveFocus());
  });

  it('focuses the address box for the lookup section', async () => {
    render(<SelectScreen query={null} section="lookup" />);
    await waitFor(() => expect(document.getElementById('address-input')).toHaveFocus());
  });

  it("scrolls to one model's card and focuses its name", async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<ModelsScreen section="model-lof" />);
    const card = await screen.findByTestId('method-lof');
    expect(card).toHaveAttribute('id', 'model-lof');
    expect(card).toHaveAttribute('data-section');
    await waitFor(() => expect(card.querySelector('h3')).toHaveFocus());
    expect(scroll.mock.contexts).toContain(card);
  });

  it('does nothing when the section is not on the page', () => {
    render(<SelectScreen query={null} section="recent" />);
    expect(document.getElementById('recent-title')).toBeNull();
    expect(document.getElementById('snapshot-title')).not.toHaveFocus();
  });
});
