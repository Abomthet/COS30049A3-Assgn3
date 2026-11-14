import { useCallback, useEffect, useRef } from 'react';

/**
 * Runs `task` now and then every `intervalMs`. Each run gets an AbortSignal that is aborted when
 * the next run starts or the component unmounts, so a late answer can be recognised and dropped.
 * Returns a function that runs the task again at once; the interval keeps its own beat.
 */
export function usePolling(task: (signal: AbortSignal) => Promise<void>, intervalMs: number): () => void {
  const taskRef = useRef(task);
  taskRef.current = task;
  const running = useRef<AbortController | null>(null);

  const runNow = useCallback(() => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    void taskRef.current(controller.signal);
  }, []);

  useEffect(() => {
    runNow();
    const timer = setInterval(runNow, intervalMs);
    return () => {
      clearInterval(timer);
      running.current?.abort();
    };
  }, [intervalMs, runNow]);

  return runNow;
}
