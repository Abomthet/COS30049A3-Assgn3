// Picks the data source. The default is the FastAPI back end through the same origin (Vite
// proxies /api). VITE_API_MODE=mock runs the screens on the in-browser mock instead, which is also
// what the tests use; VITE_API_BASE points the client straight at a back end on another address.

import { createHttpApi } from './endpoints';
import { createHttpClient } from './http';
import type { ExplorerApi } from './types';

export const API_MODE: 'mock' | 'http' = import.meta.env.VITE_API_MODE === 'mock' ? 'mock' : 'http';

// The condition is written on import.meta.env itself, which Vite replaces with a literal at build
// time, so a production build folds it to false and drops the mock and its recorded fixtures.
export const api: ExplorerApi =
  import.meta.env.VITE_API_MODE === 'mock'
    ? (await import('./mock/mockApi')).mockApi
    : createHttpApi(createHttpClient({ baseUrl: import.meta.env.VITE_API_BASE ?? '' }));
