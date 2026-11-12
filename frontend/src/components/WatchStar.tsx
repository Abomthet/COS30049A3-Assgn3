import { Suspense, lazy, useState } from 'react';
import { useWatchlist } from '../hooks/useWatchlist';
import { Icon } from './Icon';

// The star of S-04: on a row of V1 and in V2's header. It opens the dialog (WatchDialog) for the address's label and
// note. A filled star means the address is on the watchlist; the button's name says so too, so the state never rests
// on the shape alone.

const WatchDialog = lazy(() => import('./WatchDialog'));

/** The star for one address. `showText` adds the words "Watch" or "Watching" beside it (V2's header). */
export function WatchStar({ address, showText = false }: { address: string; showText?: boolean }) {
  const { entryFor } = useWatchlist();
  const [open, setOpen] = useState(false);
  const entry = entryFor(address);
  const name = entry ? `On the watchlist${entry.label ? ` as ${entry.label}` : ''}. Edit the entry for ${address}` : `Add ${address} to the watchlist`;
  // With words beside it the button is named by them (and a hidden sentence); without, the name says what the star does.
  return (
    <>
      <button type="button" className={`star-button${entry ? ' is-watched' : ''}${showText ? ' has-text' : ''}`} aria-haspopup="dialog" aria-label={showText ? undefined : name} title={entry ? 'On the watchlist' : 'Add to the watchlist'} onClick={() => setOpen(true)}>
        <Icon name={entry ? 'star-filled' : 'star'} />
        {showText ? (
          <>
            <span>{entry ? 'Watching' : 'Watch'}</span>
            <span className="sr-only"> {entry ? 'this address; edit its entry' : 'this address: add it to the watchlist'}</span>
          </>
        ) : null}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <WatchDialog address={address} entry={entry} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  );
}
