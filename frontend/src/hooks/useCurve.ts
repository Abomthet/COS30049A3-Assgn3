import { api } from '../api/client';
import type { WhatIfCurve, WhatIfDirection } from '../api/types';
import { useRequest, type RequestState } from './useRequest';

/** The decade the curve is drawn around when the address has no usual amount to centre it on and no amount is typed (0.001 BTC). */
const DEFAULT_DECADE = -3;

export type CurveState = RequestState<WhatIfCurve> & {
  retry: () => void;
  previous: WhatIfCurve | undefined;
  /** True when the address has no earlier transaction in this direction, so the curve is drawn around the typed amount instead of the usual one. */
  aroundTypedAmount: boolean;
};

/**
 * E9 for the direction and time in the form. The server centres its default curve on the address's
 * usual amount in that direction; where there is none (400, naming `direction`) the curve is asked
 * again for a range of two decades below to three above the typed amount's power of ten. The range
 * moves only when that power of ten does, so typing digits within a decade does not redraw the curve.
 */
export function useCurve(address: string, direction: WhatIfDirection, time: string | null, typedBtc: number | null): CurveState {
  const base = time ? `curve:${address}:${direction}:${time}` : null;
  const centred = useRequest(base, (signal) => api.whatIfCurve(address, { direction, time: time! }, { signal }));
  const noUsualAmount =
    centred.status === 'error' && centred.error.body.status === 'invalid' && (centred.error.body.fields ?? []).some((f) => f.name === 'direction');

  const decade = typedBtc === null ? DEFAULT_DECADE : Math.round(Math.log10(typedBtc));
  const ranged = useRequest(noUsualAmount ? `${base}:${decade}` : null, (signal) =>
    // Parsed from text so the bounds are the exact doubles the literals 1e-5 and 1e0 name.
    api.whatIfCurve(address, { direction, time: time!, minBtc: Number(`1e${decade - 2}`), maxBtc: Number(`1e${decade + 3}`), points: 41 }, { signal }),
  );
  return noUsualAmount ? { ...ranged, aroundTypedAmount: true } : { ...centred, aroundTypedAmount: false };
}
