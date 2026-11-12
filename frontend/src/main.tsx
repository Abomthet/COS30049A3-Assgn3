import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/shell.css';

// Switches in the page URL (before the #), for the screenshot script: ?theme=dark or light always,
// and, when the app runs on the mock, ?latency=8000, ?offline=1, ?starting=1 and ?busy=8 (a wait of 8
// seconds) to show the loading, network-failure, starting and busy states, which the real service
// cannot be asked to produce.
const params = new URLSearchParams(window.location.search);
if (params.get('theme') === 'dark' || params.get('theme') === 'light') {
  document.documentElement.dataset.theme = params.get('theme')!;
}
if (import.meta.env.VITE_API_MODE === 'mock') {  // a build-time literal, so production drops this block
  const { mockControls } = await import('./api/mock/mockApi');
  if (params.has('latency')) mockControls.latencyMs = Math.max(0, Number(params.get('latency')) || 0);
  if (params.get('offline') === '1') mockControls.offline = true;
  if (params.get('starting') === '1') mockControls.starting = true;
  if (params.has('busy')) mockControls.busyForSeconds = Math.max(0, Number(params.get('busy')) || 0);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
