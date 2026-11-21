import type { ReactNode } from 'react';

/**
 * The sideways-scrolling box around a data table. A box that can scroll must be reachable by keyboard (WCAG 2.1.1),
 * so it is a focusable region with a name; the focus ring is the app's global `:focus-visible` style. The box is
 * focusable even when the table fits, because whether it overflows changes with the window and text size, and a
 * stop that appears and disappears on resize would be worse than one extra Tab.
 */
export function TableScroll({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
