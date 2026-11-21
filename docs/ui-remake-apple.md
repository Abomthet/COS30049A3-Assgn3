# Apple-inspired visual remake (branch `ui-remake-apple`)

A proposal for the team, **not merged**. Visual only: the design tokens, the stylesheet and one chart helper changed;
no behaviour, wording, ARIA role or accessible name changed. Study material: `design-ref/apple-2026-11-21/NOTES.md`
(Apple's screenshots are not in the repo). We borrow principles, not Apple's fonts, images or branding.

## What changed, by pattern

1. **Surface, not lines.** Page `#f5f5f7`, cards white, radius 12 to 18 px, card/tile/dialog/state/day-link/transaction-row borders
   removed (hairlines of 8 % ink stay only between table rows and under the header). Dark: page `#000`, cards `#1c1c1e`, raised `#2c2c2e`.
2. **One accent for actions.** `#0071e3`; fully rounded primary buttons; secondary buttons are tinted pills with blue text; small
   utility buttons (Copy, Watch, status, Menu) are grey pills. Inputs keep a 3:1 border. Wording unchanged, so no new "›".
3. **Segmented controls.** Filter chips (status, direction, date ranges, what-if amounts and times), the address tabs and the
   what-if Sent/Received switch sit on a grey track with a raised white (dark theme: lighter grey) selected pill. Roles, names,
   `aria-pressed`/`aria-current` untouched; the selected one is also bolder.
4. **Eyebrow.** The existing "Address · Legacy (P2PKH)" line is a small blue label above the title. The Live data notice keeps its button
   and is a calm tinted card with no coloured stripe.
5. **Type scale.** Body 17 px; page titles `clamp(2rem, ..., 3.25rem)` at weight 700 with -0.03em tracking; summary-tile numbers up to
   1.65rem with 13 px muted labels; address title up to 1.8rem. Font stack stays system (`-apple-system, BlinkMacSystemFont, system-ui, ...`).
6. **Charts (`charts/chartFigure.ts`).** Dotted 1 px grid in a lighter tone, no tick marks, at most about 6 ticks (4 when compact),
   quieter axis ink and modebar icons. One series colour plus the orange flag; triangles and words unchanged.
7. **Dark theme** uses the same surfaces and the same blue (button `#0071e3` with white text; links and chart blue `#2997ff`).
8. **Quiet navigation.** 14 px nav text, 15 px brand, a translucent header (`backdrop-filter: saturate(180%) blur(20px)`, solid
   fallback via `@supports`) with a hairline. From 720 px up it is sticky and the service line scrolls away; on phones it is not sticky.

The orange "Unusual" family and the limitation line are kept.

## Colour tokens and contrast

| Token | Light | on | Ratio | Dark | on | Ratio |
|---|---|---|---|---|---|---|
| `--text` | `#1d1d1f` | white card | 16.8 | `#f5f5f7` | `#1c1c1e` | 15.6 |
| `--text-2` | `#424245` | white | 10.0 | `#d1d1d6` | `#1c1c1e` | 11.2 |
| `--text-muted` | `#6e6e73` | white / page `#f5f5f7` | 5.07 / 4.66 | `#a1a1a6` | `#1c1c1e` / `#2c2c2e` | 6.6 / 5.4 |
| `--link` | `#0066cc` | white / page | 5.57 / 5.11 | `#2997ff` | `#1c1c1e` / `#000` | 5.6 / 7.0 |
| link on `--tint` (secondary button) | `#0066cc` | `#e8f1fc` | 4.88 | `#2997ff` | `#112a45` | 4.83 |
| `--on-accent` on `--accent` | `#fff` | `#0071e3` | 4.70 | `#fff` | `#0071e3` | 4.70 |
| `--on-accent` on hover | `#fff` | `#0066cc` | 5.57 | `#fff` | `#0066cc` | 5.57 |
| accent as UI part | `#0071e3` | white | 4.70 | `#0071e3` | `#1c1c1e` | 3.62 |
| `--series-1` (ordinary marks) | `#0071e3` | white | 4.70 | `#2997ff` | `#1c1c1e` | 5.64 |
| `--series-2` (flag orange) | `#eb6834` | white | 3.20 | `#ff7a45` | `#1c1c1e` | 6.58 |
| `--flag-ink` on `--flag-bg` | `#8f3511` | `#fff3ec` | 7.18 | `#ffbc9c` | `#3a2218` | 9.09 |
| `--info-ink` on `--info-bg` | `#0b4fa6` | `#edf4fc` | 7.06 | `#b0cff5` | `#14263b` | 9.55 |
| `--warn-ink` on `--warn-bg` | `#614600` | `#fbf5e4` | 8.09 | `#f1d488` | `#2f2812` | 10.1 |
| `--error-ink` on `--error-bg` | `#a12c2c` | `#fcefef` | 6.43 | `#ffa3a3` | `#361b1b` | 8.29 |
| `--control-border` (inputs) | `#86868b` | white | 3.62 | `#8e8e93` | `#1c1c1e` | 5.22 |
| selected segment text | `#1d1d1f` | white pill | 16.8 | `#fff` | `#636366` | 5.99 |

Other new tokens: `--page`, `--surface`, `--surface-2`, `--track` (`#ececf0` / `#2c2c2e`), `--hover-bg`, `--header-bg`,
`--header-solid`. Muted text is never set on the segment track (segments use `--text-2`, 8.5 / 9.2).

## Files changed

`frontend/src/styles/base.css` (tokens, then one "Apple-inspired layer" at the end), `frontend/src/styles/shell.css`
(header, switch, nav), `frontend/src/charts/chartFigure.ts` (grid, ticks), this file, the work log and AI-use log.
No back end, no other TSX.

## Comparing

Before and after screenshots (same script, same 58 shots) live outside the repo:
`/private/tmp/claude-501/-Users-tritran2411/5c910deb-8527-4e18-a891-220d7e6a04f4/scratchpad/remake/before` and `.../after`.
Regenerate: start the servers, then `BASE_URL=http://localhost:5297 node frontend/scripts/screenshots.mjs <folder>`.
`docs/screenshots/` was not touched on this branch.

## Hero on the first screen (V1)

The old intro paragraph is replaced by an Apple-style hero in `frontend/src/views/SelectScreen.tsx` (CSS at the end of `base.css`):

- **h1** (still the only one): "See what's unusual in a Bitcoin address.", `clamp(2.25rem, ..., 4.25rem)`, weight 700, tracking -0.035em, centred.
- **Subhead**: "Each transaction is compared with the address's own history, by nine models." The number is E11's `methods.length` (cached request `useMethods`, also used by V4), written as a word up to twelve; until E11 answers, or if it fails, the line says "by several models".
- **Lookup** is the hero's main action: the same form, field ("Bitcoin address"), help text, validation, errors, unsupported and live-lookup panels, now on a large white card (radius 24) with a pill input and a large blue pill "Look up". The "Look up an address" h2 is visually hidden (`sr-only`) and still labels the section.
- **Stats strip**: Addresses (E3 `snapshot.addressCount`), Transactions (sum of E3 `txCount`), Models (E11, omitted without it), Snapshot (E3 `snapshot.snapshotDate`, via `formatCount` / `formatDay`). Calm grey placeholders while E3 loads; the strip disappears if E3 fails. On phones it is a 2x2 grid and the page does not scroll sideways.
- The **limitation line** (from settings, not a copy) shows once in small muted text under the strip; the footer still carries it.

## Two polish fixes

- **Copy and Watch** (V2 title, V3 transaction ID) are grey pills (`--track`, hover `--hover-bg`) with 44 px height, light and dark.
- **V2's "Active" tile** fits its date range on one line at desktop width: from 900 px the four tiles use `0.8fr 1.7fr 1.3fr 1.2fr` columns and the tile's value is a little smaller; on phones it still wraps.

First-screen JS: 148.65 of 150 kB gzip.
