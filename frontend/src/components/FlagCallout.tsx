import type { ReactNode } from 'react';
import type { ExplanationRequest, TransactionDetail } from '../api/types';
import { useLimitationShown } from '../hooks/useLimitationShown';
import { dayKey, formatDayRange } from '../lib/dates';
import { F4_UNIT } from '../lib/reasons';
import { Explanation, ReasonLines } from './Explanation';
import { Icon } from './Icon';
import { StatBlock } from './StatBlock';

/**
 * Why a transaction stands out (FR-04): the strongest reason as a big figure, the other reasons as one line each, what the
 * figures were compared with and the fixed limitation line, then the Assistant's control. Shared by a real transaction (V3)
 * and a hypothetical one (V4). With a `request` the Assistant's answer can replace the other reasons' lines; without one the
 * lines stand alone.
 */
export function FlagCallout({ tx, title, request }: { tx: Pick<TransactionDetail, 'reasons' | 'comparison' | 'limitation'>; title: string; request?: ExplanationRequest }) {
  useLimitationShown(); // this box carries the line, so the footer leaves its copy out
  const [first, ...others] = tx.reasons;

  const body = (lines: ReactNode, control: ReactNode) => (
    <>
      {first ? (
        <StatBlock
          className="flag-figure"
          testId="flag-figure"
          label={first.label}
          value={first.valueText}
          unit={first.feature === 'F4' ? F4_UNIT : undefined}
          note={first.feature === 'F4' ? undefined : `usual ${first.usualText}`}
        />
      ) : null}
      {lines}
      <h4>Compared with</h4>
      <ul className="bases">
        {tx.comparison.map((b) => (
          <li key={b.label}>
            {b.description} <span className="muted">({formatDayRange(dayKey(b.start), dayKey(b.end))})</span>
          </li>
        ))}
      </ul>
      <p className="limitation" data-testid="limitation-line">
        <span>{tx.limitation}</span>
      </p>
      {control}
    </>
  );

  return (
    <section className="flag-callout" aria-labelledby="why-title" data-testid="flag-explanation">
      <h3 id="why-title">
        <Icon name="flag" className="flag-icon" /> {title}
      </h3>
      {request ? (
        <Explanation request={request} reasons={others} flagged limitation={tx.limitation}>
          {({ lines, control }) => body(lines, control)}
        </Explanation>
      ) : (
        body(<ReasonLines reasons={others} />, null)
      )}
    </section>
  );
}
