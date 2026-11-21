import { useState } from 'react';
import type { WatchlistEntry } from '../api/types';
import { AddressLink } from '../components/AddressLink';
import { ErrorState } from '../components/ErrorState';
import { Icon } from '../components/Icon';
import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { Loading, StatePanel } from '../components/StatePanel';
import WatchDialog from '../components/WatchDialog';
import { KIND_LABEL } from '../lib/address';
import { dayKey, formatDay } from '../lib/dates';
import { formatCount, plural } from '../lib/format';
import { paths } from '../lib/router';
import { useRemoveWithUndo, useWatchlist } from '../hooks/useWatchlist';
import { useSettings } from '../hooks/useSettings';

// V6, the watchlist (S-04): the addresses the user chose to keep, newest first, each with the label and note as
// typed, its counts and a link to its activity. An entry is edited in the same dialog as the star's, and removed
// at once, with a toast that offers Undo.

function Entry({ entry, onEdit, onRemove }: { entry: WatchlistEntry; onEdit: () => void; onRemove: () => void }) {
  const { summary } = entry;
  return (
    <li className="card watch-entry">
      <div className="watch-head">
        <h2 className="watch-label">{entry.label || <span className="muted">No label</span>}</h2>
        <AddressLink className="mono watch-address" address={entry.address} href={paths.timeline(entry.address)} head={14} tail={10} />
        <span className="cell-sub">{KIND_LABEL[summary.kind]}</span>
      </div>
      {entry.note ? <p className="watch-note">{entry.note}</p> : null}
      <p className="watch-counts">
        {plural(summary.txCount, 'transaction')} · {formatCount(summary.scoredCount)} scored ·{' '}
        {summary.history === 'insufficient' ? (
          <span className="badge badge-not-scored">Short history, not scored</span>
        ) : summary.flaggedCount > 0 ? (
          <span className="unusual-count">
            <Icon name="flag" className="flag-icon" /> {formatCount(summary.flaggedCount)} unusual
          </span>
        ) : (
          'none unusual'
        )}
      </p>
      <p className="card-sub">Added {formatDay(dayKey(entry.addedAt))}</p>
      <div className="watch-actions">
        <a className="btn btn-secondary" href={paths.timeline(entry.address)}>
          Open activity
        </a>
        <button type="button" className="btn btn-secondary" onClick={onEdit}>
          Edit
          <span className="sr-only"> the entry for {entry.label || entry.address}</span>
        </button>
        <button type="button" className="btn btn-ghost" onClick={onRemove}>
          Remove
          <span className="sr-only"> {entry.label || entry.address} from the watchlist</span>
        </button>
      </div>
    </li>
  );
}

/** V6, the watchlist screen: the addresses the user has kept, with their labels, notes and counts. */
export default function WatchlistScreen() {
  useDocumentTitle('Watchlist');
  const { state, reload } = useWatchlist();
  const { settings } = useSettings();
  const removeWithUndo = useRemoveWithUndo();
  const [editing, setEditing] = useState<WatchlistEntry | null>(null);

  return (
    <div className="page page-watchlist">
      <PageHeading>Watchlist</PageHeading>
      <p className="lede">
        The addresses you chose to keep an eye on, with your own labels and notes. They are kept by the service, so they are here the next time you open the Explorer.
      </p>
      {state.status === 'loading' || state.status === 'idle' ? <Loading label="Loading the watchlist…" block /> : null}
      {state.status === 'error' ? <ErrorState error={state.error} onRetry={reload} /> : null}
      {state.status === 'ready' && state.entries.length === 0 ? (
        <StatePanel
          tone="empty"
          title="Nothing on the watchlist yet"
          testId="state-empty-watchlist"
          actions={
            <a className="btn btn-secondary" href={paths.select()}>
              Choose an address
            </a>
          }
        >
          <p>Select the star beside an address, in the list or at the top of its page, to keep it here with a label and a note.</p>
        </StatePanel>
      ) : null}
      {state.status === 'ready' && state.entries.length > 0 ? (
        <>
          <p className="section-meta" role="status">
            {formatCount(state.entries.length)} of {plural(settings.web.watchlist.maxEntries, 'address', 'addresses')}, the newest first.
          </p>
          <ul className="watch-list">
            {state.entries.map((entry) => (
              <Entry key={entry.address} entry={entry} onEdit={() => setEditing(entry)} onRemove={() => void removeWithUndo(entry)} />
            ))}
          </ul>
        </>
      ) : null}
      {editing ? <WatchDialog address={editing.address} entry={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}
