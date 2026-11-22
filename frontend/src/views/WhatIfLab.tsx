import { Suspense, lazy, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api/client';
import type { ApiError, ExplanationRequest, InsufficientHistoryBody, MethodId, TimelineResponse, WhatIfDirection, WhatIfRequest, WhatIfResult } from '../api/types';
import { G3FeatureDeviation } from '../charts/G3FeatureDeviation';
import { LazyG4 } from '../charts/LazyG4';
import { G5WhatIfResponse } from '../charts/G5WhatIfResponse';
import { StatusBadge } from '../components/Badges';
import { ErrorState } from '../components/ErrorState';
import { NotFlaggedExplanation } from '../components/Explanation';
import { FlagCallout } from '../components/FlagCallout';
import { Loading, StatePanel } from '../components/StatePanel';
import { VerdictTable } from '../components/VerdictTable';
import { useCurve } from '../hooks/useCurve';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useMethodLabels } from '../hooks/useMethods';
import { useRequest } from '../hooks/useRequest';
import { useSettings } from '../hooks/useSettings';
import { useSlow } from '../hooks/useSlow';
import { addDays, dayKey, formatDay } from '../lib/dates';
import { DIRECTION_LABEL, formatBtc, formatHours, formatSpanDays, plural } from '../lib/format';
import { DEFAULT_METHOD, parseMethod } from '../lib/methods';
import { paths } from '../lib/router';
import { amountText, checkAmount, checkWhen, splitTime } from '../lib/whatIf';

// V4, the what-if lab (plan section 8; M-06, R1, R2): three fields (amount, direction, time) and what
// the models would say about a transaction like that, which does not exist. Nothing needs submitting:
// once all three are valid the request goes after `web.whatIf.debounceMs` of quiet, the request before
// it is cancelled, and the previous result stays in place, dimmed and marked "Updating", until the next
// arrives. The curve of chart G5 is drawn for the direction and time alone.

// The scenario table (S-08) is fetched with the lab.
const ScenarioPanel = lazy(() => import('./ScenarioPanel'));

const DIRECTIONS: WhatIfDirection[] = ['out', 'in'];
/** The quiet stretches the time chips jump to, in days after the address's last transaction. */
const QUIET_DAYS = [1, 30, 90];
const QUIET_LABEL: Record<number, string> = { 1: 'The day after its last transaction', 30: 'After 30 quiet days', 90: 'After 90 quiet days' };
/** The amount chips: multiples of the address's usual amount in the chosen direction. */
const USUAL_MULTIPLES = [
  { times: 1, label: 'Usual' },
  { times: 10, label: '10 × usual' },
  { times: 100, label: '100 × usual' },
];
/** What the form's status line and the result's mark say once an answer is taking longer than expected. */
const STILL_WORKING = 'Still working, this is taking longer than usual…';
/** The slider has this many steps from the smallest amount of the curve to the largest. */
const SLIDER_STEPS = 1000;

/** What was changed from the starting values; a field left alone follows the default, which E2 may still be about to provide. */
interface Edits {
  amount: string;
  direction: WhatIfDirection | null;
  date: string | null;
  clock: string | null;
}

/** A label, a hint, the control, its error right under it, and whatever helps to fill it in (`after`). */
function Field({ id, label, hint, error, children, after }: { id: string; label: string; hint?: string; error?: string; children: ReactNode; after?: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="field-help muted">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          <span>{error}</span>
        </p>
      ) : null}
      {after}
    </div>
  );
}

