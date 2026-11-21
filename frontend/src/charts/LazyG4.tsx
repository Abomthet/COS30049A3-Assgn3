import { Suspense, lazy, type ComponentProps } from 'react';
import { Loading } from '../components/StatePanel';

// G4 is fetched when a transaction is opened (V3, V4), not with the first screen.
const G4ModelVerdicts = lazy(() => import('./G4ModelVerdicts').then((m) => ({ default: m.G4ModelVerdicts })));

/** Chart G4 loaded on first use, with a loading state while its code arrives; used in the transaction panel and the what-if lab. */
export function LazyG4(props: ComponentProps<typeof G4ModelVerdicts>) {
  return (
    <Suspense fallback={<Loading label="Loading the chart…" block />}>
      <G4ModelVerdicts {...props} />
    </Suspense>
  );
}
