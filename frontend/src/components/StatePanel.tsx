import type { ReactNode } from 'react';
import { useSlow } from '../hooks/useSlow';

// One component for every feedback state (FR-05): it always says what happened and offers
// a next action. Tone sets the colour; the title says what happened, so no meaning rests on colour.

export type Tone = 'info' | 'warning' | 'error' | 'empty';

interface Props {
  tone: Tone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** 'alert' for results of something the user just did; 'status' for passive states. */
  live?: 'alert' | 'status';
  headingLevel?: 2 | 3;
  testId?: string;
}

/** The one panel for every feedback state (empty, info, warning or error), with a title and next actions; used across the screens. */
export function StatePanel({ tone, title, children, actions, live, headingLevel = 2, testId }: Props) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`state-panel tone-${tone}`} role={live} data-testid={testId}>
      <div className="state-body">
        <Heading className="state-title">{title}</Heading>
        {children}
        {actions ? <div className="state-actions">{actions}</div> : null}
      </div>
    </section>
  );
}

/** A loading indicator with a label, which adds a note when the wait is long; used wherever a request is pending. */
export function Loading({ label, block = false }: { label: string; block?: boolean }) {
  // Loading is mounted for exactly as long as the request is pending, so its own clock is the request's.
  const slow = useSlow(true);

  return (
    <div className={block ? 'loading loading-block' : 'loading'} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{slow ? `${label} Still working, this is taking a little longer.` : label}</span>
    </div>
  );
}
