import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { ApiError, LOOKUP_ENDED, type LiveLookup } from '../api/types';
import { Dialog } from '../components/Dialog';
import { ErrorState } from '../components/ErrorState';
import { clearRequestCache } from '../hooks/useRequest';
import { useToasts } from '../hooks/useToasts';
import { formatCount, plural, shortAddress } from '../lib/format';
import { navigate, paths } from '../lib/router';

// V8 — the live lookup (S-09, R8): a dialog over V1. It starts the lookup (E16), follows it as server-sent events (E18)
// and, if the stream fails, polls E17 every two seconds; it shows the pages and transactions fetched against the cap, and
// Cancel stops the fetch (E19). When the lookup is done the overview of the address opens, marked as live data.
// It is fetched only when "Fetch this address's public history" is selected, so the first screen does not carry it.

const POLL_MS = 2000;

type View = { phase: 'starting' } | { phase: 'running'; lookup: LiveLookup; via: 'stream' | 'polling' } | { phase: 'error'; error: ApiError };

const asError = (err: unknown) => (err instanceof ApiError ? err : new ApiError(0, { status: 'network', message: 'The explorer service did not respond.' }));

function describe(lookup: LiveLookup): string {
  const { pages, transactions, cap } = lookup.progress;
  if (lookup.status === 'scoring') return `Fetched ${plural(transactions, 'transaction')}. Scoring them against the address's own history…`;
  if (lookup.status === 'queued' || transactions === 0) return 'Asking the public blockchain service for the history…';
  return `Fetched ${formatCount(transactions)} of ${formatCount(cap)} transactions (${plural(pages, 'page')}).`;
}

/** V8, the live lookup dialog: starts fetching an address's public history and follows its progress until it is done or cancelled. */
export default function LiveLookupDialog({ address, method, onClose }: { address: string; method?: string; onClose: () => void }) {
  const [view, setView] = useState<View>({ phase: 'starting' });
  const { notify } = useToasts();
  const started = useRef<Promise<LiveLookup> | null>(null);
  const current = useRef<LiveLookup | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // In development React runs this effect twice; the one lookup is started once and followed by whichever run is current.
    started.current ??= api.startLiveLookup(address);
    let closeStream = () => {};
    let poll: ReturnType<typeof setInterval> | undefined;
    let live = true;

    const stop = () => {
      closeStream();
      clearInterval(poll);
    };
    const show = (lookup: LiveLookup, via: 'stream' | 'polling') => {
      if (!live) return;
      current.current = lookup;
      setView({ phase: 'running', lookup, via });
      if (!LOOKUP_ENDED.includes(lookup.status)) return;
      stop();
      if (lookup.status === 'done') {
        clearRequestCache(); // the address list and any earlier answers for this address are out of date now
        notify({ message: `Fetched ${plural(lookup.progress.transactions, 'transaction')} of ${shortAddress(address)}.`, tone: 'success' });
        navigate(paths.timeline(address, method as never));
      } else if (lookup.status === 'failed') {
        const body = lookup.error;
        setView({ phase: 'error', error: new ApiError(502, { status: (body?.status ?? 'upstream_error') as 'upstream_error', message: body?.message ?? 'The lookup failed.', hint: body?.hint }) });
      }
    };
    const pollFor = (id: string) => {
      poll = setInterval(() => {
        api.liveLookup(id).then((lookup) => show(lookup, 'polling'), () => {});
      }, POLL_MS);
    };

    started.current.then(
      (first) => {
        if (!live) return;
        show(first, 'stream');
        if (LOOKUP_ENDED.includes(first.status)) return;
        closeStream = api.openLiveEvents(
          first.id,
          (lookup) => show(lookup, 'stream'),
          () => {
            if (!live) return;
            show(current.current ?? first, 'polling');
            pollFor(first.id);
          },
        );
      },
      (err: unknown) => live && setView({ phase: 'error', error: asError(err) }),
    );
    return () => {
      live = false;
      stop();
    };
  }, [attempt]);

  function close() {
    const running = current.current;
    if (running && !LOOKUP_ENDED.includes(running.status)) void api.cancelLiveLookup(running.id).catch(() => {});
    onClose();
  }

  function retry() {
    started.current = null;
    current.current = null;
    setView({ phase: 'starting' });
    setAttempt(attempt + 1);
  }

  const lookup = view.phase === 'running' ? view.lookup : null;
  const percent = lookup && lookup.progress.cap > 0 ? Math.min(100, Math.round((lookup.progress.transactions / lookup.progress.cap) * 100)) : 0;
  const body = view.phase === 'error' ? view.error.body : null;
  const plain = body && ['conflict', 'rate_limited', 'not_found', 'disabled'].includes(body.status);

  return (
    <Dialog title="Fetching this address's public history" describedBy="live-help" onClose={close}>
      <p className="dialog-address mono">{address}</p>
      <p id="live-help" className="field-help">
        The most recent confirmed transactions are read from the public blockchain service. Only the address is sent to it. The result is kept on this
        computer and marked as live data.
      </p>
      {view.phase === 'error' ? (
        plain ? (
          <p className="field-error" role="alert" data-testid="live-error">
            <span>
              <strong>{body!.message}</strong> {'hint' in body! ? body!.hint : ''}
            </span>
          </p>
        ) : (
          <ErrorState error={view.error} onRetry={retry} headingLevel={3} />
        )
      ) : (
        <div className="live-progress" data-testid="live-progress" data-updates={view.phase === 'running' ? view.via : undefined}>
          <progress max={100} value={view.phase === 'starting' ? undefined : percent} aria-label="Transactions fetched" />
          <p role="status" className="live-count">
            {lookup ? describe(lookup) : 'Starting…'}
          </p>
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={close}>
          {view.phase === 'error' ? 'Close' : 'Cancel'}
        </button>
      </div>
    </Dialog>
  );
}
