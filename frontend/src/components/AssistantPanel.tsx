import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { ApiError, ExplanationRequest, ExplanationResponse, Reason } from '../api/types';
import { useSettings } from '../hooks/useSettings';
import { runRequest } from '../hooks/useRequest';
import { ErrorState } from './ErrorState';
import { ExplanationBlocks, ReasonLines, type AssistantParts } from './Explanation';

// The Explorer Assistant's control (S-05; plan section 7, "The Explorer Assistant"; R7). The reason lines are what the
// Assistant's answer replaces; the big figure, "Compared with" and the limitation line always stay. E12 is never asked on
// mount: the reason lines are what a reader sees first, and the button "Ask the Assistant to explain" is there wherever the
// Assistant can answer, that is where it can write (E2 `assistant`) or where the service has an answer prepared in advance
// (a flagged snapshot transaction; that answer comes back at once). While it writes there is a progress line and "Cancel";
// the answer is shown only if the service says it passed the guardrail, and otherwise the reason lines stay with a line
// that says so. The panel gives its caller two parts (the lines and the control) to place.

const ASSISTANT_LABEL = 'Written by the Assistant. Checked by code before it is shown.';
const NOT_INSTALLED = "The Assistant isn't installed on this computer.";
const FAILED_CHECKS = "The Assistant's answer did not pass our checks, so this explanation stays.";

/** Why the reason lines are shown although the Assistant was asked: it failed a check (the check names stay in the response), or why it could not write. */
function lineNote({ attempts, skippedWriters }: ExplanationResponse): string {
  if (attempts.some((a) => a.failedChecks.length > 0)) return FAILED_CHECKS;
  const reasons = Object.values(skippedWriters);
  return reasons.length > 0 ? reasons.join(' ') : 'The Assistant did not write this one.';
}

type Phase = { name: 'lines' } | { name: 'writing' } | { name: 'answered'; answer: ExplanationResponse } | { name: 'failed'; error: ApiError };

interface Props {
  request: ExplanationRequest;
  /** The reason lines; the Assistant's answer replaces them. */
  reasons: Reason[];
  flagged: boolean;
  limitation: string;
  children: (parts: AssistantParts) => ReactNode;
}

/** The Explorer Assistant's control for one explanation: the reason lines first, a written answer in their place when asked for, the lines kept if the answer fails a check. */
export default function AssistantPanel({ request, reasons, flagged, limitation, children }: Props) {
  const { settings, origin } = useSettings();
  const capable = settings.capabilities.assistant;
  const [phase, setPhase] = useState<Phase>({ name: 'lines' });
  const running = useRef<AbortController | null>(null);
  // A flagged snapshot transaction has a prepared answer, which needs no weights.
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
  const cancel = () => {
    running.current?.abort();
    setPhase({ name: 'lines' });
  };

  // Nothing is asked of E12 on mount; a request still running when the box goes away is cancelled.
  useEffect(() => () => running.current?.abort(), []);

  const answer = phase.name === 'answered' ? phase.answer : null;
  const written = answer?.source === 'text150m';

  const lines = written ? (
    <div className="explanation">
      <p className="explanation-label">{ASSISTANT_LABEL}</p>
      <ExplanationBlocks text={answer.explanation} limitation={limitation} />
    </div>
  ) : (
    <ReasonLines reasons={reasons} />
  );

  const control = (
    <div className="explanation" aria-busy={phase.name === 'writing'}>
      <div className="assistant-control" aria-live="polite">
        {phase.name === 'lines' && (capable || prepared) ? (
          <button type="button" className="btn btn-secondary" onClick={ask}>
            Ask the Assistant to explain
          </button>
        ) : null}
        {phase.name === 'lines' && !capable && !prepared && origin !== 'loading' ? <p className="assistant-note">{NOT_INSTALLED}</p> : null}
        {phase.name === 'writing' ? (
          <>
            <p className="assistant-progress">
              <span className="spinner" aria-hidden="true" /> Writing… about 10 seconds
            </p>
            <button type="button" className="btn btn-ghost" onClick={cancel}>
              Cancel
            </button>
          </>
        ) : null}
        {answer && !written ? <p className="assistant-note">{lineNote(answer)}</p> : null}
      </div>

      {phase.name === 'failed' ? (
        <>
          <ErrorState error={phase.error} onRetry={ask} headingLevel={3} />
          <button type="button" className="btn btn-ghost" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );

  return <>{children({ lines, control })}</>;
}
