import type { MethodId } from '../api/types';
import { useThresholds } from '../hooks/useMethods';
import { METHODS } from '../lib/methods';
import { Icon } from './Icon';

// What each of the nine methods says about one transaction (M-13): family, score, the flag line it
// is read against, and the verdict. The deciding method sets the status shown above the table; the
// others are for comparison. A real transaction (V3) and a hypothetical one (V4) share it.

interface Props {
  /** A method with no score cannot score this input. */
  scores: Partial<Record<MethodId, number | null>>;
  flags: Partial<Record<MethodId, boolean>>;
  deciding: MethodId;
  /** What the verdict column says for a method with no score. */
  unavailableText?: string;
  caption: string;
}

export function VerdictTable({ scores, flags, deciding, unavailableText = 'Not available', caption }: Props) {
  // Each flag line comes from E11; until it answers the column shows a dash.
  const thresholds = useThresholds();
  return (
    <table className="verdict-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Method</th>
          <th scope="col">Family</th>
          <th scope="col" className="num">
            Score
          </th>
          <th scope="col" className="num">
            Flag line
          </th>
          <th scope="col">Verdict</th>
        </tr>
      </thead>
      <tbody>
        {METHODS.map((m) => {
          const score = scores[m.id];
          const threshold = thresholds[m.id];
          return (
            <tr key={m.id} className={m.id === deciding ? 'is-deciding' : undefined}>
              <th scope="row" data-label="Method">
                {m.name}
                {m.id === deciding ? <span className="cell-sub">Deciding method</span> : null}
              </th>
              <td data-label="Family">{m.family}</td>
              <td data-label="Score" className="num mono">
                {score == null ? '—' : score.toFixed(2)}
              </td>
              <td data-label="Flag line" className="num mono">
                {threshold === undefined ? '—' : threshold.toFixed(2)}
              </td>
              <td data-label="Verdict">
                {score == null ? (
                  <span className="muted">{unavailableText}</span>
                ) : flags[m.id] ? (
                  <span className="badge badge-flagged">
                    <Icon name="flag" />
                    Flag
                  </span>
                ) : (
                  <span className="muted">
                    <span aria-hidden="true">–</span>
                    <span className="sr-only">Not flagged</span>
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
