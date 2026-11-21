import type { Direction, ScoreStatus } from '../api/types';
import { DIRECTION_LABEL } from '../lib/format';
import { Icon } from './Icon';

// Flags use a warm "look here" colour, never red: unusual is not the same as wrong.
// Each badge pairs its colour with an icon and a word, so it reads without colour too.

export const STATUS_TEXT: Record<ScoreStatus, string> = {
  flagged: 'Unusual',
  'not-flagged': 'Not unusual',
  'not-scored': 'Not scored',
};

/** The badge for a transaction's status ('Unusual', 'Not unusual' or 'Not scored'), with a flag icon when it is unusual. */
export function StatusBadge({ status }: { status: ScoreStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      {status === 'flagged' ? <Icon name="flag" /> : null}
      {STATUS_TEXT[status]}
    </span>
  );
}

/** The badge for a transaction's direction ('Received', 'Sent' or 'No net change'), with an icon when there is a direction. */
export function DirectionBadge({ direction }: { direction: Direction }) {
  return (
    <span className={`direction direction-${direction}`}>
      {direction !== 'none' ? <Icon name={direction} /> : null}
      {DIRECTION_LABEL[direction]}
    </span>
  );
}
