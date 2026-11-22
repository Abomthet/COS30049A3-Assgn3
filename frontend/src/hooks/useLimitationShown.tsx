import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

// The limitation line is shown once per screen. The footer carries it on every screen except while a
// component that shows the line itself (the flag box, the replay's flagged line) is mounted. Each such
// component registers here while it is on the screen, so the footer follows what is really rendered
// and cannot drift the way a list of routes would.

type Registry = { register: () => () => void; shownElsewhere: boolean };

const NO_REGISTRY: Registry = { register: () => () => undefined, shownElsewhere: false };
const LimitationContext = createContext<Registry>(NO_REGISTRY);

/** Provided by the shell. `useLimitationElsewhere` tells the footer whether another copy of the line is on the screen. */
export function LimitationProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  // `register` keeps its identity, so a component's effect is not run again each time the count changes.
  const register = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);
  const value = useMemo<Registry>(() => ({ register, shownElsewhere: count > 0 }), [register, count]);
  return <LimitationContext.Provider value={value}>{children}</LimitationContext.Provider>;
}

/** A component that shows the limitation line calls this while it does (`active`, true by default). The footer then leaves its copy out. */
export function useLimitationShown(active = true): void {
  const { register } = useContext(LimitationContext);
  // A layout effect, so the footer's copy is gone in the same paint as the flag box appears (never two copies on screen).
  useLayoutEffect(() => (active ? register() : undefined), [active, register]);
}

/** True while some component other than the footer shows the limitation line. */
export function useLimitationElsewhere(): boolean {
  return useContext(LimitationContext).shownElsewhere;
}
