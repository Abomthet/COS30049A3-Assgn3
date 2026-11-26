# Apple-inspired visual remake (branch `ui-remake-apple`)

Approved by the team and **merged into `main` on 26 Nov 2026** (fast-forward to `2cb03d6`). The first pass (21 Nov) was visual only: the design tokens, the stylesheet and one chart
helper changed; no behaviour, wording, ARIA role or accessible name changed. The second pass (22 Nov) is a wording pass from the
owner's feedback: see "Wording pass" and "CR-09" at the end. Study material: `design-ref/apple-2026-11-21/NOTES.md`
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
- The **limitation line** (from settings, not a copy) shows once in small muted text under the strip; the footer no longer carries it (26 Nov).

## Two polish fixes

- **Copy and Watch** (V2 title, V3 transaction ID) are grey pills (`--track`, hover `--hover-bg`) with 44 px height, light and dark.
- **V2's "Active" tile** fits its date range on one line at desktop width: from 900 px the four tiles use `0.8fr 1.7fr 1.3fr 1.2fr` columns and the tile's value is a little smaller; on phones it still wraps.

First-screen JS: 148.65 of 150 kB gzip.

## Wording pass (22 Nov 2026)

The owner tested this branch and asked for less explaining text: facts said once, the key number first, no internal words
on screen. A 133-row wording list (current text, proposed text, where) was approved by the owner before anything changed;
it and a study of how Apple shows extra information (footnotes, disclaimers, "learn more") are kept outside the repository.
Each change is its own commit, so the wording can be copied onto `main` if the remake itself is dropped (`main` was merged
into this branch first). In short:

