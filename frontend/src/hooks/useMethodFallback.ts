import { useEffect } from 'react';
import type { ApiError, MethodId } from '../api/types';
import { DEFAULT_METHOD, refusesMethod, withMethod } from '../lib/methods';
import { navigate } from '../lib/router';
import { useMethodLabels } from './useMethods';
import { usePreferences } from './usePreferences';
import { useToasts } from './useToasts';

/**
 * When the service says the chosen method cannot score this address and that method is only the remembered one (not a
 * link's own choice), open the address with the default method and say so; true while that switch is under way.
 * A link that names the method itself gets the explanation instead (ErrorState).
 */
export function useMethodFallback(error: ApiError | undefined, method: MethodId): boolean {
  const [{ method: remembered }] = usePreferences();
  const labels = useMethodLabels();
  const { notify } = useToasts();
  const switching = !!error && method !== DEFAULT_METHOD && method === remembered && refusesMethod(error.body);
  useEffect(() => {
    if (!switching) return;
    notify({ message: `${labels[method].name} has no scores for this address, so it opens with ${labels[DEFAULT_METHOD].name}.`, tone: 'info' });
    navigate(withMethod(window.location.hash, DEFAULT_METHOD), { replace: true });
  }, [switching]);
  return switching;
}
