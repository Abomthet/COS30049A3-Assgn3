import { Suspense, lazy } from 'react';
import type { ExplanationRequest } from '../api/types';
import { explanationBlocks } from '../lib/explanation';

// The words of an explanation (plan section 7, "The Explorer Assistant"). The template is on screen from
// the first paint; the Assistant's panel (which needs E12 and its own code) is fetched when a transaction opens.

export const TEMPLATE_LABEL = 'Template: fixed sentences filled in from the numbers';

/** The service's explanation as paragraphs and a list. The limitation line is left out: the screen shows it in its own place. */
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

const AssistantPanel = lazy(() => import('./AssistantPanel'));

interface Props {
  /** What E12 is asked about; the explanation can be written by the Assistant. */
  request: ExplanationRequest;
  /** The template, from E7 or E8; it stands until an answer replaces it. */
  template: string;
  flagged: boolean;
  limitation: string;
}

/** The explanation of a transaction with the Assistant's control: the template first, then the Assistant's answer when it is asked for. */
export function Explanation({ request, template, flagged, limitation }: Props) {
  return (
    <Suspense
      fallback={
        <div className="explanation">
          <p className="explanation-label">{TEMPLATE_LABEL}</p>
          <ExplanationBlocks text={template} limitation={limitation} />
        </div>
      }
    >
      <AssistantPanel key={JSON.stringify(request)} request={request} template={template} flagged={flagged} limitation={limitation} />
    </Suspense>
  );
}

/** What stands out about a transaction that is not flagged, in words, with the Assistant's control: the card V3 and V4 show in place of a flag's callout. */
export function NotFlaggedExplanation({ request, tx }: { request: ExplanationRequest; tx: { explanation: string; limitation: string } }) {
  return (
    <section className="explanation-card" aria-labelledby="in-words-title">
      <h3 id="in-words-title">In words</h3>
      <Explanation request={request} template={tx.explanation} flagged={false} limitation={tx.limitation} />
    </section>
  );
}