/** V4, the what-if lab: amount, direction and time fields, with the models' answer for a transaction like that; the what-if tab of an address. */
export function WhatIfLab({ timeline, search }: { timeline: TimelineResponse; search: string }) {
  const { address, range } = timeline;
  const { settings } = useSettings();
  const { debounceMs, maxGapYears } = settings.web.whatIf;
  const ids = { amount: useId(), date: useId(), clock: useId() };
  const fields = useRef<Record<'amount' | 'date' | 'clock', HTMLInputElement | null>>({ amount: null, date: null, clock: null });

  const opened = new URLSearchParams(search).get('direction');
  const [edits, setEdits] = useState<Edits>({ amount: '', direction: opened === 'in' || opened === 'out' ? opened : null, date: null, clock: null });
  const [touched, setTouched] = useState(false);
  const edit = (patch: Partial<Edits>) => setEdits((e) => ({ ...e, ...patch }));

  // E2's default time (the snapshot date at noon); without it, noon on the day after the address's last transaction.
  const start = splitTime(settings.whatIf?.defaultTime ?? `${addDays(dayKey(range.end), 1)}T12:00:00Z`);
  const direction = edits.direction ?? DIRECTIONS[0];
  const date = edits.date ?? start.date;
  const clock = edits.clock ?? start.clock;

  const amount = checkAmount(edits.amount);
  const when = checkWhen(date, clock, range, maxGapYears);
  const request: WhatIfRequest | null = amount.ok && when.ok ? { amountBtc: amount.value.btc, direction, time: when.value } : null;

  const verdictKey = useDebouncedValue(request ? JSON.stringify(request) : '', debounceMs);
  const curveKey = useDebouncedValue(when.ok ? `${direction}|${when.value}` : '', debounceMs);
  const sent = verdictKey.debounced ? (JSON.parse(verdictKey.debounced) as WhatIfRequest) : null;
  const [curveDirection, curveTime] = curveKey.debounced.split('|') as [WhatIfDirection, string | undefined];

  const verdict = useRequest(sent && `whatif:${address}:${verdictKey.debounced}`, (signal) => api.whatIf(address, sent!, { signal }));
  const curve = useCurve(address, curveDirection, curveTime ?? null, amount.ok ? Number(amount.value.btc) : null);
  const [methodChoice, setMethodChoice] = useState<MethodId | null>(null);

  const shown = verdict.status === 'success' ? verdict.data : verdict.previous;
  const curveShown = curve.status === 'success' ? curve.data : curve.previous;
  // Anything the user has typed that the screen does not yet answer: dimmed, and marked.
  const pending = !verdictKey.settled || verdict.status === 'loading' || !curveKey.settled || curve.status === 'loading';
  const slow = useSlow(pending);
  // E8's answer is exact only for the amount in the form, which is what the marker on G5 wants.
  const answered = verdictKey.settled && verdict.status === 'success' ? verdict.data : null;

  const serverField = (name: string) => (verdict.status === 'error' && verdict.error.body.status === 'invalid' ? verdict.error.body.fields?.find((f) => f.name === name)?.message : undefined);
  const amountError = touched && !amount.ok ? amount.message : serverField('amountBtc');
  const timeError = !when.ok ? when.message : serverField('time');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!amount.ok) fields.current.amount?.focus();
    else if (!when.ok) fields.current.date?.focus();
    verdictKey.flush();
    curveKey.flush();
  };

  const usual = curveShown?.usualBtc ?? null;
  const [lowest, highest] = curveShown ? [curveShown.amountsBtc[0], curveShown.amountsBtc[curveShown.amountsBtc.length - 1]] : [0, 0];
  const logSpan = Math.log10(highest) - Math.log10(lowest);
  const slider = amount.ok && curveShown ? Math.round((Math.min(Math.max(Math.log10(Number(amount.value.btc)) - Math.log10(lowest), 0), logSpan) / logSpan) * SLIDER_STEPS) : 0;

  const lastDay = dayKey(range.end);
  const insufficient = [verdict, curve].map((r) => (r.status === 'error' ? r.error.body : null)).find((b): b is InsufficientHistoryBody => b?.status === 'insufficient_history');
  // The last result stays up while the next loads or the form is being corrected; after a failure it would be out of date.
  const view: VerdictView = verdict.status === 'error' ? { error: verdict.error, retry: verdict.retry } : (shown ?? (verdict.status === 'loading' ? 'loading' : null));
  const details = verdict.status === 'error' || insufficient ? null : shown;
  const status = request === null ? 'Correct the marked fields and the verdict will update.' : pending ? (slow ? STILL_WORKING : 'Updating…') : 'The verdict below is for these values.';

  // What helps fill the amount in: the slider along the curve, the usual-amount chips, and what the answer says about it.
  const amountHelp = (
    <>
      {curveShown ? (
        <input
          type="range"
          className="whatif-slider"
          aria-label="Amount on a log scale, across the range of the curve"
          min={0}
          max={SLIDER_STEPS}
          value={slider}
          onChange={(e) => {
            setTouched(true);
            edit({ amount: amountText(Math.max(10 ** (Math.log10(lowest) + (Number(e.target.value) / SLIDER_STEPS) * logSpan), 1e-8)) });
          }}
        />
      ) : null}
      {usual !== null ? (
        <div className="chips" role="group" aria-label="Amounts relative to this address's usual">
          {USUAL_MULTIPLES.map(({ times, label }) => (
            <button key={times} type="button" className="chip" onClick={() => edit({ amount: amountText(usual * times) })}>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {answered && amount.ok ? <AmountFeedback result={answered} amountBtc={amount.value.btc} /> : null}
    </>
  );

  return (
    <div className="whatif">
      <p className="whatif-note">
        A what-if is hypothetical. Nothing is sent to the Bitcoin network and nothing is stored.
        {parseMethod(search) === DEFAULT_METHOD ? '' : ' The lab always decides with the default method; its table shows all nine.'}
      </p>

      <div className="whatif-layout">
        <form className="card whatif-form" onSubmit={submit} noValidate aria-labelledby="whatif-form-title">
          <h2 id="whatif-form-title">Try an amount</h2>

          <Field id={ids.amount} label="Amount (BTC)" hint="Up to 8 decimal places, such as 0.05." error={amountError} after={amountHelp}>
            <input
              id={ids.amount}
              ref={(el) => void (fields.current.amount = el)}
              className="text-input mono"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.05"
              value={edits.amount}
              aria-invalid={amountError ? true : undefined}
              aria-describedby={[`${ids.amount}-hint`, amountError ? `${ids.amount}-error` : null].filter(Boolean).join(' ')}
              onChange={(e) => {
                setTouched(true);
                edit({ amount: e.target.value });
              }}
            />
          </Field>

          <fieldset className="field segmented-field">
            <legend className="field-label">Direction</legend>
            <div className="segmented">
              {DIRECTIONS.map((d) => (
                <label key={d}>
                  <input type="radio" name="direction" value={d} checked={direction === d} onChange={() => edit({ direction: d })} />
                  <span>{DIRECTION_LABEL[d]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="field">
            <legend className="field-label">Time (UTC)</legend>
            <div className="when">
              <input
                id={ids.date}
                ref={(el) => void (fields.current.date = el)}
                className="text-input"
                type="date"
                aria-label="Date"
                value={date}
                min={dayKey(range.start)}
                aria-invalid={timeError ? true : undefined}
                aria-describedby={timeError ? `${ids.date}-error` : undefined}
                onChange={(e) => edit({ date: e.target.value })}
              />
              <input
                id={ids.clock}
                ref={(el) => void (fields.current.clock = el)}
                className="text-input"
                type="time"
                aria-label="Time of day"
                value={clock}
                aria-invalid={timeError ? true : undefined}
                aria-describedby={timeError ? `${ids.date}-error` : undefined}
                onChange={(e) => edit({ clock: e.target.value })}
              />
            </div>
            {timeError ? (
              <p id={`${ids.date}-error`} className="field-error" role="alert">
                      <span>{timeError}</span>
              </p>
            ) : null}
            <div className="chips" role="group" aria-label="Times after this address's last transaction">
              {QUIET_DAYS.map((days) => (
                <button key={days} type="button" className="chip" onClick={() => edit({ date: addDays(lastDay, days) })}>
                  {QUIET_LABEL[days]}
                </button>
              ))}
            </div>
            {answered ? <GapFeedback result={answered} /> : null}
          </fieldset>

          <div className="whatif-submit">
            <button type="submit" className="btn btn-primary">
              Score it
            </button>
            <p className="whatif-status" role="status">
              {status}
            </p>
          </div>
        </form>

        <div className={pending ? 'whatif-result is-updating' : 'whatif-result'} aria-busy={pending}>
          <Verdict view={view} insufficient={insufficient} onUseDate={(day) => edit({ date: day })} pending={pending ? (slow ? STILL_WORKING : 'Updating…') : null} />
          {!insufficient && curveShown ? (
            <>
              {curve.aroundTypedAmount ? (
                <p className="card-sub">
                  This address has not {curveDirection === 'out' ? 'sent' : 'received'} anything before this time, so there is no usual amount to centre the curve on. It is drawn from{' '}
                  {formatBtc(lowest * 1e8)} to {formatBtc(highest * 1e8)}, around the amount in the form.
                </p>
              ) : null}
              <div className="card chart-card">
                <G5WhatIfResponse
                  curve={curveShown}
                  address={address}
                  methodId={methodChoice ?? curveShown.decidingMethod}
                  onMethodChange={setMethodChoice}
                  marker={amount.ok ? { amountBtc: Number(amount.value.btc), answer: answered } : null}
                  onPickAmount={(btc) => edit({ amount: amountText(btc) })}
                />
              </div>
            </>
          ) : null}
          {!insufficient && !curveShown && curve.status === 'error' ? <ErrorState error={curve.error} onRetry={curve.retry} headingLevel={3} /> : null}
          {!insufficient && !curveShown && curve.status === 'loading' ? <Loading label="Drawing the curve…" block /> : null}
        </div>
      </div>

      <Suspense fallback={null}>
        <ScenarioPanel address={address} current={answered && amount.ok ? { amountBtc: amount.value.btc, result: answered } : null} />
      </Suspense>

      {details ? (
        <>
          <div className={pending ? 'card is-updating' : 'card'}>
            <G3FeatureDeviation features={details.features} address={address} />
          </div>
          <section className={pending ? 'card verdicts is-updating' : 'card verdicts'} aria-labelledby="whatif-verdicts-title">
            <h2 id="whatif-verdicts-title">What each model says</h2>
            <VerdictTable
              scores={details.scores}
              flags={details.flags}
              deciding={details.method.id}
              unavailableText="Not available for a hypothetical transaction"
              caption="Score, flag line and verdict of each method for this hypothetical transaction"
            />
            <div className="card chart-card">
              <LazyG4 ranks={details.ranks} scores={details.scores} flags={details.flags} deciding={details.method.id} subject="what-if" address={address} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

/** "0.05 BTC is about 95 times this address's usual sent amount": F4 is the amount divided by the usual one. */
function AmountFeedback({ result, amountBtc }: { result: WhatIfResult; amountBtc: string }) {
  const ratio = result.features.find((f) => f.id === 'F4')?.value;
  if (ratio == null) return null;
  const times = ratio >= 10 ? Math.round(ratio) : Number(ratio.toPrecision(2));
  return (
    <p className="whatif-feedback">
      {amountBtc} BTC is about {times} {times === 1 ? 'time' : 'times'} this address's usual {result.direction === 'out' ? 'sent' : 'received'} amount.
    </p>
  );
}

/** The gap since the address's previous transaction (F3), which the time field decides. */
function GapFeedback({ result }: { result: WhatIfResult }) {
  const hours = result.features.find((f) => f.id === 'F3')?.value;
  return hours == null ? null : <p className="whatif-feedback">{formatHours(hours)} after this address's previous transaction.</p>;
}

type VerdictView = WhatIfResult | 'loading' | { error: ApiError; retry: () => void } | null;

function Verdict({ view, insufficient, onUseDate, pending }: { view: VerdictView; insufficient: InsufficientHistoryBody | undefined; onUseDate: (day: string) => void; pending: string | null }) {
  const labels = useMethodLabels();
  if (insufficient) {
    const h = insufficient.history;
    return (
      <StatePanel
        tone="warning"
        title="Not enough history at that time"
        testId="state-insufficient"
        actions={
          insufficient.firstScoredDate ? (
            <button type="button" className="btn btn-secondary" onClick={() => onUseDate(insufficient.firstScoredDate!)}>
              Use the first date that works ({formatDay(insufficient.firstScoredDate)})
            </button>
          ) : (
            <a className="btn btn-secondary" href={paths.select()}>
              Choose an address with more history
            </a>
          )
        }
      >
        <p>
          At that time this address had {plural(h.earlierTx, 'earlier transaction')}, over {formatSpanDays(h.spanDays)}; scoring needs {h.required.minTx} over {h.required.minSpanDays} days.
          Nothing is scored until the time is later.
        </p>
      </StatePanel>
    );
  }
  if (view === null) {
    return (
      <StatePanel tone="empty" title="Enter an amount to score it" testId="state-whatif-empty">
        <p>The verdict of every method that can score a new amount appears here, and updates as you type.</p>
      </StatePanel>
    );
  }
  if (view === 'loading') return <Loading label="Scoring…" block />;
  if ('error' in view) {
    const body = view.error.body;
    // The browser has checked the fields, so a 400 here means the two tiers disagree; the server's words are under the field.
    return body.status === 'invalid' ? (
      <StatePanel tone="warning" title="Check the values" live="alert" testId="state-whatif-invalid">
        <p>
          {body.message} {body.hint}
        </p>
      </StatePanel>
    ) : (
      <ErrorState error={view.error} onRetry={view.retry} />
    );
  }

  const tx = view;
  // E12 is asked about the values the answer is for: the amount as eight decimals, the direction and the time E8 echoes.
  const request: ExplanationRequest = { address: tx.address, whatIf: { amountBtc: (Math.abs(tx.netSats) / 1e8).toFixed(8), direction: tx.direction as WhatIfDirection, time: tx.time } };
  return (
    <section className="card verdict-card" aria-labelledby="verdict-title" data-testid="verdict-card">
      <header className="verdict-head">
        <h2 id="verdict-title">{tx.flagged ? `Flagged by ${labels[tx.method.id].name}` : 'Not flagged'}</h2>
        <StatusBadge status={tx.flagged ? 'flagged' : 'not-flagged'} />
        {pending ? <span className="updating-mark">{pending}</span> : null}
      </header>
      <p className="verdict-score">
        Score <strong className="mono">{tx.score.toFixed(2)}</strong> against a flag line of <span className="mono">{tx.method.flagAbsZ.toFixed(2)}</span>.{' '}
        <span className="muted">
          {DIRECTION_LABEL[tx.direction]} {formatBtc(Math.abs(tx.netSats))}, at {tx.time.slice(0, 16).replace('T', ' ')} UTC.
        </span>
      </p>
      {tx.flagged ? (
        <FlagCallout tx={tx} title="Why this amount stands out" request={request} />
      ) : (
        <>
          <p className="not-flagged-note">
            <strong>Not flagged.</strong> No feature was {tx.method.flagAbsZ} or more from this address's usual pattern.
          </p>
          <NotFlaggedExplanation request={request} tx={tx} />
        </>
      )}
      <p className="muted small">{tx.note}</p>
    </section>
  );
}
