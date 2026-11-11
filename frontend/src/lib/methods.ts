// The nine methods in the order V3 lists them, with the names and families the plan uses. The names
// match the service's own (`METHOD_NAMES` in the explorer package); E11 (V5) will supply them with
// their thresholds, and this list then goes away.

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
