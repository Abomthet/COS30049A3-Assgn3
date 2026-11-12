// Which addresses on screen are fetched ones (S-09), and when: every chart caption names its data, and a fetched address's data
// is not the snapshot. E5 says so (`live`), and `noteOrigin` records it as the timeline passes, so a caption for an address
// (charts do not hold the timeline) can say "fetched on ..." without a prop through every view.

import type { TimelineResponse } from '../api/types';
import { formatDay } from './dates';

const fetched = new Map<string, string>();

/** Records where the address's data came from; returns the timeline unchanged. */
export function noteOrigin(timeline: TimelineResponse): TimelineResponse {
  if (timeline.live) fetched.set(timeline.address, timeline.live.fetchedAt);
  else fetched.delete(timeline.address);
  return timeline;
}

/** The sentence a chart caption carries for a fetched address, or null for a snapshot address. */
export function liveCaption(address: string): string | null {
  const at = fetched.get(address);
  return at ? `Data: live from the public blockchain service, fetched ${formatDay(at.slice(0, 10))}` : null;
}
