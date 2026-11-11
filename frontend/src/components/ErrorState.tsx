import type { ApiError } from '../api/types';
import { paths } from '../lib/router';
import { shortAddress } from '../lib/format';
import { CopyButton } from './CopyButton';
import { StatePanel } from './StatePanel';

// Maps an API error to its feedback state (FR-05). The 422 insufficient-history case has its
// own panel in the transaction detail, because it still shows the transaction's facts.

export function ErrorState({ error, onRetry, headingLevel = 2 }: { error: ApiError; onRetry: () => void; headingLevel?: 2 | 3 }) {
  const body = error.body;
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
                    <a className="mono" href={paths.timeline(a)}>
                      {shortAddress(a, 12, 8)}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </StatePanel>
      );
    case 'not_found':
      return (
        <StatePanel tone="info" title="Not found" headingLevel={headingLevel} live="alert">
          <p>{body.message}</p>
        </StatePanel>
      );
    case 'network':
      return (
        <StatePanel tone="error" icon="offline" title="Couldn't reach the explorer service" headingLevel={headingLevel} live="alert" actions={retry}>
          <p>{body.message} This page reloads by itself when the service is back, or you can try again now.</p>
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
