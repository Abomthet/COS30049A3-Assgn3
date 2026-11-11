import { useEffect } from 'react';
import type { Toast, ToastTone } from '../hooks/useToasts';
import { Icon, type IconName } from './Icon';

const ICON: Record<ToastTone, IconName> = { info: 'info', success: 'check', error: 'error' };

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const { id, message, tone = 'info', action, durationMs = action ? 10_000 : 5_000, leaving } = toast;

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), durationMs);
    return () => clearTimeout(timer);
  }, [id, durationMs, onDismiss]);

  return (
    <div className={`toast toast-${tone}${leaving ? ' toast-leaving' : ''}`}>
      <Icon name={ICON[tone]} className="toast-icon" />
      <p className="toast-message">{message}</p>
      {action ? (
        <button
          type="button"
          className="toast-button"
          onClick={() => {
            action.onAction();
            onDismiss(id);
          }}
        >
          {action.label}
        </button>
      ) : null}
      <button type="button" className="toast-button" onClick={() => onDismiss(id)} aria-label="Dismiss this message">
        Dismiss
      </button>
    </div>
  );
}

/** The polite live region that every toast appears in. It is always present, so a screen reader hears each new one. */
export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-region" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
