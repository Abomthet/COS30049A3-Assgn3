import { useServiceStatus, type ServiceState } from '../hooks/useServiceStatus';

// The status dot and its words (R4). Colour is never the only signal: each state has its own
// words, and the states that need the user's attention say what to do next.

const WORDS: Record<ServiceState, string> = {
  checking: 'Checking the connection',
  ready: 'Connected',
  starting: 'Starting up',
  unreachable: 'Not connected',
};

/** The service status line in the shell: a dot and words for checking, ready, starting or unreachable, with Check again when it is down. */
export function ServiceStatus() {
  const { state, recheck } = useServiceStatus();
  const hasHint = state === 'starting' || state === 'unreachable';

  return (
    <div className="service-status" data-state={state}>
      <span className="status-dot" aria-hidden="true" />
      <p className="status-text" role="status">
        <span className="status-words">{WORDS[state]}</span>
        {hasHint ? '.' : null}
        {state === 'starting' ? <span className="status-hint"> Pages load when it is ready.</span> : null}
        {state === 'unreachable' ? <span className="status-hint"> Pages reload when it is back.</span> : null}
      </p>
      {state === 'unreachable' ? (
        <button type="button" className="status-button" onClick={recheck}>
          Check again
        </button>
      ) : null}
    </div>
  );
}
