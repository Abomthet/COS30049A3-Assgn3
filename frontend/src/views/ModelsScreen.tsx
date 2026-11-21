import type { MethodDescription } from '../api/types';
import { G6PlantedRecall, PATTERNS } from '../charts/G6PlantedRecall';
import { ErrorState } from '../components/ErrorState';
import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { Loading } from '../components/StatePanel';
import { useMethods } from '../hooks/useMethods';
import { useSettings } from '../hooks/useSettings';
import { formatDay } from '../lib/dates';
import { capitalised, formatInterval, formatShare, plural } from '../lib/format';

// V5, models and limits (plan section 8): a card for each of the nine methods, then what a flag means
// and what it does not. Every figure on the page is E11's (or E2's, for the snapshot); none is typed
// in, so the page cannot drift from the evaluation it reports.

function MethodCard({ method }: { method: MethodDescription }) {
  const { evaluation } = method;
  return (
    <li className="card method-card" data-testid={`method-${method.id}`}>
      <header>
        <h3>{method.name}</h3>
        <p className="muted">{capitalised(method.family)}</p>
      </header>
      <p>{method.description}</p>
      <dl className="method-facts">
        <div>
          <dt>Flag line</dt>
          <dd className="mono">{method.threshold.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Scores a new amount</dt>
          <dd>{method.scoresNewInput ? 'Yes' : 'No: it needs a real transaction'}</dd>
        </div>
        <div>
          <dt>Flags real transactions</dt>
          <dd>{formatShare(evaluation.flagRate)} of them</dd>
        </div>
      </dl>
      <table className="method-recall">
        <caption>Share of planted test transactions flagged, with its 95% interval</caption>
        <tbody>
          <tr>
            <th scope="row">All three patterns</th>
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

/** V5, the models and limits screen: a card for each of the nine methods, and what a flag does and does not mean. */
export function ModelsScreen() {
  useDocumentTitle('Models and limits');
  const methods = useMethods();
  const { settings } = useSettings();
  const { snapshot } = settings;

  return (
    <div className="page page-models">
      <PageHeading>Models and limits</PageHeading>
      <p className="lede">
        The Explorer scores every transaction with {methods.status === 'success' ? plural(methods.data.methods.length, 'method') : 'several methods'}, each on its own scale. A
        transaction is flagged when a method's score reaches that method's flag line.
      </p>
      {methods.status === 'loading' ? <Loading label="Loading the methods…" block /> : null}
      {methods.status === 'error' ? <ErrorState error={methods.error} onRetry={methods.retry} /> : null}
      {methods.status === 'success' ? (
        <ul className="method-grid" aria-label="The methods">
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
        <h2 id="limits-title">What a flag means, and what it does not</h2>
        <ul>
          <li>A flag compares an address with its own past: this transaction is unusual for this address. It is worth a look, and nothing more.</li>
          <li>Real transactions have no labels saying which are unusual, so no accuracy is claimed for them. "Flags real transactions" only says how often a method flags.</li>
          <li>
            Recall is measured on planted test transactions (a spike, a burst, a dormant address waking up), not on real activity. A high recall there says the method notices
            those patterns; it does not say how often a flag on a real address is right.
          </li>
          <li>
            The snapshot covers {snapshot ? plural(snapshot.addressCount, 'address', 'addresses') : 'a small set of addresses'}
            {snapshot ? ` on one date, ${formatDay(snapshot.snapshotDate)}` : ' on one date'}. What it shows may not hold for other addresses or other dates.
          </li>
        </ul>
        <p className="limitation">{settings.limitationLine}</p>
      </section>
    </div>
  );
}
