import type { ReactNode } from 'react';
import { StatePanel } from '../../components/StatePanel';
import { paths } from '../../lib/router';
import '../../styles/empty-watchlist.css';
import { Illustration } from './illustrations';
import type { Align, Art, Size } from './playSettings';

interface Props {
  art: Art;
  align: Align;
  size: Size;
  /** Rendered under the text and action. */
  suggestions?: ReactNode;
}

/** The empty watchlist. Art 0 is the original text panel, unchanged; 1 to 3 add a drawing above the words. */
export function EmptyWatchlist({ art, align, size, suggestions }: Props) {
  const action = (
    <a className="btn btn-secondary" href={paths.select()}>
      Choose an address
    </a>
  );
  if (art === 0) {
    return (
      <>
        <StatePanel tone="empty" title="No saved addresses yet" testId="state-empty-watchlist" actions={action}>
          <p>Select the star on an address to save it.</p>
        </StatePanel>
        {suggestions}
      </>
    );
  }
  return (
    <section className={`ew ew-${align} ew-${size}`} data-testid="state-empty-watchlist" data-art={art}>
      <Illustration art={art} />
      <h2 className="ew-title">Nothing on your watchlist yet</h2>
      <p className="ew-text">Press the star on an address to keep it here with a note.</p>
      <div className="ew-actions">{action}</div>
      {suggestions}
    </section>
  );
}
