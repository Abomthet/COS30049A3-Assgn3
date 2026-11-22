import type { Reason } from '../api/types';

// How a reason (E7 and E8 `reasons`, Mod-20) reads on screen. The figures are the service's own texts and are shown as they are.
// F4 is a ratio to the address's usual size, so it reads "0.4× its usual size" and has no "usual" figure of its own.

/** The words that follow a reason's value on its big line or its short line. */
export const F4_UNIT = 'its usual size';

/** What follows the value of a reason's short line: "(usual 0.00291708 BTC)", or "its usual size" for F4. */
export function reasonTail(r: Reason): string {
  return r.feature === 'F4' ? F4_UNIT : `(usual ${r.usualText})`;
}

/** One reason as one line: "Smaller amount than usual: 0.00111260 BTC (usual 0.00291708 BTC)", "Small for a received amount: 0.4× its usual size". */
export function reasonLine(r: Reason): string {
  return `${r.label}: ${r.valueText} ${reasonTail(r)}`;
}
