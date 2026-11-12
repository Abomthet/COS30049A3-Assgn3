import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePolling } from '../src/hooks/usePolling';
import { useSlow } from '../src/hooks/useSlow';
import { settings } from '../src/lib/settings';
import { useRequest } from '../src/hooks/useRequest';

afterEach(() => vi.useRealTimers());

describe('usePolling', () => {
  test('runs at once, then on every beat, and "now" runs it early', () => {
    vi.useFakeTimers();
    const task = vi.fn(async () => {});
    const { result, unmount } = renderHook(() => usePolling(task, 15_000));
    expect(task).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(15_000);
    expect(task).toHaveBeenCalledTimes(2);

    act(() => result.current());
    expect(task).toHaveBeenCalledTimes(3);

    unmount();
    vi.advanceTimersByTime(60_000);
    expect(task).toHaveBeenCalledTimes(3);
  });

  test('a newer run aborts the one before it, and unmounting aborts the last', () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const task = async (signal: AbortSignal) => {
      signals.push(signal);
    };
    const { result, unmount } = renderHook(() => usePolling(task, 15_000));
    act(() => result.current());
    expect(signals.map((s) => s.aborted)).toEqual([true, false]);
    unmount();
    expect(signals[1].aborted).toBe(true);
  });
});

describe('useRequest cancellation', () => {
  test('leaving the view aborts the request in flight', () => {
    let signal!: AbortSignal;
    const { unmount } = renderHook(() =>
      useRequest('cancel:unmount', (s) => {
        signal = s;
        return new Promise(() => {});
      }),
    );
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  test('a new key aborts the old request, so its answer can never replace the new one', async () => {
    const signals: Record<string, AbortSignal> = {};
    const { result, rerender } = renderHook(
      ({ id }) =>
        useRequest(`cancel:key:${id}`, async (s) => {
          signals[id] = s;
          return id;
        }),
      { initialProps: { id: 'a' } },
    );
    rerender({ id: 'b' });
    expect(signals.a.aborted).toBe(true);
    await vi.waitFor(() => expect(result.current).toMatchObject({ status: 'success', data: 'b' }));
  });
});

describe('useSlow', () => {
  const half = settings.web.requests.timeoutMs / 2;

  test('turns true halfway to the time limit, and false again when the wait ends', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useSlow(active), { initialProps: { active: true } });
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(half - 1));
    expect(result.current).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
    rerender({ active: false });
    expect(result.current).toBe(false);
  });

  test('a new wait starts its own clock', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ active }) => useSlow(active), { initialProps: { active: true } });
    act(() => vi.advanceTimersByTime(half - 1000));
    rerender({ active: false });
    rerender({ active: true });
    act(() => vi.advanceTimersByTime(half - 1000));
    expect(result.current).toBe(false);
  });
});
