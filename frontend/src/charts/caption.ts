import type { SnapshotInfo } from '../api/types';
import { formatDay } from '../lib/dates';
import { settings } from '../lib/settings';

/**
 * The caption every snapshot chart carries (plan section 9): where the data comes from and which
 * snapshot it is. Until the service has said which snapshot is loaded, only the source is known.
 */
export function snapshotCaption(snapshot: SnapshotInfo | null): string {
  if (!snapshot) return `Data: ${settings.source.name}`;
  return `Data: ${snapshot.source}, snapshot of ${formatDay(snapshot.snapshotDate)}${snapshot.illustrative ? ', illustrative data' : ''}`;
}
