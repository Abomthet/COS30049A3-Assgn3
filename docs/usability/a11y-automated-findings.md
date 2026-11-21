# Automated accessibility findings (T40, automatable part)

Found by `cd frontend && npm run e2e:a11y` (`frontend/e2e/a11y.spec.ts`): axe-core 4.x through `@axe-core/playwright` 4.14.0, WCAG 2.0 and 2.1 levels A and AA (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`), on the real back end, Chromium at 390, 820 and 1280 px, light and dark theme. Build: `main` at `e41c930` plus the `a11y-checks` branch, run on 21 Nov 2026. Format of the table: `findings-template.md`; severity: Nielsen 0 to 4 as in `observation-sheet.md`. Severities are the checks' proposal; the lead or the team rates them for real. **Fix** is empty and **Retest** is "not yet": no app code was changed.

Policy: a scan fails on any violation of impact `serious` or `critical`. Both findings below are serious, so the scans that show them are marked `test.fail()` in the spec (the `KNOWN` table, with the finding ID). The suite is green now and turns red ("expected to fail, but passed") when a fix lands; the cue is then to delete the `KNOWN` entry and fill in the Fix and Retest columns. Both findings appear identically in light and dark and at all three widths.

## 1. Issue log

| ID | Task | Severity (0 to 4) | Description (what happened; view and route) | Evidence (test; screenshot) | Fix | Retest result |
|---|---|---|---|---|---|---|
| A-01 | A | 2 (proposed) | `label-content-name-mismatch`, impact serious (WCAG 2.5.3 Label in Name, level A). The address links show a shortened address (`36V7afbhZnvp…2vtHDB6L`) but their accessible name is `Open activity for <full address>`, which does not contain the visible text, so a voice-control user who says what they see ("click 36V7afbhZnvp") gets nothing. Elements: `th[data-label="Address"] .address-link.mono` (28 links) on V1 `#/` (also with the typo error, with the unsupported-address panel, and under the open watch dialog, which sits over V1), and `.watch-address` links on V6 `#/watchlist`. Light and dark, 390, 820, 1280. Rating: screen-reader and keyboard users are served (the name is longer, not wrong); only speech-control users are blocked, and a workaround exists (say "click Open activity"). | `axe: V1 list`, `axe: V1 typo error`, `axe: V1 unsupported address`, `axe: watch dialog open`, `axe: V6 watchlist` (each light and dark), in `a11y.spec.ts` | | not yet |
| A-02 | A | 2 (proposed; 3 if a table really overflows) | `scrollable-region-focusable`, impact serious (WCAG 2.1.1 Keyboard, level A). The `div.table-scroll` that wraps a table can scroll sideways but has no keyboard stop and no focusable content in it, so a keyboard user cannot scroll it. Views: V2 overview (`.table-scroll`), V2 Transactions tab, V3 flagged transaction (`#…-table > .table-scroll`, the chart's table), V4 empty (the curve chart's table) and V4 with a kept scenario (2 elements), V5 `#/models`, the short-history notice, and V2 with the Export menu open. Light and dark, 390, 820, 1280. Rating 2 because the wrapper only matters when the table is wider than its box (on a phone the tables turn into cards); if the lead finds a table that overflows at 820 px, raise to 3. | `axe: V2 overview`, `axe: V2 transactions tab`, `axe: V3 flagged transaction`, `axe: V4 what-if empty`, `axe: V4 what-if flagged, one kept scenario`, `axe: V5 models`, `axe: short-history notice`, `axe: export menu open` (each light and dark) | | not yet |

| A-03 | A | 1 (proposed) | `color-contrast`, impact serious, seen in the first run only: while the V4 lab's curve chart was still loading, its "Loading the chart…" line (`.loading > span:nth-child(2)`) failed the contrast check in all six scans of the empty lab (light and dark, 390, 820, 1280). Once the chart is drawn the line is gone and the page shows A-02 instead; a settled page with the line present was not reproduced, so the cause (a half-faded line, or the line's real colour) is not established. Rating 1: the line shows for about a second. The scans now wait for the chart (`drawnChart`), so this is **not covered by a test**; the lead may want to look at `.loading` (`color: var(--text-2)` in `base.css`) in a still-loading state. | first run of `axe: V4 what-if empty`, before the scan waited for the chart | | not yet |

No other axe rule fired in any scan. Clean (no violation of any impact) on: V3 day, V7 about, and a chart shown "as a table", in both themes. Plotly's own SVG produced no violation, so no exclusion is used anywhere.

A finding rated 3 or 4 must be fixed and retested before MS4 (the checklist's rule); on these proposed ratings neither does, but A-02's fix is one attribute (`tabIndex={0}` with a name on the wrapper) and A-01's is one label.

## 2. Moderate and minor axe results

None. Every scan was run with the four WCAG tags only, and the only violations were the two serious ones above. Axe's separate "best practice" rules (`best-practice` tag, for example landmark and heading-order advice) were not run; the plan asks for WCAG, and adding the tag is a one-line change in `TAGS` if the team wants them.

## 3. Other automated checks (all pass)

- **Keyboard:** the first Tab on V1, V2 and V7 focuses a visible "Skip to content" link, and Enter moves focus into `main`; Tab on V1 reaches the address field, "Look up" and the first table row link in that order; focus is visible (outline or box-shadow, including the `::after` ring of the stretched address links) on a link, a button, a field and a tab, each reached by Tab; the watch dialog keeps Tab and Shift+Tab inside it (8 presses each way), Escape closes it and focus returns to its star; G1 (`role="group"`, focusable) shows the tooltip of a day, the left and right arrows change it and Enter opens that day; the What-if amount error has `role="alert"`, the field has `aria-invalid="true"` and `aria-describedby` names the error.
- **Reduced motion** (`reducedMotion: 'reduce'`): the theme switch's `transition-duration` is 0s, a toast has `animation-name: none`, and the replay offers no Play button and says why.
- **200% zoom** (640 px viewport at device scale 2): V2, V3 transaction and V4 do not scroll sideways.
- **Live region:** the Notifications region is `aria-live="polite"` and is on the page before the first toast; a toast made by a real watchlist add appears inside it.

## 4. What the automated checks cannot see

Everything in `accessibility-checklist.md` that needs a person or a device:
- **Screen reader (section C):** whether headings, names, the address-field hint, errors, toasts, chart summaries, flags ("Unusual") and "opens in a new tab" are read out sensibly, in VoiceOver and, if possible, NVDA. Axe checks that a name exists, not that it is good.
- **Keyboard pass by a person (section A):** the order feels right, nothing is a trap on a view the tests do not visit (Transactions filters, sort menu, V3 sheet on a phone, V4 slider), and the ring is not hidden by the sticky header (section B).
- **Colour (section D):** axe's contrast check cannot measure text over a chart, text in an image, or Plotly's drawn colours well; colour-blind readability of the chart palette needs a simulator. Focus-ring contrast (3 to 1) is not tested.
- **Not colour alone (section E)** and wording: needs reading.
- **Real devices:** phone screen readers (TalkBack, VoiceOver on iOS), real touch target use, real browser zoom and text-size settings (the 200% check is an emulation), Firefox and Safari behaviour of the keyboard checks (these ran in Chromium).
- **Content in states the real service cannot produce:** loading, timeout and busy states exist only with the mock; they were not scanned.
