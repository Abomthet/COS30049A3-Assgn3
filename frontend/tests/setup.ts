import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { mockControls } from '../src/api/mock/mockApi';
import { clearRequestCache } from '../src/hooks/useRequest';
import { fakePlotly } from './plotlyFake';

// Plotly cannot run in jsdom; every test gets the stand-in (see plotlyFake.ts).
vi.mock('../src/charts/plotlyLoader', () => ({ loadPlotly: () => fakePlotly.load() }));

// jsdom has no layout engine; the charts only need ResizeObserver to exist.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
window.scrollTo = () => {};
// jsdom has no matchMedia; the theme switch asks whether the system prefers dark.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {},
  removeEventListener() {},
})) as unknown as typeof window.matchMedia;

beforeEach(() => {
  mockControls.latencyMs = 0;
  mockControls.offline = false;
  mockControls.starting = false;
  clearRequestCache();
  fakePlotly.reset();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
  // Spies on browser APIs (layout size, matchMedia) never leak into the next test.
  vi.restoreAllMocks();
});
