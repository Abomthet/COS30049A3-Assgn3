// Original inline drawings for the empty watchlist. Colours come from the theme tokens in empty-watchlist.css.
// No text inside; hidden from assistive technology (the words sit beside them as HTML).
import type { Art } from './playSettings';

/** A five-point star centred on (cx, cy) with outer radius r, as an SVG path. */
function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const d = i % 2 === 0 ? r : r * 0.42;
    pts.push(`${(cx + d * Math.cos(a)).toFixed(1)} ${(cy + d * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

const common = { 'aria-hidden': true, focusable: false, xmlns: 'http://www.w3.org/2000/svg' } as const;

/** Art 1: faint address cards stacked behind a large outlined star. */
function Cards() {
  const card = (y: number, inset: number, o: number) => (
    <g opacity={o} key={y}>
      <rect className="ew-card" x={10 + inset} y={y} width={180 - 2 * inset} height={40} rx="10" />
      <circle className="ew-dot" cx={30 + inset} cy={y + 20} r="7" />
      <rect className="ew-bar" x={46 + inset} y={y + 12} width={70 - inset} height="6" rx="3" />
      <rect className="ew-bar" x={46 + inset} y={y + 24} width={44 - inset} height="5" rx="2.5" />
    </g>
  );
  return (
    <svg {...common} className="ew-art" viewBox="0 0 200 150">
      {card(6, 18, 0.45)}
      {card(32, 9, 0.7)}
      {card(58, 0, 1)}
      <path className="ew-star" d={star(100, 100, 36)} />
    </svg>
  );
}

/** Art 2: an empty list of ghost rows with a star above it. */
function Rows() {
  return (
    <svg {...common} className="ew-art" viewBox="0 0 200 150">
      <rect className="ew-card" x="10" y="38" width="180" height="104" rx="12" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          {i > 0 ? <path className="ew-rule" d={`M24 ${50 + i * 32}H176`} /> : null}
          <circle className="ew-dot" cx="32" cy={64 + i * 32} r="8" />
          <rect className="ew-bar" x="50" y={55 + i * 32} width={100 - i * 14} height="7" rx="3.5" />
          <rect className="ew-bar" x="50" y={68 + i * 32} width={60 - i * 8} height="5" rx="2.5" />
        </g>
      ))}
      <path className="ew-star" d={star(100, 30, 27)} />
    </svg>
  );
}

/** Art 3: an empty folder with a star tag standing out of it. */
function Folder() {
  return (
    <svg {...common} className="ew-art" viewBox="0 0 240 180">
      <path className="ew-card ew-back" d="M30 56h56l14 16h110a8 8 0 0 1 8 8v78a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8V64a8 8 0 0 1 8-8z" />
      <g transform="rotate(-9 120 66)">
        <rect className="ew-tag" x="82" y="18" width="76" height="82" rx="10" />
        <path className="ew-star" d={star(120, 56, 27)} />
      </g>
      <path className="ew-card ew-front" d="M22 100a8 8 0 0 1 8-8h180a8 8 0 0 1 8 8v54a8 8 0 0 1-8 8H30a8 8 0 0 1-8-8z" />
      <rect className="ew-bar" x="40" y="118" width="64" height="7" rx="3.5" />
    </svg>
  );
}

/** The drawing for an art option (none for 0). */
export function Illustration({ art }: { art: Art }) {
  if (art === 1) return <Cards />;
  if (art === 2) return <Rows />;
  if (art === 3) return <Folder />;
  return null;
}
