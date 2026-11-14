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
    header: ['Amount (BTC)', 'Direction', 'Time (UTC)', 'Deciding method', 'Verdict', 'Score', 'Methods that flag it', 'Methods that can score it', 'Limitation'],
    rows: scenarios.map((s) => [s.amountBtc, s.direction === 'in' ? 'Received' : 'Sent', s.time, methodName(s.method), s.flagged ? 'Flagged' : 'Not flagged', s.score.toFixed(2), String(s.flaggedBy), String(s.of), limitation]),
  };
}

const times = (ratio: number) => (ratio >= 10 ? Math.round(ratio) : Number(ratio.toPrecision(2)));

/** How the second scenario differs from the first, in a sentence: the amount, the score and the number of methods that flag it. */
export function compareScenarios(a: Scenario, b: Scenario): string {
  const amount = Number(b.amountBtc) / Number(a.amountBtc);
  const parts = [amount === 1 ? 'the same amount' : `${times(amount >= 1 ? amount : 1 / amount)} times ${amount > 1 ? 'larger' : 'smaller'}`];
  const score = b.score - a.score;
  parts.push(Math.abs(score) < 0.005 ? 'the same score' : `a score ${Math.abs(score).toFixed(2)} ${score > 0 ? 'higher' : 'lower'}`);
  const by = b.flaggedBy - a.flaggedBy;
  parts.push(by === 0 ? 'the same number of methods flagging it' : `${Math.abs(by)} ${Math.abs(by) === 1 ? 'method' : 'methods'} ${by > 0 ? 'more' : 'fewer'} flagging it`);
  return parts.join(', ');
}
