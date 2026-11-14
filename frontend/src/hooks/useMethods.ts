import { useMemo } from 'react';
import { api } from '../api/client';
import type { MethodDescription, MethodId } from '../api/types';
import { capitalised } from '../lib/format';
import { METHODS } from '../lib/methods';
import { useRequest } from './useRequest';

/** E11, asked once per session (the request cache keeps it): the methods' thresholds and test results. */
export function useMethods() {
  return useRequest('methods', (signal) => api.methods({ signal }));
}

export type MethodLabels = Record<MethodId, { name: string; family: string }>;

/**
 * What to call each method and its family, from E11 so that every screen uses one name. Until E11
 * has answered (or while the service is down) the short labels of lib/methods.ts stand in.
 */
export function useMethodLabels(): MethodLabels {
  const methods = useMethods();
  const answer = methods.status === 'success' ? methods.data : null;
  return useMemo(() => {
    const labels = Object.fromEntries(METHODS.map((m) => [m.id, { name: m.name, family: m.family }])) as MethodLabels;
    for (const m of answer?.methods ?? []) labels[m.id] = { name: m.name, family: capitalised(m.family) };
    return labels;
  }, [answer]);
}

/** Each method's flag line, for the tables that list them; empty until E11 has answered. */
export function useThresholds(): Partial<Record<MethodId, MethodDescription['threshold']>> {
  const methods = useMethods();
  return methods.status === 'success' ? Object.fromEntries(methods.data.methods.map((m) => [m.id, m.threshold])) : {};
}
