import type { MethodDescription } from '../api/types';
import { G6PlantedRecall, PATTERNS } from '../charts/G6PlantedRecall';
import { ErrorState } from '../components/ErrorState';
import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { Loading } from '../components/StatePanel';
import { useMethods } from '../hooks/useMethods';
import { useSettings } from '../hooks/useSettings';
import { formatDay } from '../lib/dates';
import { capitalised, formatInterval, formatShare, plural } from '../lib/format';

// V5, models and limits (plan section 8): a card for each of the nine models, then what a flag means
// and what it does not. Every figure on the page is E11's (or E2's, for the snapshot); none is typed
// in, so the page cannot drift from the evaluation it reports.

function MethodCard({ method }: { method: MethodDescription }) {
  const { evaluation } = method;
  return (
    <li className="card method-card" data-testid={`method-${method.id}`}>
      <header>
        <h3>{method.name}</h3>
        {method.longName !== method.name ? (
          <p className="method-long-name" data-testid="long-name">
            {method.longName}
          </p>
        ) : null}
        <p className="muted">{capitalised(method.family)}</p>
      </header>
      <p>{method.description}</p>
      <dl className="method-facts">
        <div>
          <dt>Flag line</dt>
          <dd className="mono">{method.threshold.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Works in the what-if lab</dt>
          <dd>{method.scoresNewInput ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Flags</dt>
          <dd>{formatShare(evaluation.flagRate)} of real transactions</dd>
        </div>
      </dl>
      <table className="method-recall">
        <caption>Caught in tests with simulated unusual transactions</caption>
        <tbody>
          <tr>
            <th scope="row">All patterns</th>
            <td>{formatInterval(evaluation.meanRecall)}</td>
          </tr>
          {PATTERNS.map(({ id, label }) => (
            <tr key={id}>
              <th scope="row">{label}</th>
              <td>{formatInterval(evaluation.recallByPattern[id])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  );
}

/** V5, the models and limits screen: a card for each of the nine models, and what a flag does and does not mean. */
export function ModelsScreen() {
  useDocumentTitle('Models and limits');
  const methods = useMethods();
  const { settings } = useSettings();
  const { snapshot } = settings;

  return (
    <div className="page page-models">
      <PageHeading>Models and limits</PageHeading>
      <p className="lede">
        {methods.status === 'success' ? plural(methods.data.methods.length, 'model') : 'Several models'} score every transaction, each on its own scale. A flag means a
        model's score reached its flag line.
      </p>
      {methods.status === 'loading' ? <Loading label="Loading the models…" block /> : null}
      {methods.status === 'error' ? <ErrorState error={methods.error} onRetry={methods.retry} /> : null}
      {methods.status === 'success' ? (
        <ul className="method-grid" aria-label="The models">
          {methods.data.methods.map((m) => (
            <MethodCard key={m.id} method={m} />
          ))}
        </ul>
      ) : null}
      {methods.status === 'success' ? (
        <div className="card chart-card">
          <G6PlantedRecall methods={methods.data.methods} />
        </div>
      ) : null}

      <section className="card prose" aria-labelledby="limits-title">
        <h2 id="limits-title">What a flag means</h2>
        <ul>
          <li>A flag means different from this address's own past.</li>
          <li>Real transactions have no labels, so we cannot say how often a flag is right.</li>
          <li>
            The snapshot covers {snapshot ? plural(snapshot.addressCount, 'address', 'addresses') : 'a small set of addresses'}
            {snapshot ? ` on one date, ${formatDay(snapshot.snapshotDate)}` : ' on one date'}.
          </li>
        </ul>
        <details className="pchart-guide" data-testid="test-numbers-disclosure">
          <summary>Why the test numbers are not accuracy</summary>
          <div className="pchart-guide-body">
            <p>
              The test counts how many simulated unusual transactions a model flags. It shows a model notices spikes, bursts and a dormant address waking up. It does not show how
              often a flag on a real address is right.
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
