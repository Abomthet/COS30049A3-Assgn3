// The "cartesian" build of Plotly (bar, scatter, WebGL scatter, heat map) ships no type
// declarations of its own. It exposes the same API as the full library, so it borrows the
// declarations from @types/plotly.js.
declare module 'plotly.js-cartesian-dist-min' {
  const Plotly: typeof import('plotly.js');
  export default Plotly;
}
