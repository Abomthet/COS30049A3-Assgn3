import type { ReactNode } from 'react';

/**
 * A big-number block: an optional tiny label line, the number large (with an optional smaller unit or words after it on
 * the same line) and an optional small grey qualifier line. It is one paragraph of three spans, so a screen reader
 * reads it in order as one sentence: "Small for a received amount 0.4× its usual size usual 1.4×".
 *
 * API
 *   label?   tiny line above the number
 *   value    the number, as text ("0.4×", "12", "No")
 *   unit?    smaller words on the number's line ("its usual size", "days", "earlier transactions, 53 days")
 *   note?    small grey line below ("usual 1.4×")
 *   size?    "large" (a headline, the .hero-stat size) or "medium" (inside a card, the default)
 *   className?, testId?   passed to the paragraph
 *
 * Styled in styles/base.css (`.stat-block`), after `.hero-stat`: bold, tight, tabular figures.
 */
export interface StatBlockProps {
  label?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  note?: ReactNode;
  size?: 'large' | 'medium';
  className?: string;
  testId?: string;
}

/** A big number with an optional label above, unit beside and qualifier below; the one block the flag box, the not-scored panel and later the overview tiles share. */
export function StatBlock({ label, value, unit, note, size = 'medium', className, testId }: StatBlockProps) {
  return (
    <p className={`stat-block stat-${size}${className ? ` ${className}` : ''}`} data-testid={testId}>
      {label ? <><span className="stat-label">{label}</span>{' '}</> : null}
      <span className="stat-figure">
        <span className="stat-value">{value}</span>
        {unit ? <>{' '}<span className="stat-unit">{unit}</span></> : null}
      </span>
      {note ? <>{' '}<span className="stat-note">{note}</span></> : null}
    </p>
  );
}
