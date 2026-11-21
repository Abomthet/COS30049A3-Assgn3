import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { ApiError, ExplanationRequest, ExplanationResponse } from '../api/types';
import { useSettings } from '../hooks/useSettings';
import { runRequest } from '../hooks/useRequest';
import { ErrorState } from './ErrorState';
import { ExplanationBlocks, TEMPLATE_LABEL } from './Explanation';

// The Explorer Assistant's control (S-05; plan section 7, "The Explorer Assistant"; R7). The explanation starts as the
// template. A flagged snapshot transaction is asked of E12 at once on a computer that cannot run the Assistant, because the
// service answers it from the answers prepared in advance; where the Assistant can run, the user asks for it with a button.
// While it writes there is a progress line and "Keep the template"; the answer is shown only if the service says it passed
// the guardrail, and otherwise the template stays with a line that names why.

const ASSISTANT_LABEL = 'Written by the Explorer Assistant, a language model the team trained; checked by code before being shown';
const NOT_INSTALLED = "The Assistant's model file (610 MB) is not installed; the README says how to add it. Explanations use the template.";

/** The guardrail's six checks (A2's names), in the words of a person who does not know the code. */
const CHECK_WORDS: Record<string, string> = {
  numbers_ok: 'a number that was not in the facts',
  limitation_ok: 'the limitation line missing from a flag',
  wording_ok: 'a word the project does not allow',
  direction_ok: 'a comparison pointing the wrong way',
  verdict_ok: 'a verdict that did not match',
  nonempty: 'an empty answer',
};

/** Why the template is shown although the Assistant was asked: the checks its answer failed, or why it could not write. */
function templateNote({ attempts, skippedWriters }: ExplanationResponse): string {
  const failed = [...new Set(attempts.flatMap((a) => a.failedChecks))].map((name) => CHECK_WORDS[name] ?? name);
  if (failed.length > 0) return `The Assistant wrote an answer, but the checks found ${failed.join(', ')}, so it was not shown. The template stays.`;
  const reasons = Object.values(skippedWriters);
  return reasons.length > 0 ? `${reasons.join(' ')} Explanations use the template.` : 'The Assistant did not write this one. The template stays.';
}

type Phase = { name: 'template' } | { name: 'writing' } | { name: 'answered'; answer: ExplanationResponse } | { name: 'failed'; error: ApiError };

interface Props {
  request: ExplanationRequest;
  template: string;
  flagged: boolean;
  limitation: string;
}

/** The Explorer Assistant's control for one explanation: it starts with the template, can ask for a written one, and keeps the template if the answer fails a check. */
export default function AssistantPanel({ request, template, flagged, limitation }: Props) {
  const { settings, origin } = useSettings();
  const capable = settings.capabilities.assistant;
  const [phase, setPhase] = useState<Phase>({ name: 'template' });
  const running = useRef<AbortController | null>(null);
  // A flagged snapshot transaction may have a prepared answer, which needs no weights.
  const prepared = request.txid !== undefined && flagged;

  const ask = () => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setPhase({ name: 'writing' });
    void runRequest(() => api.explain(request, { signal: controller.signal })).then((result) => {
      if (!controller.signal.aborted) setPhase(result.ok ? { name: 'answered', answer: result.data } : { name: 'failed', error: result.error });
    });
  };
  const keepTemplate = () => {
    running.current?.abort();
    setPhase({ name: 'template' });
  };

  // Once E2 has said what this computer can do. Where the Assistant can write, an answer is never asked for unprompted.
  useEffect(() => {
    if (prepared && !capable && origin !== 'loading') ask();
    return () => running.current?.abort();
  }, [capable, origin]);

  const answer = phase.name === 'answered' ? phase.answer : null;
  const written = answer?.source === 'text150m';

  return (
    <div className="explanation" aria-busy={phase.name === 'writing'}>
      <p className="explanation-label">{written ? ASSISTANT_LABEL : TEMPLATE_LABEL}</p>
      <ExplanationBlocks text={written ? answer.explanation : template} limitation={limitation} />

      <div className="assistant-control" aria-live="polite">
        {phase.name === 'template' && capable ? (
          <button type="button" className="btn btn-secondary" onClick={ask}>
            Ask the Assistant to write this
          </button>
        ) : null}
        {phase.name === 'template' && !capable && !prepared && origin !== 'loading' ? <p className="assistant-note">{NOT_INSTALLED}</p> : null}
        {phase.name === 'writing' ? (
          <>
            <p className="assistant-progress">
              <span className="spinner" aria-hidden="true" /> Writing; this takes about 10 seconds on this computer
            </p>
            <button type="button" className="btn btn-ghost" onClick={keepTemplate}>
              Keep the template
            </button>
          </>
        ) : null}
        {answer && !written ? <p className="assistant-note">{templateNote(answer)}</p> : null}
      </div>

      {phase.name === 'failed' ? (
        <>
          <ErrorState error={phase.error} onRetry={ask} headingLevel={3} />
          <button type="button" className="btn btn-ghost" onClick={keepTemplate}>
            Keep the template
          </button>
        </>
      ) : null}
    </div>
  );
}
