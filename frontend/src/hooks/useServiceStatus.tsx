import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { ApiError, type HealthResponse } from '../api/types';
import { WEB } from '../lib/settings';
import { usePolling } from './usePolling';

// What the shell knows about the back end (R4): E1 is polled on a timer, and again at once when
// a request fails. 'checking' only lasts until the first answer.
export type ServiceState = 'checking' | 'ready' | 'starting' | 'unreachable';

interface ServiceStatus {
  state: ServiceState;
  /** E1's last answer; null unless the service is ready. */
  health: HealthResponse | null;
  /** Counts each return to 'ready' after a failure. A view that failed reloads when it changes. */
  recoveries: number;
  /** Asks E1 now instead of waiting for the next poll. */
  recheck: () => void;
}

const ServiceStatusContext = createContext<ServiceStatus>({
  state: 'checking',
  health: null,
  recoveries: 0,
  recheck: () => {},
});

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServiceState>('checking');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [recoveries, setRecoveries] = useState(0);
  const current = useRef<ServiceState>('checking');

  const apply = useCallback((next: ServiceState, answer: HealthResponse | null) => {
    if (next === 'ready' && (current.current === 'starting' || current.current === 'unreachable')) {
      setRecoveries((n) => n + 1);
    }
    current.current = next;
    setState(next);
    setHealth(answer);
  }, []);

  const check = useCallback(
    async (signal: AbortSignal) => {
      try {
        const answer = await api.health({ signal });
        if (!signal.aborted) apply('ready', answer);
      } catch (err) {
        if (signal.aborted) return;
        // E1 answers 503 "unavailable" while the models load; any other failure is no answer.
        apply(err instanceof ApiError && err.body.status === 'unavailable' ? 'starting' : 'unreachable', null);
      }
    },
    [apply],
  );

  // The interval comes from the bundled settings: E2 cannot be read before the service is known to be up.
  const recheck = usePolling(check, WEB.requests.healthPollSeconds * 1000);
  const value = useMemo(() => ({ state, health, recoveries, recheck }), [state, health, recoveries, recheck]);
  return <ServiceStatusContext.Provider value={value}>{children}</ServiceStatusContext.Provider>;
}

export function useServiceStatus(): ServiceStatus {
  return useContext(ServiceStatusContext);
}
