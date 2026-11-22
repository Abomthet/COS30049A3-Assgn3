// Which addresses on screen are fetched ones (S-09), and when: every chart footnote names its data, and a fetched address's data
// is not the snapshot. E5 says so (`live`), and `noteOrigin` records it as the timeline passes, so a caption for an address
// (charts do not hold the timeline) can say "fetched ..." without a prop through every view.

import { useSyncExternalStore } from 'react';
import type { TimelineResponse } from '../api/types';
import { formatDay } from './dates';

const fetched = new Map<string, string>();
const listeners = new Set<() => void>();
// A version number that changes only when the set of fetched addresses does, so the shell's strip re-renders at once.
let version = 0;
const changed = () => {
  version += 1;
  listeners.forEach((listener) => listener());
};

/** Records where the address's data came from; returns the timeline unchanged. */
export function noteOrigin(timeline: TimelineResponse): TimelineResponse {
  if (timeline.live) {
    if (fetched.get(timeline.address) !== timeline.live.fetchedAt) {
      fetched.set(timeline.address, timeline.live.fetchedAt);
      changed();
    }
  } else if (fetched.delete(timeline.address)) changed();
  return timeline;
}

/** True once a timeline has said this address is a fetched one. */
export function isLiveAddress(address: string): boolean {
  return fetched.has(address);
}

/** Like `isLiveAddress`, and the caller renders again when the answer changes. */
export function useIsLive(address: string | null): boolean {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => version,
  );
  return address !== null && fetched.has(address);
}

/** The sentence a chart caption carries for a fetched address, or null for a snapshot address. */
export function liveCaption(address: string): string | null {
  const at = fetched.get(address);
  return at ? `Live data from the public blockchain service · fetched ${formatDay(at.slice(0, 10))}` : null;
}
