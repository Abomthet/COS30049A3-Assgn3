import { useEffect, useState } from 'react';
import type { ApiError } from '../api/types';
import { useOnline } from '../hooks/useOnline';
import { paths } from '../lib/router';
import { AddressLink } from './AddressLink';
import { plural } from '../lib/format';
import { CopyButton } from './CopyButton';
import { StatePanel } from './StatePanel';

// Maps an API error to its feedback state (FR-05; the catalogue in plan section 11): every state says what
// happened and offers a next action. The 422 insufficient-history case has its own panel in the transaction
// detail, because it still shows the transaction's facts.

/** The wait before trying again when a 429 does not say how long (it normally carries `Retry-After`). */
const DEFAULT_WAIT_SECONDS = 5;

/** A wait in words: whole seconds up to two minutes, then minutes, so a long `Retry-After` does not read as a ticking number. */
const formatWait = (seconds: number) => (seconds <= 120 ? plural(seconds, 'second') : plural(Math.ceil(seconds / 60), 'minute'));

/**
 * The catalogue's "Busy" state: the wait, counting down, and a retry when it ends. The announcement for a
 * screen reader gives the whole wait once; the ticking number is for the eyes only, so nothing is read out every second.
 */
function BusyPanel({ seconds, onRetry, headingLevel }: { seconds: number; onRetry: () => void; headingLevel: 2 | 3 }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) {
      onRetry();
      return;
    }
    const timer = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return (
    <StatePanel
      tone="warning"
      icon="history"
      title="The service is busy"
      headingLevel={headingLevel}
      testId="state-rate-limited"
      actions={
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Try again now
        </button>
      }
    >
      <p>Too many requests came in at once. This page tries again in <strong aria-hidden="true">{formatWait(left)}</strong>.</p>
      <p className="sr-only" role="status">
        The service is busy. This page tries again by itself in {formatWait(seconds)}.
      </p>
    </StatePanel>
  );
}

export function ErrorState({ error, onRetry, headingLevel = 2 }: { error: ApiError; onRetry: () => void; headingLevel?: 2 | 3 }) {
  const body = error.body;
  const online = useOnline();
  const retry = (
    <button type="button" className="btn btn-secondary" onClick={onRetry}>
      Try again
    </button>
  );
  switch (body.status) {
    case 'invalid':
      return (
        <StatePanel
          tone="error"
          title="That isn't a valid Bitcoin address"
          headingLevel={headingLevel}
          live="alert"
          actions={<a className="btn btn-secondary" href={paths.select()}>Choose an address</a>}
        >
          <p>
            {body.message} {body.hint}
          </p>
        </StatePanel>
      );
    case 'unsupported':
      return (
        <StatePanel
          tone="info"
          title="This address isn't in the snapshot"
          headingLevel={headingLevel}
          live="alert"
          testId="state-unsupported"
          actions={<a className="btn btn-secondary" href={paths.select()}>See all addresses in the snapshot</a>}
        >
          <p>{body.message}</p>
          {body.examples.length ? (
            <>
              <p>Try one of these instead:</p>
              <ul className="example-list">
                {body.examples.map((a) => (
                  <li key={a}>
                    <AddressLink className="mono" address={a} href={paths.timeline(a)} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </StatePanel>
      );
    case 'not_found':
      return (
        <StatePanel
          tone="info"
          title="There's nothing at this link"
          headingLevel={headingLevel}
          live="alert"
          actions={<a className="btn btn-secondary" href={paths.select()}>Go to the address list</a>}
        >
          <p>{body.message}</p>
        </StatePanel>
      );
    case 'network':
      return (
        <StatePanel tone="error" icon="offline" title="Couldn't reach the explorer service" headingLevel={headingLevel} live="alert" actions={retry}>
          <p>
            {online ? body.message : "Your browser is offline."} This page reloads by itself when {online ? 'the service is back' : 'your connection returns'}, or you can try again now.
          </p>
        </StatePanel>
      );
    case 'insufficient_history':
      return (
        <StatePanel
          tone="warning"
          title="Not enough history to score this"
          headingLevel={headingLevel}
          live="alert"
          testId="state-insufficient"
          actions={<a className="btn btn-secondary" href={paths.select()}>Choose an address with more history</a>}
        >
          <p>{body.message}</p>
        </StatePanel>
      );
    case 'rate_limited':
      return <BusyPanel seconds={body.retryAfterSeconds ?? DEFAULT_WAIT_SECONDS} onRetry={onRetry} headingLevel={headingLevel} />;
    case 'upstream_error':
    case 'upstream_timeout':
      return (
        <StatePanel
          tone="error"
          icon="offline"
          title="The public blockchain service did not answer"
          headingLevel={headingLevel}
          live="alert"
          actions={
            <>
              {retry}
              <a className="btn btn-ghost" href={paths.select()}>Pick a snapshot address</a>
            </>
          }
        >
          <p>{body.message}</p>
        </StatePanel>
      );
    case 'too_large':
      return (
        <StatePanel
          tone="error"
          title="That request was too large"
          headingLevel={headingLevel}
          live="alert"
          actions={<a className="btn btn-secondary" href={paths.select()}>Choose an address</a>}
        >
          <p>
            {body.message} {body.hint}
          </p>
        </StatePanel>
      );
    case 'conflict':
      return (
        <StatePanel
          tone="warning"
          title="The watchlist is full"
          headingLevel={headingLevel}
          live="alert"
          testId="state-conflict"
          actions={<a className="btn btn-secondary" href={paths.watchlist()}>Open the watchlist</a>}
        >
          <p>
            {body.message} {body.hint}
          </p>
        </StatePanel>
      );
    case 'timeout':
      return (
        <StatePanel tone="error" icon="history" title="This is taking longer than it should" headingLevel={headingLevel} live="alert" actions={retry}>
          <p>The explorer service did not answer in time. Try again in a moment.</p>
        </StatePanel>
      );
    case 'unavailable':
      return (
        <StatePanel tone="warning" icon="history" title="The service is starting" headingLevel={headingLevel} live="status">
          <p>This page will load by itself as soon as the service is ready. Nothing else is needed.</p>
        </StatePanel>
      );
    case 'server_error':
      return (
        <StatePanel tone="error" title="Something went wrong on our side" headingLevel={headingLevel} live="alert" actions={retry}>
          <p>{body.message}</p>
          {body.requestId ? (
            <p className="small">
              Reference: <span className="mono">{body.requestId}</span> <CopyButton value={body.requestId} label="the reference" />
            </p>
          ) : null}
        </StatePanel>
      );
    default:
      // Statuses a view has no special wording for: say what the service said and offer another go.
      return (
        <StatePanel tone="error" title="That didn't work" headingLevel={headingLevel} live="alert" actions={retry}>
          <p>
            {body.message} {'hint' in body ? body.hint : ''}
          </p>
        </StatePanel>
      );
  }
}
