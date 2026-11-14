import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// A modal dialog (plan section 8, "New, general": focus held inside, Escape closes, focus returns). Focus moves
// to the first control when it opens (or to `initialFocus`), Tab and Shift+Tab stay within it, Escape and a
// click on the backdrop close it, and focus goes back to what had it before. It is drawn at the end of the page,
// so no ancestor's layout can clip it.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  title: string;
  /** The element with the id the dialog is labelled by is its heading; this adds a one-line description. */
  describedBy?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ title, describedBy, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    (focusable()[0] ?? panel.current)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close.current();
      } else if (event.key === 'Tab') {
        const stops = focusable();
        if (stops.length === 0) {
          event.preventDefault();
          return;
        }
        const [first, last] = [stops[0], stops[stops.length - 1]];
        const inside = panel.current?.contains(document.activeElement);
        if (event.shiftKey && (document.activeElement === first || !inside)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    const leave = () => close.current();
    document.addEventListener('keydown', onKey);
    // Following a link out of the dialog (the watchlist, say) is leaving the page it belongs to.
    window.addEventListener('hashchange', leave);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', leave);
      before?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panel} className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby={describedBy} tabIndex={-1}>
        <h2 id="dialog-title" className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
