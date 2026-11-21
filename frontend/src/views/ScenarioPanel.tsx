import { useState } from 'react';
import type { WhatIfResult } from '../api/types';
import { downloadText, fileStem, tableToCsv } from '../charts/chartTable';
import { StatusBadge } from '../components/Badges';
import { useMethodLabels } from '../hooks/useMethods';
import { usePreferences } from '../hooks/usePreferences';
import { useSettings } from '../hooks/useSettings';
import { useToasts } from '../hooks/useToasts';
import { DIRECTION_LABEL, plural } from '../lib/format';
import { TableScroll } from '../components/TableScroll';
import { compareScenarios, scenarioCsvRows, scenarioOf } from '../lib/scenarioTable';
import { SCENARIOS_MAX } from '../lib/scenarios';

// The scenario table of the what-if lab (S-08; plan section 8, V4): "Keep this scenario" adds the what-if on screen as a row;
// rows can be compared two at a time, removed, and downloaded as a CSV made in the browser. The rows are kept in the
// preferences for each address, so they are there when the lab is opened again.

interface Props {
  address: string;
  /** The amount in the form as E8 reads it, and E8's answer for it; null until the form holds values that have been scored. */
  current: { amountBtc: string; result: WhatIfResult } | null;
}

export default function ScenarioPanel({ address, current }: Props) {
  const [prefs, update] = usePreferences();
  const { settings } = useSettings();
  const labels = useMethodLabels();
  const { notify } = useToasts();
  const [compared, setCompared] = useState<string[]>([]);
  const kept = prefs.scenarios[address] ?? [];
  const store = (list: typeof kept) => update({ scenarios: { ...prefs.scenarios, [address]: list } });

  const scenario = current ? scenarioOf(current.amountBtc, current.result) : null;
  const already = scenario !== null && kept.some((s) => s.id === scenario.id);
  const full = kept.length >= SCENARIOS_MAX;
  const keep = () => {
    if (!scenario || already || full) return;
    store([...kept, scenario]);
    notify({ message: 'Scenario kept', tone: 'success' });
  };
  const remove = (id: string) => {
    store(kept.filter((s) => s.id !== id));
    setCompared((ids) => ids.filter((x) => x !== id));
  };
  // At most two rows are compared; a third choice replaces the earlier one.
  const toggle = (id: string) => setCompared((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids.slice(-1), id]));

  const download = () => {
    const { header, rows } = scenarioCsvRows(kept, (id) => labels[id].name, settings.limitationLine);
    const table = { columns: header.map((label) => ({ label })), rows: rows.map((row) => row.map((text) => ({ text }))) };
    downloadText(`${fileStem(['what-if-scenarios', address, settings.snapshot?.snapshotDate ?? ''])}.csv`, tableToCsv(table), 'text/csv;charset=utf-8');
    notify({ message: `Exported ${plural(kept.length, 'scenario')}`, tone: 'success' });
  };

  const pair = kept.filter((s) => compared.includes(s.id));
  const number = (id: string) => kept.findIndex((s) => s.id === id) + 1;

  return (
    <section className="card scenarios" aria-labelledby="scenarios-title">
      <div className="scenarios-head">
        <h2 id="scenarios-title">Kept scenarios</h2>
        <div className="scenarios-actions">
          <button type="button" className="btn btn-primary" onClick={keep} disabled={scenario === null || already || full}>
            Keep this scenario
          </button>
          <button type="button" className="btn btn-secondary" onClick={download} disabled={kept.length === 0}>
            Download CSV
          </button>
        </div>
      </div>
      <p className="card-sub" role="status">
        {full
          ? `The table holds ${SCENARIOS_MAX} scenarios. Remove one to keep another.`
          : already
            ? 'This scenario is already in the table.'
            : scenario === null
              ? 'Enter an amount and wait for its verdict, then keep it here to compare it with others. Scenarios stay in this browser.'
              : `Keep what the verdict above says to compare it with other amounts and times. Up to ${SCENARIOS_MAX} are kept for this address, in this browser.`}
      </p>

      {kept.length === 0 ? null : (
        <TableScroll label="Kept what-if scenarios">
          <table className="data-table scenario-table">
            <caption className="sr-only">Kept what-if scenarios of this address, with the verdict of the deciding method</caption>
            <thead>
              <tr>
                <th scope="col">Compare</th>
                <th scope="col">Amount</th>
                <th scope="col">Direction</th>
                <th scope="col">Time (UTC)</th>
                <th scope="col">Verdict</th>
                <th scope="col" className="num">
                  Score
                </th>
                <th scope="col" className="num">
                  Flagged by
                </th>
                <th scope="col">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {kept.map((s, i) => (
                <tr key={s.id} className={s.flagged ? 'is-flagged' : undefined}>
                  <th scope="row" data-label="Compare">
                    <label className="scenario-pick">
                      <input type="checkbox" checked={compared.includes(s.id)} onChange={() => toggle(s.id)} />
                      <span>Scenario {i + 1}</span>
                    </label>
                  </th>
                  <td data-label="Amount" className="mono">
                    {s.amountBtc} BTC
                  </td>
                  <td data-label="Direction">{DIRECTION_LABEL[s.direction]}</td>
                  <td data-label="Time (UTC)">{s.time.slice(0, 16).replace('T', ' ')}</td>
                  <td data-label="Verdict">
                    <StatusBadge status={s.flagged ? 'flagged' : 'not-flagged'} /> <span className="muted small">{labels[s.method].name}</span>
                  </td>
                  <td data-label="Score" className="num">
                    {s.score.toFixed(2)}
                  </td>
                  <td data-label="Flagged by" className="num">
                    {s.flaggedBy} of {s.of} methods
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => remove(s.id)}>
                      Remove <span className="sr-only">scenario {i + 1}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      {pair.length === 2 ? (
        <p className="scenario-compare" role="status">
          <strong>
            Scenario {number(pair[1].id)} against scenario {number(pair[0].id)}:
          </strong>{' '}
          {compareScenarios(pair[0], pair[1])}.
        </p>
      ) : kept.length > 1 ? (
        <p className="muted small" role="status">
          Tick two scenarios to compare them.
        </p>
      ) : null}
    </section>
  );
}
