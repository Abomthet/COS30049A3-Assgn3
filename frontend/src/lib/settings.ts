// Every threshold lives in backend/config/settings.json, the one settings file shared with the
// Python pipeline and the web tier. The front end bundles it so it still has sensible values
// when the service is unreachable; while the service is up, E2 (/api/config) is what the shell reads.
import raw from '../../../backend/config/settings.json';
import type { AppSettings, WebSettings } from '../api/types';

export const settings = raw;

export const LIMITATION_LINE: string = raw.limitationLine;

export type FeatureId = 'F1' | 'F2' | 'F3' | 'F4';
export const FEATURE_IDS: FeatureId[] = ['F1', 'F2', 'F3', 'F4'];

/** The `web` block: limits, time limits and polling interval the web tier shares with the service (E2 passes it on). */
export const WEB: WebSettings = raw.web;

/** What the shell uses until E2 answers, and whenever the service cannot be reached. */
export const BUNDLED_SETTINGS: AppSettings = {
  limitationLine: raw.limitationLine,
  history: { minTx: raw.features.minHistoryTx, minSpanDays: raw.features.minHistorySpanDays },
  thresholds: { flagAbsZ: raw.baseline.flagAbsZ, contributingAbsZ: raw.baseline.contributingAbsZ },
  web: WEB,
  capabilities: { assistant: false, liveLookup: false },
  snapshot: null,
};
