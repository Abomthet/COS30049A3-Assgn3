import type { Route } from '../lib/router';
import { paths } from '../lib/router';

// The four sections of the application (plan section 8, "The shell around every view"). Each
// section owns the routes listed, so a day or a transaction keeps "Addresses" marked as current.
const SECTIONS: Array<{ label: string; href: string; screens: Route['screen'][] }> = [
  { label: 'Addresses', href: paths.select(), screens: ['select', 'timeline', 'day'] },
  { label: 'Models', href: paths.models(), screens: ['models'] },
  { label: 'Watchlist', href: paths.watchlist(), screens: ['watchlist'] },
  { label: 'About', href: paths.about(), screens: ['about'] },
];

export function MainNav({ route, id, open }: { route: Route; id: string; open: boolean }) {
  return (
    <nav id={id} className={`main-nav${open ? ' is-open' : ''}`} aria-label="Main">
      <ul>
        {SECTIONS.map((s) => (
          <li key={s.label}>
            <a href={s.href} aria-current={s.screens.includes(route.screen) ? 'page' : undefined}>
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
