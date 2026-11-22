import { useEffect, useRef } from 'react';
import { useOnline } from '../hooks/useOnline';
import { useServiceStatus } from '../hooks/useServiceStatus';

/**
 * The catalogue's "Offline" state: the browser reports no connection. Views already loaded stay
 * usable (their answers are kept for the session); one that needs a new answer shows its network
 * state. When the connection returns the service is asked at once, so pages that failed reload
 * without waiting for the next status poll.
 */
export function OfflineBanner() {
  const online = useOnline();
  const { recheck } = useServiceStatus();
  const wasOnline = useRef(online);

  useEffect(() => {
    if (online && !wasOnline.current) recheck();
    wasOnline.current = online;
  }, [online, recheck]);

  if (online) return null;
  return (
    <div className="offline-banner" role="alert" data-testid="offline-banner">
      <div className="container offline-banner-inner">
        <p>
          <strong>You're offline.</strong> Pages you have already opened stay usable. The Explorer loads the rest when your connection returns.
        </p>
      </div>
    </div>
  );
}
