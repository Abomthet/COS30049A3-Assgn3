import { useEffect, useState } from 'react';
import { WEB } from '../lib/settings';

/**
 * A request that is still pending halfway to its time limit says so (plan section 10, "Responsiveness
 * rules": after 5 seconds, with the 10 second limit in settings.json). Derived from that limit, so the
 * notice and the timeout cannot drift apart.
 */
const SLOW_AFTER_MS = WEB.requests.timeoutMs / 2;

/** True once `active` has been true for longer than the slow notice's delay; false again as soon as it ends. */
export function useSlow(active: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active]);
  return slow;
}
