import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/types';
import { useServiceStatus } from './useServiceStatus';

export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError };

// Successful responses are kept for the session: the snapshot is frozen, so a timeline
// fetched once never changes, and going back never shows a second loading state.
const cache = new Map<string, unknown>();

export function clearRequestCache(): void {
  cache.clear();
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  return new ApiError(0, { status: 'network', message: err instanceof Error ? err.message : 'Unknown error' });
}

/** Failures that say nothing about the request itself: the service did not answer, or is still starting. */
function isTransient(error: ApiError): boolean {
  return error.body.status === 'network' || error.body.status === 'timeout' || error.body.status === 'unavailable';
}

function initial<T>(key: string | null): RequestState<T> {
  if (key === null) return { status: 'idle' };
  if (cache.has(key)) return { status: 'success', data: cache.get(key) as T };
  return { status: 'loading' };
}

/**
 * Loads `fetcher(signal)` whenever `key` changes. A null key means "nothing to load" (idle).
 * Leaving the view, or a new key, aborts the request in flight, so an old answer can never overwrite
 * a newer one. A request that failed because the service was down is repeated by itself when the
 * service-status poll sees it come back (R4). `previous` is the last answer this hook received (for
 * any key), so a list can stay on screen, marked as updating, while the next one loads (plan section 8).
 */
export function useRequest<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): RequestState<T> & { retry: () => void; previous: T | undefined } {
  const [attempt, setAttempt] = useState(0);
  // State remembers which key it belongs to, so a new key never shows the previous key's result.
  const [state, setState] = useState<{ key: string | null; value: RequestState<T> }>(() => ({ key, value: initial(key) }));
  const { recoveries, recheck } = useServiceStatus();

  useEffect(() => {
    if (key === null || cache.has(key)) {
      setState({ key, value: initial(key) });
      return;
    }
    const controller = new AbortController();
    setState({ key, value: { status: 'loading' } });
    fetcher(controller.signal).then(
      (data) => {
        cache.set(key, data);
        if (!controller.signal.aborted) setState({ key, value: { status: 'success', data } });
      },
      (err: unknown) => {
        if (controller.signal.aborted) return;
        const error = toApiError(err);
        // Don't wait for the next poll to tell the user the service is down.
        if (isTransient(error)) recheck();
        setState({ key, value: { status: 'error', error } });
      },
    );
    return () => controller.abort();
    // fetcher is recreated every render; the key alone identifies the request.
  }, [key, attempt]);

  const value = state.key === key ? state.value : initial<T>(key);

  const seenRecoveries = useRef(recoveries);
  useEffect(() => {
    if (seenRecoveries.current === recoveries) return;
    seenRecoveries.current = recoveries;
    if (value.status === 'error' && isTransient(value.error)) setAttempt((n) => n + 1);
  }, [recoveries]);

  const last = useRef<T>(undefined);
  if (value.status === 'success') last.current = value.data;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...value, retry, previous: last.current };
}

/** Run a one-off request outside render (form submits). */
export async function runRequest<T>(fetcher: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    return { ok: true, data: await fetcher() };
  } catch (err) {
    return { ok: false, error: toApiError(err) };
  }
}
