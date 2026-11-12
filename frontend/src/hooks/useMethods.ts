import { api } from '../api/client';
import type { MethodDescription, MethodId } from '../api/types';
import { useRequest } from './useRequest';

/** E11, asked once per session (the request cache keeps it): the methods' thresholds and test results. */
export function useMethods() {
  return useRequest('methods', (signal) => api.methods({ signal }));
}

/** Each method's flag line, for the tables that list them; empty until E11 has answered. */
export function useThresholds(): Partial<Record<MethodId, MethodDescription['threshold']>> {
  const methods = useMethods();
  return methods.status === 'success' ? Object.fromEntries(methods.data.methods.map((m) => [m.id, m.threshold])) : {};
}
