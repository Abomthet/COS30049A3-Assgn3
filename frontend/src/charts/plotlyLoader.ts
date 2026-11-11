// Plotly is the largest dependency by far, so it is fetched only when the first chart mounts
// (plan section 9, "Performance"): the dynamic import below becomes its own file in the build,
// and the first screen never waits for it.
//
// The "cartesian" build is the smallest published one that has every trace type the charts
// need: bar (G1, G3, G6), scatter (G2, G5), scattergl (G2 and G9 above webglMinPoints) and
// heatmap (G7, G8).

/** The parts of Plotly the charts use. `Fx` is missing from @types/plotly.js, so it is added here. */
export type PlotlyApi = typeof import('plotly.js') & {
  Fx: {
    hover(root: HTMLElement, points: Array<{ curveNumber: number; pointNumber: number }>): void;
    unhover(root: HTMLElement): void;
  };
};

let pending: Promise<PlotlyApi> | null = null;

/** Loads Plotly once. A failed load is forgotten, so "Try again" fetches it afresh. */
export function loadPlotly(): Promise<PlotlyApi> {
  pending ??= import('plotly.js-cartesian-dist-min').then(
    (module) => module.default as PlotlyApi,
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}
