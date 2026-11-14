import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastRegion } from '../components/ToastRegion';

// Short messages that confirm something happened or report a change the user did not cause
// ("Copied", "The explorer service is back"). A toast may carry one action, such as Undo.

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onAction: () => void };
  /** How long it stays. A toast with an action stays longer, so a keyboard user can reach it. */
  durationMs?: number;
}

export interface Toast extends ToastOptions {
  id: number;
  /** True while the exit transition plays. */
  leaving: boolean;
}

/** Matches the 150 to 200 ms transitions in the stylesheet. */
const EXIT_MS = 180;

interface ToastApi {
  notify: (options: ToastOptions) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi>({ notify: () => {}, dismiss: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  const notify = useCallback((options: ToastOptions) => {
    setToasts((all) => [...all, { ...options, id: nextId.current++, leaving: false }]);
  }, []);

  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToasts(): ToastApi {
  return useContext(ToastContext);
}
