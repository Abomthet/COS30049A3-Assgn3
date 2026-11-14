import { Suspense, lazy, useState } from 'react';
import type { MethodId, TimelineResponse } from '../api/types';
import { Icon } from '../components/Icon';
import { Loading } from '../components/StatePanel';
import { formatDay } from '../lib/dates';

// The replay's entry on V2's overview. The player (the charts' data, the timer and the controls) is fetched only
// when the user asks for it, so the overview opens as quickly as before and asks for no extra rows.
const ReplayStage = lazy(() => import('./ReplayStage'));

export function ReplayPanel({ timeline, method }: { timeline: TimelineResponse; method: MethodId }) {
  const [started, setStarted] = useState(false);
  return (
    <section className="card replay-card" aria-labelledby="replay-title">
      <h2 id="replay-title">Replay of recorded history</h2>
      <p className="card-sub">
        Watch this address's transactions again in the order they happened, from {timeline.live ? `the history fetched on ${formatDay(timeline.live.fetchedAt.slice(0, 10))}` : `the snapshot of ${formatDay(timeline.snapshot.snapshotDate)}`}. Nothing here is arriving now: it is recorded history played forward.
        Each transaction shows the verdict it has in the data, which never used later transactions, so a flag appears when its transaction does, as it would have on the day.
      </p>
      {started ? (
        <Suspense fallback={<Loading label="Loading the replay…" block />}>
          <ReplayStage key={method} timeline={timeline} method={method} />
        </Suspense>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setStarted(true)}>
          <Icon name="play" /> Open the replay
        </button>
      )}
    </section>
  );
}
