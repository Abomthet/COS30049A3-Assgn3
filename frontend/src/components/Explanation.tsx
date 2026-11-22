import { Suspense, lazy, type ReactNode } from 'react';
import type { ExplanationRequest, Reason } from '../api/types';
import { explanationBlocks } from '../lib/explanation';
import { reasonLine } from '../lib/reasons';

// The words of an explanation (plan section 7, "The Explorer Assistant"). The reason lines are on screen from the first
// paint; the Assistant's panel (which needs E12 and its own code) is fetched when a transaction opens. The Assistant's
// answer replaces the reason lines only; the rest of the box (big figure, comparison, limitation line) always stays.

/** The Assistant's answer (or any plain-text explanation) as paragraphs and a list. The limitation line is left out: the screen shows it in its own place. */
export function ExplanationBlocks({ text, limitation }: { text: string; limitation: string }) {
  return (
    <>
      {explanationBlocks(text, limitation).map((block, i) =>
        block.kind === 'text' ? (
          <p key={i}>{block.text}</p>
        ) : (
          <ul key={i} className="reasons">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </>
  );
}

/** The reasons, one line each ("Label: value (usual x)"; F4 "Label: 0.4× its usual size"). Nothing when there are none. */
export function ReasonLines({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul className="reason-lines" data-testid="reason-lines">
      {reasons.map((r) => (
        <li key={r.feature}>{reasonLine(r)}</li>
      ))}
    </ul>
  );
}

/** The two parts of the Assistant's control: where its answer (or the reason lines) goes, and its buttons and notes. The caller places them. */
export interface AssistantParts {
  lines: ReactNode;
  control: ReactNode;
}

const AssistantPanel = lazy(() => import('./AssistantPanel'));

interface Props {
  /** What E12 is asked about; the explanation can be written by the Assistant. */
  request: ExplanationRequest;
  /** The reason lines the Assistant's answer replaces. */
  reasons: Reason[];
  flagged: boolean;
  limitation: string;
  /** Lays out the box: `lines` and `control` are where the caller wants them. */
  children: (parts: AssistantParts) => ReactNode;
}

/** The reason lines with the Assistant's control: the lines first, then the Assistant's answer in their place when it is asked for. */
export function Explanation({ request, reasons, flagged, limitation, children }: Props) {
  return (
    <Suspense fallback={children({ lines: <ReasonLines reasons={reasons} />, control: null })}>
      <AssistantPanel key={JSON.stringify(request)} request={request} reasons={reasons} flagged={flagged} limitation={limitation}>
        {children}
      </AssistantPanel>
    </Suspense>
  );
}

/**
 * A transaction that is not flagged: one closed disclosure, "Details", holding "Closest to the flag line" (the reasons,
 * which are the largest differences or the features that reached the contributing line) and the Assistant's control.
 * V3 and V4 show it under their "Score … below the flag line …" line.
 */
export function NotFlaggedExplanation({ request, tx }: { request: ExplanationRequest; tx: { reasons: Reason[]; limitation: string } }) {
  return (
    <details className="not-flagged-details" data-testid="not-flagged-details">
      <summary>Details</summary>
      <div className="not-flagged-body">
        <Explanation request={request} reasons={tx.reasons} flagged={false} limitation={tx.limitation}>
          {({ lines, control }) => (
            <>
              <h4>Closest to the flag line</h4>
              {lines}
              {control}
            </>
          )}
        </Explanation>
      </div>
    </details>
  );
}
