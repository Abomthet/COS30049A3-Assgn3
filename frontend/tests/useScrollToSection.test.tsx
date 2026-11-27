import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollToSection } from '../src/hooks/useScrollToSection';

const TARGETS = { limits: 'limits-title' };

function Page({ section, ready = true }: { section?: string; ready?: boolean }) {
  useScrollToSection(section, TARGETS);
  return (
    <div>
      <a href="#/about?section=limits">Limits link</a>
      {ready ? <h2 id="limits-title">Limits</h2> : null}
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.location.hash = '';
});

describe('useScrollToSection', () => {
  it('jumps again when a link to the hash already in the address bar is followed', async () => {
    window.location.hash = '#/about?section=limits';
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    render(<Page section="limits" />);
    const heading = screen.getByRole('heading', { name: 'Limits' });
    await waitFor(() => expect(heading).toHaveFocus());
    const before = scroll.mock.calls.length;
    heading.blur();
    fireEvent.click(screen.getByRole('link', { name: 'Limits link' }));
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scroll.mock.calls.length).toBeGreaterThan(before);
  });

  it('keeps waiting for a target that appears after more than two seconds', async () => {
    vi.useFakeTimers();
    const { rerender } = render(<Page section="limits" ready={false} />);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(document.getElementById('limits-title')).toBeNull();
    rerender(<Page section="limits" ready />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(document.getElementById('limits-title')).toHaveFocus();
  });

  it('stops watching for the target once the section is cleared', async () => {
    const { rerender } = render(<Page section="limits" ready={false} />);
    rerender(<Page section={undefined} ready={false} />);
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    rerender(<Page section={undefined} ready />);
    await Promise.resolve();
    expect(scroll).not.toHaveBeenCalled();
  });

  describe('the pull back to the section', () => {
    // The heading sits off its place, so every 100 ms the page would scroll to it again unless the person has taken over.
    async function setup() {
      vi.useFakeTimers();
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {});
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ top: 400 } as DOMRect);
      vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(5000); // not at the bottom
      render(<Page section="limits" />);
      await act(async () => {
        vi.advanceTimersByTime(360); // our own jump's and correction's quiet period passes
      });
      const calls = () => scroll.mock.calls.length;
      return { calls };
    }

    it('keeps pulling back when nothing happens (the control case)', async () => {
      const { calls } = await setup();
      expect(calls()).toBeGreaterThan(1);
    });

    it('stops on a pointer press (a scrollbar drag, middle-click autoscroll)', async () => {
      const { calls } = await setup();
      fireEvent.pointerDown(window);
      const n = calls();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(calls()).toBe(n);
    });

    it('stops on a scroll the page did not cause', async () => {
      const { calls } = await setup();
      fireEvent.scroll(window);
      const n = calls();
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(calls()).toBe(n);
    });
  });
});
