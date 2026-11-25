// Dev-only background playground. Mounted from main.tsx under import.meta.env.DEV; delete with bg-playground.css.
import { useEffect, useState } from 'react';
import '../styles/bg-playground.css';

const OPTIONS = ['', '2', '5', '7', '9', '10', '12'];

function readQuery(): string {
  const v = new URLSearchParams(window.location.search).get('bg') ?? '';
  return OPTIONS.includes(v) ? v : '';
}

export function BgPlayground() {
  const [bg, setBg] = useState(readQuery);

  useEffect(() => {
    const root = document.documentElement;
    if (bg) root.dataset.bg = bg;
    else delete root.dataset.bg;
    const url = new URL(window.location.href);
    if (bg) url.searchParams.set('bg', bg);
    else url.searchParams.delete('bg');
    window.history.replaceState(window.history.state, '', url);
  }, [bg]);

  return (
    <label
      style={{
        position: 'fixed', right: 12, bottom: 12, zIndex: 2147483000, display: 'flex', gap: 6, alignItems: 'center',
        padding: '6px 10px', font: '13px system-ui, sans-serif', color: 'var(--text)', background: 'var(--surface)',
        border: '1px solid var(--border-strong)', borderRadius: 10,
      }}
    >
      Background
      <select value={bg} onChange={(e) => setBg(e.target.value)}>
        {OPTIONS.map((o) => (
          <option key={o} value={o}>{o || 'None'}</option>
        ))}
      </select>
    </label>
  );
}

export default BgPlayground;
