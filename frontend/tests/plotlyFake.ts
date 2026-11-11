import { vi } from 'vitest';
import type { PlotlyApi } from '../src/charts/plotlyLoader';

// jsdom cannot run Plotly (no layout, no canvas), so tests replace the loader with this stand-in. It
// records what the wrapper hands to Plotly (the data, the layout, the config), keeps the click
// handler the wrapper registers so a test can fire a click, and can be told to fail to load.

interface Draw {
  el: HTMLElement;
  data: unknown[];
  layout: Record<string, any>;
  config: Record<string, any>;
}

type Handler = (event: unknown) => void;

export const fakePlotly = {
  draws: [] as Draw[],
  handlers: new Map<string, Handler>(),
  failLoad: false,
  failDraw: false,
  api: undefined as unknown as PlotlyApi,

  reset() {
    this.draws = [];
    this.handlers.clear();
    this.failLoad = false;
    this.failDraw = false;
    const handlers = this.handlers;
    const draws = this.draws;
    this.api = {
      react: vi.fn(async (el: HTMLElement, data: unknown[], layout: object, config: object) => {
        if (fakePlotly.failDraw) throw new Error('draw failed');
        draws.push({ el, data, layout, config } as Draw);
        // A drawn Plotly element carries its figure, and an event emitter.
        Object.assign(el, { data, layout, on: (name: string, cb: Handler) => handlers.set(name, cb) });
        return el;
      }),
      purge: vi.fn(),
      downloadImage: vi.fn(async () => 'download'),
      Plots: { resize: vi.fn() },
      Fx: { hover: vi.fn(), unhover: vi.fn() },
    } as unknown as PlotlyApi;
  },

  load(): Promise<PlotlyApi> {
    return this.failLoad ? Promise.reject(new Error('chunk failed to load')) : Promise.resolve(this.api);
  },

  /** Draws onto the chart itself (not the offscreen copy made for a PNG). */
  chartDraws(): Draw[] {
    return this.draws.filter((d) => d.el.classList.contains('pchart-plot'));
  },
  lastChartDraw(): Draw {
    const draws = this.chartDraws();
    return draws[draws.length - 1];
  },
  emit(name: string, event: unknown) {
    this.handlers.get(name)?.(event);
  },
};

fakePlotly.reset();
