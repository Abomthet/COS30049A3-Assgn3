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