- **Limitation line** "Flagged as unusual for this address, not proof of wrongdoing." (Mod-19, `shared/wording.json` for both tiers), only
  where a flag shows (the flag box, tinted orange with the flag icon, and the replay's flagged line; the footer has the course credit alone); in every CSV row, chart downloads included.
- **Why it stands out**: the strongest reason as a big figure ("0.4× its usual size"), one short line per other reason,
  "Compared with its last 10 received"; reasons come from the API as data (Mod-20); short model names (Mod-21).
- **Charts**: title, one-line subtitle, a source footnote under each chart (the chart contract keeps source and date on every
  chart), a closed "How to read this chart", plain axis words; G5 leads with "Flagged from 0.023 BTC".
- **Screens**: one format hint on V1; "3 days" as the headline of the days list; one-line live banner; the replay's
  look-ahead note folded away; "95× usual" and the score against its flag line in the what-if lab; plain error messages
  with no setup words on screen (both tiers, shared vectors); Models and Watchlist in short lines; About reordered to start
  with what the Explorer does, with "What unusual means" as status tiles, the flag level and the four measures.

## CR-09 (raised 22 Nov 2026; approved 26 Nov with the remake)

| Field | Entry |
|---|---|
| ID | CR-09 |
| Requestor | Cao Tri Tran (Data/ML Lead), from the usability feedback of 22 Nov |
| Proposal | (1) The limitation line becomes "Flagged as unusual for this address, not proof of wrongdoing." on screens and in exports (A2's settings stay untouched; the web layer replaces the line, Mod-19). (2) It is shown once per screen: on the flagged item when one is on the screen, otherwise in the footer (plan s08 says "in the footer" and "on every flagged item"; the footer leaves out its copy while a flagged item shows it). (3) Chart CSV downloads carry it on every row too ("in every export"). |
| Reason | The owner's walkthrough found the line long and repeated up to four times on one screen; the shorter line keeps both halves (worth a look; not wrongdoing), so a flag still reads as "needs investigation" (NFR-01 condition 4). |
| Impact on scope | None: wording and placement only; every flagged item and every export row still carries the line. |
| Impact on quality | Tests on both tiers check the new line on every flag, in the flag box, and on every CSV row (`backend/tests/test_limitation_line.py`, `frontend/tests/limitationLine.test.tsx`). |
| Decision | Approved 26 Nov 2026 with the remake (the team kept `ui-remake-apple`; merged into `main`). |
| Changed artefacts | `backend/MODIFICATIONS.md` (Mod-19); the plan's quoted line (s08 "Always show", b-json examples) to be updated if approved |


## Polish, logo and coin backdrop (25–26 Nov 2026)

**Hover rules, as they now stand.** Hovers lift or tint. A coloured ring marks only a flagged item or a field with an error.

- **Cards** (`46a2652`): a faint blue tint and a deeper shadow; no ring.
- **Lookup box** (`255f4b5`, `d10180b`, `6caa64e`): lifts 4 px with the same tint and shadow; no ring on hover or while typing. The field shows the blue edge.
- **Fields** (`03d63c8`): a clean 2 px blue edge while typing, not a 3 px outline. **Errors** (`5658568`): one red edge while focused (2 px thickening to 3 px).
- **Segmented controls** (tabs, filter chips, chart period chips; `054622b`): grey on hover, no ring.
- **Flagged items** (`633ea0a`): an orange ring on hover and focus, and a redder fill. The flagged row fill is based on the flag tint (88 %) (`4f34fca`), which keeps the dark-theme txid at 4.66:1, up from 3.48:1.
- **Table rows** (`ce496eb`): a 12 % blue tint on hover (was 7 %); the light-theme grey text is darker (`#58585d`) so it keeps 6:1 on the tint.
- **Chart cards** take no hover at all (`b145ebf`, so the charts stay readable); their own controls keep their hover.
- **Table boxes** (snapshot table, transactions table) take no hover of their own (`cb63589`); the rows keep theirs.

**Snapshot pager** (`0ff24d0`). The snapshot table shows 10 addresses a page, with a pager under it. When the page changes, focus moves to the table heading. Tests are in `frontend/tests/snapshotPages.test.tsx` (new) and the existing tests were updated.

**Logo and favicon removed** (`324eb4c`). The header logo mark and the tab icon are gone (the user's call).

**Coin backdrop, option 14b** (`5692d2c`). A fixed neon-coin backdrop on the home screen only.

- **Where:** `frontend/src/styles/backdrop.css` (imported in `frontend/src/main.tsx`); the photo is `frontend/src/assets/bg-coins-neon.jpg`. It applies only while the hero is on the page (`:has(.hero)`). The dev-only playground and the other variants were deleted in the same commit.
- **How it behaves:** two fixed layers at `z-index: -1`, a right cluster and a left accent with a soft radial fade. Both float out of phase (about 10 px and 1.5°, over 7 s and 8.5 s), with scroll-linked drift where `animation-timeline: scroll()` is supported. Both are overscanned so the rotation never shows an edge. On phones (600 px and under) the left accent is hidden and the whole backdrop is fainter. It is hidden under forced colours and in print.
- **Accessibility:**
  - Under reduced motion the coins stay still: no float, no drift.
  - **No pause control.** The user decided not to add one, so the float does not meet WCAG 2.2.2 (Pause, Stop, Hide), which applies to automatic motion that lasts more than five seconds. A pause toggle is small to add later; it would stop both float animations and the scroll drift.
  - Hero text contrast stays at or above 4.5:1 in both themes at 1280 and 390 px (worst case: the stat label, 5.97 dark and 4.94 light at 390 px).
- **Photo credit:** Pexels, https://www.pexels.com/photo/bitcoins-on-black-surface-7267491/, under the Pexels licence (https://www.pexels.com/license/). A resized and recompressed copy. Also in `frontend/src/assets/PHOTO_CREDITS.md`.

## Navigation menus and sticky header (26 Nov 2026)

**What.** Each of the four tabs (Addresses, Models, Watchlist, About) opens a full-width flyout under the header. The page behind it dims and blurs. The surface stays in place when moving between tabs; only its height changes. Items rise in with a short stagger, and none move under reduced motion.

**Why.** The first version put small boxes under each tab. The owner found the look and the content weak: the boxes jumped sideways and covered the headline, every row looked the same, and the content repeated the page. The flyout gives each tab a short list of places to go next.

**Content.**
- Addresses: look up an address, browse all addresses, the three most flagged, and recently opened.
- Models: compare the nine models, test-pattern results, what a flag means, and a link to each model's card (`?section=model-<id>`).
- Watchlist: open the watchlist, then each watched address with its flag count.
- About: the three most important lines, then "See more" for the other four.

**Link cues.** At rest nothing in the flyout looked clickable, so large links get a chevron that slides on hover, addresses use link blue, and small rows get a soft tint and a chevron on hover. Hover text uses `--link` (about 5.7:1 on dark, 5.6:1 on light).

**Section links.** The hash routes accept `?section=` (for example `#/about?section=limits`). The page scrolls to the named section and moves focus to it once it exists. The valid names are in `PAGE_SECTIONS` in `lib/router.ts`.

**Sticky header.** On wide screens the header had been set to `top: -45px`, meant to let the service line scroll away. The service line sits below the nav row, so the nav row scrolled off instead. The owner chose to keep the whole header sticky. `--header-h` (98 px on wide screens, 0 on phones) gives the section scroll margins, the day page's transaction list, the what-if form and the transactions table room under the header.

**Open.** The offline banner is also sticky at the top and may overlap the header on wide screens. Not tested yet.

**Status.** On `ui-remake-apple` only; nothing is on `main`. Each change was checked from screenshots and on the live dev server before it was committed. The team vote on the remake is Fri 27 Nov.
