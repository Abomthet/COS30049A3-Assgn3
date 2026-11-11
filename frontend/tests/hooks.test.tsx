import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePolling } from '../src/hooks/usePolling';
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
