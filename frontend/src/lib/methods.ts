// The nine methods in the order the verdict tables (V3 and V4) list them. The names and families here are
// the short ones the screens show until E11 answers, or when the service cannot be reached; once E11 has
// answered, its names and families replace them everywhere (useMethodLabels), so a method is never
// named two ways.

import type { MethodId } from '../api/types';

export const METHODS: Array<{ id: MethodId; name: string; family: string }> = [
  { id: 'baseline', name: 'Robust z baseline', family: 'Statistics' },
  { id: 'isolation_forest', name: 'Isolation Forest', family: 'Outlier detection' },
  { id: 'lof', name: 'Local Outlier Factor', family: 'Outlier detection' },
  { id: 'kmeans', name: 'K-Means distance', family: 'Clustering' },
  { id: 'dbscan', name: 'DBSCAN noise', family: 'Clustering' },
  { id: 'regression', name: 'Regression residual', family: 'Regression' },
  { id: 'regression_interval', name: 'Regression expected range', family: 'Regression' },
  { id: 'fusion', name: 'Score fusion', family: 'Combination' },
  { id: 'txgpt_method', name: 'TxGPT surprisal', family: 'Language model' },
];

/** The method that decides when a link names none; E2 and E11 say the same (`defaultMethod`). It is left out of links. */
export const DEFAULT_METHOD: MethodId = 'baseline';

/** The method a link's query string names; the default when it names none or one that does not exist. */
export function parseMethod(search: string): MethodId {
  const named = new URLSearchParams(search).get('method');
  return METHODS.find((m) => m.id === named)?.id ?? DEFAULT_METHOD;
}

/** `method=<id>` for a link's query string, or nothing for the default. */
export const methodSearch = (method: MethodId): string => (method === DEFAULT_METHOD ? '' : `method=${method}`);

/** A link (a hash route) with its method set to `method`, its page reset and every other part kept. */
export function withMethod(hash: string, method: MethodId): string {
  const [path, search = ''] = hash.split('?');
  const params = new URLSearchParams(search);
  params.delete('method');
  params.delete('page');
  if (method !== DEFAULT_METHOD) params.set('method', method);
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

/** Methods whose scores are prepared in advance for the snapshot; the service has none for a fetched (live) address. */
export const SNAPSHOT_ONLY: readonly MethodId[] = ['txgpt_method'];

/** True when a 400 names the `method` field: the address is fine, the method cannot score it. */
export const refusesMethod = (body: { status: string; fields?: Array<{ name: string }> }): boolean =>
  body.status === 'invalid' && !!body.fields?.some((f) => f.name === 'method');
