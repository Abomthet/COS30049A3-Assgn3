import type { ExplanationRequest, TransactionDetail } from '../api/types';
import { dayKey, formatDayRange } from '../lib/dates';
import { Explanation, ExplanationBlocks } from './Explanation';
import { Icon } from './Icon';

/**
 * Why a transaction stands out: the service's explanation, what each feature was compared with and
 * the fixed limitation line. Shared by a real transaction (V3) and a hypothetical one (V4). With a `request` the explanation
 * is the Assistant's panel (the template, and the Assistant's answer when asked for); without one it is the template alone.
 */
export function FlagCallout({ tx, title, request }: { tx: Pick<TransactionDetail, 'explanation' | 'comparison' | 'limitation'>; title: string; request?: ExplanationRequest }) {
  return (
    <section className="flag-callout" aria-labelledby="why-title" data-testid="flag-explanation">
      <h3 id="why-title">
        <Icon name="flag" className="flag-icon" /> {title}
      </h3>
      {request ? (
        <Explanation request={request} template={tx.explanation} flagged limitation={tx.limitation} />
      ) : (
        <ExplanationBlocks text={tx.explanation} limitation={tx.limitation} />
      )}
      <h4>Compared with</h4>
      <ul className="bases">
        {tx.comparison.map((b) => (
          <li key={b.label}>
            <strong>{b.label}:</strong> {b.description}{' '}
            <span className="muted">({formatDayRange(dayKey(b.start), dayKey(b.end))})</span>
          </li>
        ))}
      </ul>
      <p className="limitation" data-testid="limitation-line">
        <span>{tx.limitation}</span>
      </p>
    </section>
  );
}
