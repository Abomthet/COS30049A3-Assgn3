import type { SnapshotInfo } from '../api/types';
import { formatDay } from '../lib/dates';
import { liveCaption } from '../lib/liveOrigin';
import { settings } from '../lib/settings';

/**
 * The footnote every snapshot chart carries (plan section 9): where the data comes from and which
 * snapshot it is, "Blockstream Esplora · snapshot of 22 Oct 2026". Until the service has said which snapshot is loaded, only
 * the source is known. The chart's table view, its accessible description and its PNG all print this same line.
 */
export function snapshotCaption(snapshot: SnapshotInfo | null, address?: string): string {
  const live = address === undefined ? null : liveCaption(address);
  if (live) return live;
  if (!snapshot) return settings.source.name;
  return `${snapshot.source} · snapshot of ${formatDay(snapshot.snapshotDate)}${snapshot.illustrative ? ' · illustrative data' : ''}`;
}
