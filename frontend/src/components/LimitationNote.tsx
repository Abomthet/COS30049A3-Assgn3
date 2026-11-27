import { LIMITATION_LINE } from '../lib/settings';

/** The fixed limitation line as quiet text, once above or below a list that holds a flagged item (the flag box has its own, styled copy). */
export function LimitationNote() {
  return (
    <p className="card-sub limitation-note" data-testid="list-limitation-line">
      {LIMITATION_LINE}
    </p>
  );
}
