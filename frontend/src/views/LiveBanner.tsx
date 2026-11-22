import { useState } from 'react';
import { api } from '../api/client';
import type { LiveInfo } from '../api/types';
import { clearRequestCache } from '../hooks/useRequest';
import { useToasts } from '../hooks/useToasts';
import { formatDay } from '../lib/dates';
import { formatCount, shortAddress } from '../lib/format';
import { navigate, paths } from '../lib/router';

// V2's mark for a fetched address (S-09): the data is live, not the snapshot, and when it was fetched; and "Forget this
// address" (E20). Fetched with the dialog, since a snapshot address never shows it.

/** '10 Nov 2026, 14:02 UTC' */
export function formatFetched(iso: string): string {
  return `${formatDay(iso.slice(0, 10))}, ${iso.slice(11, 16)} UTC`;
}

/** The banner on a fetched address that shows when its data was fetched, with a Forget this address action; used on the address overview. */
export default function LiveBanner({ address, live }: { address: string; live: LiveInfo }) {
  const { notify } = useToasts();
  const [busy, setBusy] = useState(false);

  async function forget() {
    setBusy(true);
    try {
      await api.forgetAddress(address);
      clearRequestCache(); // the address list no longer holds it
      notify({ message: `Removed ${shortAddress(address)} from this computer.`, tone: 'success' });
      navigate(paths.select());
    } catch {
      setBusy(false);
      notify({ message: 'Could not remove it. Try again.', tone: 'error' });
    }
  }

  return (
    <aside className="live-banner" aria-label="Live data" data-testid="live-banner">
      <div className="live-banner-body">
        <p>
          <strong>Live data</strong> · fetched {formatFetched(live.fetchedAt)} ·{' '}
          {live.truncated ? `latest ${formatCount(live.transactions)} of ${formatCount(live.total)} transactions` : `${formatCount(live.transactions)} ${live.transactions === 1 ? 'transaction' : 'transactions'}`}
        </p>
      </div>
      <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void forget()}>
        Forget this address
      </button>
    </aside>
  );
}
