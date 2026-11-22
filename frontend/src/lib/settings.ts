// The limits that do not depend on the service live in backend/config/settings.json, the one
// settings file shared with the Python pipeline and the web tier. The front end bundles it so the
// history rule and the time limits are still known when the service is
// unreachable; while it is up, E2 (/api/config) is what the shell reads.
//
// The flag threshold is deliberately not bundled (decision D-W-10): the file's `baseline.flagAbsZ`
// is Assignment 1's untuned default. The line the Explorer applies is the tuned threshold saved with
// Assignment 2's model, which only the service reports (E2 `thresholds`, or a response's `method`).
import raw from '../../../backend/config/settings.json';
import wording from '../../../shared/wording.json';
import type { AppSettings, WebSettings } from '../api/types';

// The limitation line is the web application's own (Mod-19), kept in shared/wording.json, which the service reads too.
// Assignment 2's line in settings.json is replaced here, so no screen or test can pick it up by mistake.
export const settings = { ...raw, limitationLine: wording.limitationLine };

export const LIMITATION_LINE: string = wording.limitationLine;

export type FeatureId = 'F1' | 'F2' | 'F3' | 'F4';

/** The `web` block: limits, time limits and polling interval the web tier shares with the service (E2 passes it on). */
export const WEB: WebSettings = raw.web;

/** What the shell uses until E2 answers, and whenever the service cannot be reached. */
export const BUNDLED_SETTINGS: AppSettings = {
  limitationLine: LIMITATION_LINE,
  history: { minTx: raw.features.minHistoryTx, minSpanDays: raw.features.minHistorySpanDays },
  web: WEB,
  capabilities: { assistant: false, liveLookup: false },
  snapshot: null,
  features: [],
  thresholds: null,
  whatIf: null,
};
