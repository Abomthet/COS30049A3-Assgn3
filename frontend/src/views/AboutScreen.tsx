import { PageHeading, useDocumentTitle } from '../components/PageHeading';
import { StatusBadge } from '../components/Badges';
import { StatBlock } from '../components/StatBlock';
import { useMethodLabels, useMethods } from '../hooks/useMethods';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useScrollToSection } from '../hooks/useScrollToSection';
import { useSettings } from '../hooks/useSettings';
import { formatDay } from '../lib/dates';
import { formatCount } from '../lib/format';
import { PAGE_SECTIONS } from '../lib/router';
import { METHODS } from '../lib/methods';
import { settings as bundled } from '../lib/settings';

// V7, about and help: what the Explorer shows, what "unusual" means, how a flag is decided, how to read the charts, the limits,
// the data source and snapshot, and the keyboard. No figure
// is written here: the source, snapshot, flag levels, history rule and features are read from E2 (or,
// without the service, from the bundled settings), so this page cannot disagree with the rest.

const KEYS: Array<{ keys: string; does: string }> = [
  { keys: 'Tab and Shift+Tab', does: 'Move forward and back through the links, buttons and fields in reading order. The first Tab shows "Skip to content".' },
  { keys: 'Enter', does: 'Follow a link or press a button. On a row of the transaction table, Enter opens the transaction.' },
  { keys: 'Space or Enter on a filter chip', does: 'Switch that status or direction on or off.' },
  { keys: 'Left and right arrows on a chart', does: 'Tab to a chart, then move between its days (transactions per day) or its transactions (transactions over time), oldest first. Home and End go to the first and last.' },
  { keys: 'Enter or Space on a chart', does: 'Open the day or the transaction the arrow keys have reached.' },
];

const SECTION_IDS = Object.fromEntries(PAGE_SECTIONS.about.map(({ id }) => [id, `${id}-title`]));

