// Kept what-if scenarios (S-08; plan section 8, V4): the amount, direction and time of a what-if with what the service said about
// it, up to ten for each address, kept in the preferences. The comparison and the CSV are made from these rows alone.

import type { MethodId, WhatIfDirection } from '../api/types';
import { METHODS } from './methods';

/** How many scenarios the table holds for one address. */
export const SCENARIOS_MAX = 10;

export interface Scenario {
  /** The values that make the scenario, so keeping the same what-if twice keeps one row. */
  id: string;
  amountBtc: string;
  direction: WhatIfDirection;
  /** UTC, as E8 echoes it: `2026-10-20T12:00:00Z`. */
  time: string;
  /** The deciding method, and its verdict and score for this what-if. */
  method: MethodId;
  flagged: boolean;
  score: number;
  /** How many of the `of` methods that can score a new amount flag it. */
  flaggedBy: number;
  of: number;
}

const isScenario = (s: unknown): s is Scenario => {
  const o = s as Partial<Record<keyof Scenario, unknown>> | null;
  return (
    typeof o === 'object' &&
    o !== null &&
    typeof o.id === 'string' &&
    typeof o.amountBtc === 'string' &&
    (o.direction === 'in' || o.direction === 'out') &&
    typeof o.time === 'string' &&
    METHODS.some((m) => m.id === o.method) &&
    typeof o.flagged === 'boolean' &&
    typeof o.score === 'number' &&
    typeof o.flaggedBy === 'number' &&
    typeof o.of === 'number'
  );
};

/** What the preferences hold, trusting nothing: the scenarios that are well formed, at most ten for each address. */
export function parseScenarios(raw: unknown): Record<string, Scenario[]> {
  if (typeof raw !== 'object' || raw === null) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([address, list]): [string, Scenario[]] => [address, Array.isArray(list) ? list.filter(isScenario).slice(0, SCENARIOS_MAX) : []])
      .filter(([, list]) => list.length > 0),
  );
}
