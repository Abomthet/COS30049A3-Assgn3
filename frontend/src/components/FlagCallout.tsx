import type { TransactionDetail } from '../api/types';
import { dayKey, formatDayRange } from '../lib/dates';
import { explanationBlocks } from '../lib/explanation';
import { Icon } from './Icon';

/**
 * Why a transaction stands out: the service's explanation, what each feature was compared with and
 * the fixed limitation line. Shared by a real transaction (V3) and a hypothetical one (V4).
 */
export function FlagCallout({ tx, title }: { tx: Pick<TransactionDetail, 'explanation' | 'comparison' | 'limitation'>; title: string }) {
  return (
    <section className="flag-callout" aria-labelledby="why-title" data-testid="flag-explanation">
      <h3 id="why-title">
        <Icon name="flag" className="flag-icon" /> {title}
      </h3>
      {explanationBlocks(tx.explanation, tx.limitation).map((block, i) =>
        block.kind === 'text' ? (
          <p key={i}>{block.text}</p>
        ) : (
          <ul key={i} className="reasons">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
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
        <Icon name="info" />
        <span>{tx.limitation}</span>
      </p>
    </section>
  );
}
