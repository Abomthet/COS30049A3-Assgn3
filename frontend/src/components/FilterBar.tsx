import { useId, type ReactNode } from 'react';
import type { Direction, ScoreStatus } from '../api/types';
import { useSlow } from '../hooks/useSlow';
import { isDayKey } from '../lib/dates';
import { DIRECTION_LABEL, formatCount, plural } from '../lib/format';
import { DIRECTIONS, SORTS, STATUSES, isFiltered, type FilterErrors, type Filters, type SortValue } from '../lib/transactionFilters';
import { STATUS_TEXT } from './Badges';

// V2's filter bar (plan section 8): status and direction chips, a date range limited to the address's
// active period, the sort menu and "Reset filters". It holds no state of its own: every control reads
// `filters` and reports a change, and the screen writes it to the address bar.

interface Props {
  filters: Filters;
  errors: FilterErrors;
  /** The address's first and last active day (E5), which limit the date fields. */
  period: { first: string; last: string };
  /** How many transactions match, and how many the address has; null before the first answer. */
  count: { matching: number; all: number } | null;
  updating: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  /** Further controls for the filtered view, such as the export menu, beside "Reset filters". */
  actions?: ReactNode;
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  );
}

/** One group of chips; with none pressed, nothing is left out. A change reports the chosen values in the order of `values`, so equal choices make equal links. */
function ChipGroup<T extends string>({ label, values, text, chosen, onChange }: { label: string; values: T[]; text: Record<T, string>; chosen: T[]; onChange: (next: T[]) => void }) {
  const id = useId();
  return (
    <div className="filter-group" role="group" aria-labelledby={id}>
      <span id={id} className="filter-label">
        {label}
      </span>
      <div className="chips">
        {values.map((value) => (
          <Chip key={value} pressed={chosen.includes(value)} onClick={() => onChange(values.filter((v) => (v === value ? !chosen.includes(v) : chosen.includes(v))))}>
            {text[value]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function DateField({ label, value, min, max, error, onChange }: { label: string; value: string; min: string; max: string; error?: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="filter-group">
      <label htmlFor={id} className="filter-label">
        {label}
      </label>
      <input
        id={id}
        type="date"
        className="text-input"
        // A date that is not a real day (from a hand-edited link) shows empty, with its message below; the link keeps what it said.
        value={isDayKey(value) ? value : ''}
        min={min}
        max={max}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** The transaction filter bar: status and direction chips, a date range, the sort menu and Reset filters; used on the transactions tab. */
export function FilterBar({ filters, errors, period, count, updating, onChange, onReset, actions }: Props) {
  const sortId = useId();
  const invalid = errors.from !== undefined || errors.to !== undefined;
  const slow = useSlow(updating);
  return (
    <section className="card filter-bar" aria-labelledby="filter-title">
      <h2 id="filter-title">Filter transactions</h2>
      <div className="filter-grid">
        <ChipGroup<ScoreStatus> label="Status" values={STATUSES} text={STATUS_TEXT} chosen={filters.status} onChange={(status) => onChange({ status })} />
        <ChipGroup<Direction> label="Direction" values={DIRECTIONS} text={DIRECTION_LABEL} chosen={filters.direction} onChange={(direction) => onChange({ direction })} />
        <DateField label="From" value={filters.from} min={period.first} max={period.last} error={errors.from} onChange={(from) => onChange({ from })} />
        <DateField label="To" value={filters.to} min={period.first} max={period.last} error={errors.to} onChange={(to) => onChange({ to })} />
        <div className="filter-group">
          <label htmlFor={sortId} className="filter-label">
            Sort by
          </label>
          <select id={sortId} className="text-input" value={filters.sort} onChange={(e) => onChange({ sort: e.target.value as SortValue })}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="filter-foot">
        <p className="count-line" role="status">
          {invalid
            ? null
            : count
              ? `Showing ${formatCount(count.matching)} of ${plural(count.all, 'transaction')}${updating ? (slow ? ' · Still working…' : ' · Updating…') : ''}`
              : 'Loading the transactions…'}
        </p>
        <div className="filter-actions">
          <button type="button" className="btn btn-secondary" disabled={!isFiltered(filters)} onClick={onReset}>
            Reset filters
          </button>
          {actions}
        </div>
      </div>
    </section>
  );
}
