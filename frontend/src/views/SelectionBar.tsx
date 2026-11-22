import { useId, useState, type FormEvent } from 'react';
import type { TransactionRow } from '../api/types';
import { StatBlock } from '../components/StatBlock';
import { formatBtc, formatCount } from '../lib/format';
import { rowsInSpan, summarise } from '../lib/selection';
import { dayKey } from '../lib/dates';

// Above the transaction table (S-07): what is selected, "Clear selection", and the keyboard's way to select, a span of days
// (the chart's box and lasso tools need a pointer). Fetched with the first selection or when the span form is first needed.

interface Props {
  /** Every transaction the chart is drawing. */
  rows: TransactionRow[];
  /** The selection, or null when there is none. */
  selected: TransactionRow[] | null;
  onSelect: (rows: TransactionRow[]) => void;
  onClear: () => void;
}

/** The bar above the transaction table that shows the selection, with a form to select a span of days and a Clear selection button. */
export default function SelectionBar({ rows, selected, onSelect, onClear }: Props) {
  const ids = { from: useId(), to: useId(), error: useId() };
  const [span, setSpan] = useState({ from: '', to: '' });
  const [error, setError] = useState<string | null>(null);
  const days = rows.map((r) => dayKey(r.time)).sort();
  const [first, last] = [days[0], days[days.length - 1]];

  const edit = (patch: Partial<typeof span>) => {
    setSpan({ ...span, ...patch });
    setError(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { from, to } = span;
    const chosen = from !== '' && to !== '' && from <= to ? rowsInSpan(rows, from, to) : [];
    if (from === '' || to === '') setError('Pick both days.');
    else if (from > to) setError("From can't be after To.");
    else if (chosen.length === 0) setError('No transactions on those days.');
    else {
      setError(null);
      onSelect(chosen);
    }
  };

  const summary = selected ? summarise(selected) : null;
  return (
    <section className="card selection-bar" aria-labelledby="selection-title">
      <h2 id="selection-title">Selection</h2>
      <div className="selection-summary" role="status">
        {summary ? (
          <>
            <StatBlock testId="selection-count" value={formatCount(summary.count)} unit="selected" />
            <p className="selection-stats">
              {formatCount(summary.received)} received · {formatCount(summary.sent)} sent · {formatCount(summary.unusual)} unusual
            </p>
            <p className="selection-stats">
              {formatBtc(summary.receivedSats)} in · {formatBtc(summary.sentSats)} out
            </p>
          </>
        ) : (
          <p>Draw on the chart or pick days to select.</p>
        )}
      </div>
      <form className="selection-span" onSubmit={submit} noValidate>
        <div className="filter-group">
          <label htmlFor={ids.from} className="filter-label">
            From
          </label>
          <input id={ids.from} type="date" className="text-input" value={span.from} min={first} max={last} aria-describedby={error ? ids.error : undefined} aria-invalid={error ? true : undefined} onChange={(e) => edit({ from: e.target.value })} />
        </div>
        <div className="filter-group">
          <label htmlFor={ids.to} className="filter-label">
            To
          </label>
          <input id={ids.to} type="date" className="text-input" value={span.to} min={first} max={last} aria-describedby={error ? ids.error : undefined} aria-invalid={error ? true : undefined} onChange={(e) => edit({ to: e.target.value })} />
        </div>
        <button type="submit" className="btn btn-secondary">
          Select
        </button>
        {selected ? (
          <button type="button" className="btn btn-ghost" onClick={onClear}>
            Clear selection
          </button>
        ) : null}
      </form>
      {error ? (
        <p id={ids.error} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
