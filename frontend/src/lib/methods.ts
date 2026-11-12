// The nine methods in the order the verdict tables (V3 and V4) list them, with the names and families the plan
// uses. E11 names two of them with a suffix ("(A1)", "(two methods, one flag budget)") that these leave out; V5 shows
// E11's names, and the verdict tables take each method's flag line from E11.

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