/** V7, the about and help screen: what the explorer shows, what "unusual" means, how a flag is decided, the charts, the limits, the data and the keyboard. */
export function AboutScreen({ section }: { section?: string }) {
  useDocumentTitle('About and help');
  useScrollToSection(section, SECTION_IDS);
  const { settings } = useSettings();
  const { health } = useServiceStatus();
  const { snapshot, thresholds, features, history } = settings;
  const deciding = snapshot?.method;
  const labels = useMethodLabels();
  const methods = useMethods();
  const modelCount = methods.status === 'success' ? methods.data.methods.length : METHODS.length;

  return (
    <div className="page page-about">
      <header className="page-head">
        <PageHeading>About and help</PageHeading>
        <p className="lede">See how a Bitcoin address has been used, day by day, and which transactions are unusual for it.</p>
      </header>

      <section className="card prose" aria-labelledby="shows-title">
        <h2 id="shows-title" data-section>What it shows</h2>
        <ul>
          <li>Daily activity of an address.</li>
          <li>Unusual transactions, with the reason and what each was compared with.</li>
          <li>{modelCount} models side by side, so you can see where they agree.</li>
        </ul>
      </section>

      <section className="card about-unusual" aria-labelledby="unusual-title">
        <h2 id="unusual-title" data-section>What "unusual" means</h2>
        {/* The definition and the one number that decides a flag, side by side on a wide screen. */}
        <div className="about-hero">
          <div className="about-intro">
            <p className="about-lead">Unusual means different from this address's own past.</p>
            {thresholds ? (
              <p className="about-qualifier">
                A transaction is flagged when a measure is {thresholds.flagAbsZ} or more of this address's typical swings away from usual.
              </p>
            ) : null}
          </div>
          {thresholds ? <StatBlock className="about-level" label="Flag level" value={thresholds.flagAbsZ} note="typical swings from usual" testId="about-flag-level" /> : null}
        </div>
        <ul className="about-tiles" aria-label="The three statuses">
          <li className="about-tile">
            <StatusBadge status="flagged" />
            <p>Flagged, with the strongest reason beside it.</p>
          </li>
          <li className="about-tile">
            <StatusBadge status="not-flagged" />
            <p>Scored, and within the usual range.</p>
          </li>
          <li className="about-tile">
            <StatusBadge status="not-scored" />
            <p>
              Too little earlier history. Scoring needs {history.minTx} transactions over {history.minSpanDays} days.
            </p>
          </li>
        </ul>
        {features.length > 0 ? (
          <>
            <h3>The four measures</h3>
            <dl className="about-measures">
              {features.map((f) => (
                <div key={f.id} className="about-measure">
                  <dt>{f.name}</dt>
                  <dd>{f.description}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </section>

      <section className="card prose" aria-labelledby="decided-title">
        <h2 id="decided-title" data-section>How a flag is decided</h2>
        <ol className="about-steps">
          <li>
            <h3>Compare with its own past.</h3>
            <p>Each transaction is compared only with earlier ones from the same address, so a score never uses the future.</p>
          </li>
          <li>
            <h3>Measure four things.</h3>
            <p>Size, Burst, Gap and Relative size, each as a distance from usual.</p>
          </li>
          <li>
            <h3>{thresholds ? `Flag at ${thresholds.flagAbsZ}.` : 'Flag at the flag level.'}</h3>
            <p>
              {thresholds ? `A measure counts as contributing from ${thresholds.contributingAbsZ}. ` : ''}
              {deciding ? `${labels[deciding.id].name} decides which transactions are flagged; ` : ''}
              {modelCount - 1} more models are shown beside {deciding ? 'it' : 'the deciding model'}.
            </p>
          </li>
        </ol>
      </section>

      <section className="card prose" aria-labelledby="charts-title">
        <h2 id="charts-title" data-section>How to read the charts</h2>
        <ul>
          <li>Each chart has a "How to read this chart" note.</li>
          <li>Every chart can be viewed as a table and downloaded as a picture.</li>
        </ul>
      </section>

      <section className="card prose" aria-labelledby="limits-title">
        <h2 id="limits-title" data-section>Limits</h2>
        <ul>
          <li>A flag says nothing about who is behind an address or why a payment was made.</li>
          <li>An address is compared only with its own past.</li>
          <li>Real transactions have no labels, so no accuracy is claimed for flags.</li>
        </ul>
      </section>

      <section className="card prose" aria-labelledby="data-title">
        <h2 id="data-title" data-section>Where the data comes from</h2>
        <p>Everything here is public blockchain data from a fixed snapshot.</p>
        {snapshot ? (
          <dl className="facts about-facts">
            <div className="fact">
              <dt>Source</dt>
              <dd>
                <a href={snapshot.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {snapshot.source}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </dd>
            </div>
            <div className="fact">
              <dt>Snapshot</dt>
              <dd>{formatDay(snapshot.snapshotDate)}</dd>
            </div>
            <div className="fact">
              <dt>Addresses</dt>
              <dd>{formatCount(snapshot.addressCount)}</dd>
            </div>
            <div className="fact">
              <dt>Days and times</dt>
              <dd>{snapshot.dayTimeZone}</dd>
            </div>
            {health ? (
              <div className="fact">
                <dt>Version</dt>
                <dd>{health.version}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p>
            The data comes from {bundled.source.name}. The snapshot date and the number of addresses are shown here once the explorer service
            answers.
          </p>
        )}
        {snapshot?.illustrative ? <p className="muted">This snapshot is illustrative: the transactions are examples, not a record of real activity.</p> : null}
      </section>

      <section className="card prose" aria-labelledby="keys-title">
        <h2 id="keys-title" data-section>Keyboard</h2>
        <dl className="key-list">
          {KEYS.map((k) => (
            <div key={k.keys}>
              <dt>{k.keys}</dt>
              <dd>{k.does}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
