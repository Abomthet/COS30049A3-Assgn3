// What the scenario table does with kept scenarios (S-08): make one from an answer, compare two, write the CSV. Fetched with the table.

import type { MethodId, WhatIfDirection, WhatIfResult } from '../api/types';
import type { Scenario } from './scenarios';

/** A scenario from the form's values and E8's answer for them. */
export function scenarioOf(amountBtc: string, result: WhatIfResult): Scenario {
  const flags = Object.values(result.flags);
  const direction = result.direction as WhatIfDirection;
  return {
    id: `${direction}|${amountBtc}|${result.time}`,
    amountBtc,
    direction,
    time: result.time,
    method: result.method.id,
    flagged: result.flagged,
    score: result.score,
    flaggedBy: flags.filter(Boolean).length,
    of: flags.length,
  };
}

/** The CSV's header and the cells of each scenario, with the limitation line on every row (decision D-W-11). */
export function scenarioCsvRows(scenarios: Scenario[], methodName: (id: MethodId) => string, limitation: string): { header: string[]; rows: string[][] } {
  return {
    header: ['Amount (BTC)', 'Direction', 'Time (UTC)', 'Deciding model', 'Verdict', 'Score', 'Models that flag it', 'Models that can score it', 'Limitation'],
    rows: scenarios.map((s) => [s.amountBtc, s.direction === 'in' ? 'Received' : 'Sent', s.time, methodName(s.method), s.flagged ? 'Flagged' : 'Not flagged', s.score.toFixed(2), String(s.flaggedBy), String(s.of), limitation]),
  };
}

const times = (ratio: number) => (ratio >= 10 ? Math.round(ratio) : Number(ratio.toPrecision(2)));

/** One line of the comparison table: what is compared and how the second scenario differs from the first. */
export interface CompareRow {
  label: string;
  text: string;
}

/** How the second scenario differs from the first, as the rows of a small table: the amount, the score and the number of models that flag it. */
export function compareScenarios(a: Scenario, b: Scenario): CompareRow[] {
  const amount = Number(b.amountBtc) / Number(a.amountBtc);
  const score = b.score - a.score;
  const by = b.flaggedBy - a.flaggedBy;
  return [
    { label: 'Amount', text: amount === 1 ? 'Same' : `${times(amount >= 1 ? amount : 1 / amount)}× ${amount > 1 ? 'larger' : 'smaller'}` },
    { label: 'Score', text: Math.abs(score) < 0.005 ? 'Same' : `${Math.abs(score).toFixed(2)} ${score > 0 ? 'higher' : 'lower'}` },
    { label: 'Flagged by', text: by === 0 ? 'Same' : `${Math.abs(by)} ${by > 0 ? 'more' : 'fewer'} ${Math.abs(by) === 1 ? 'model' : 'models'}` },
  ];
}
