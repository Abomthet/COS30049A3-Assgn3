import { paths } from '../../lib/router';
import '../../styles/empty-watchlist.css';
import { SuggestedAddresses } from './SuggestedAddresses';
import { WatchlistArt } from './WatchlistArt';

/** The empty watchlist: a picture, what to do, one action, then a few addresses to start with. */
export function EmptyWatchlist() {
  return (
    <section className="ew" data-testid="state-empty-watchlist">
      <WatchlistArt />
      <h2 className="ew-title">Nothing on your watchlist yet</h2>
      <p className="ew-text">Press the star on an address to keep it here with a note.</p>
      <div className="ew-actions">
        <a className="btn btn-secondary" href={paths.select()}>
          Choose an address
        </a>
      </div>
      <SuggestedAddresses count={3} />
    </section>
  );
}
