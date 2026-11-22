import { Suspense, lazy, useState } from 'react';
import type { MethodId, TimelineResponse } from '../api/types';
import { Loading } from '../components/StatePanel';

// The replay's entry on V2's overview. The player (the charts' data, the timer and the controls) is fetched only
// when the user asks for it, so the overview opens as quickly as before and asks for no extra rows.
const ReplayStage = lazy(() => import('./ReplayStage'));

/** The replay's entry on the address overview: a button that opens the replay player the first time it is pressed. */
export function ReplayPanel({ timeline, method }: { timeline: TimelineResponse; method: MethodId }) {
  const [started, setStarted] = useState(false);
  return (
    <section className="card replay-card" aria-labelledby="replay-title">
      <h2 id="replay-title">Replay</h2>
      <p className="card-sub">Play this address's history forward, one transaction at a time.</p>
      <details className="pchart-guide">
        <summary>How the replay avoids look-ahead</summary>
        <div className="pchart-guide-body">
          <p>Each flag appears when its transaction does, using only what came before it.</p>
        </div>
      </details>
      {started ? (
        <Suspense fallback={<Loading label="Loading the replay…" block />}>
          <ReplayStage key={method} timeline={timeline} method={method} />
        </Suspense>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => setStarted(true)}>
          Open the replay
        </button>
      )}
    </section>
  );
}
