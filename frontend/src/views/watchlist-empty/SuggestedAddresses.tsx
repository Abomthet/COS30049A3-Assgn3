import { useMemo, useState } from 'react';
import { api } from '../../api/client';
import { AddressLink } from '../../components/AddressLink';
import { Icon } from '../../components/Icon';
import { entryName, saveWatchlistEntry, useWatchlist } from '../../hooks/useWatchlist';
import { useRequest } from '../../hooks/useRequest';
import { useToasts } from '../../hooks/useToasts';
import { formatCount, shortAddress } from '../../lib/format';
import { paths } from '../../lib/router';
import '../../styles/suggested-addresses.css';

// "Try one of these" on the empty watchlist: the snapshot addresses with the most flags (the same list and order as the
// navigation's "Most flagged" menu), each with a Watch button that saves it without a label through the same store
// call as the star's dialog. Addresses already watched are skipped. Nothing is shown while loading or if E3 fails.

function Suggestion({ address, flaggedCount }: { address: string; flaggedCount: number }) {
  const { notify } = useToasts();
  const [saving, setSaving] = useState(false);
  const short = shortAddress(address, 8, 6);
  async function watch() {
    if (saving) return;
    setSaving(true);
    const res = await saveWatchlistEntry(address, { label: '', note: '' });
    if (res.ok) notify({ tone: 'success', message: `Added ${entryName(res.data)} to the watchlist.` });
    else {
      setSaving(false);
      notify({ tone: 'error', message: res.error.body.message });
    }
  }
  return (
    <li className="suggest-row">
      <AddressLink className="suggest-address mono" address={address} href={paths.timeline(address)} head={8} tail={6} />
      <span className="suggest-count">
        <Icon name="flag" className="flag-icon" /> {formatCount(flaggedCount)} unusual
      </span>
      <button type="button" className="btn btn-secondary suggest-watch" aria-label={`Watch ${short}`} disabled={saving} onClick={() => void watch()}>
        Watch
      </button>
    </li>
  );
}

export function SuggestedAddresses({ count }: { count: 3 | 5 }) {
  const list = useRequest('addresses', (signal) => api.listAddresses({ signal }));
  const { state } = useWatchlist();
  const picked = useMemo(() => {
    if (list.status !== 'success' || state.status !== 'ready') return [];
    const watched = new Set(state.entries.map((e) => e.address));
    return list.data.addresses
      .filter((a) => a.flaggedCount > 0 && !watched.has(a.address))
      .sort((a, b) => b.flaggedCount - a.flaggedCount || a.address.localeCompare(b.address))
      .slice(0, count);
  }, [list, state, count]);
  if (picked.length === 0) return null;
  return (
    <section className="suggest" aria-labelledby="suggest-heading">
      <h3 id="suggest-heading" className="suggest-title">
        Try one of these
      </h3>
      <ul className="suggest-list">
        {picked.map((a) => (
          <Suggestion key={a.address} address={a.address} flaggedCount={a.flaggedCount} />
        ))}
      </ul>
      <p className="suggest-more">
        <a href={paths.select('snapshot')}>Browse all addresses</a>
      </p>
    </section>
  );
}
