# Accessibility inspection checklist (T40, M-15)

Owner: Cam Dan Bui (`docs/plan/sections/s14-schedule.tex`, T40, Thursday 26 November 2026). Run on the MS2 build, after the walkthrough's second session. Use the same build for every check, and record it at the top of the log.

**Before the manual pass.** Run the automated checks: `cd frontend && npm run e2e:a11y` (axe scans of every view in light and dark, plus the keyboard, reduced-motion, 200% zoom and live-region checks, in Playwright) must pass with no unexpected failure. Record the result, and read `a11y-automated-findings.md` for what it found and what is still open. The manual checks below are what the automated checks cannot see.

**Views.** V1 address selection `#/`; V2 overview `#/address/{address}`; V2 Transactions tab `.../transactions`; V3 day `.../day/{date}` and transaction `.../tx/{txid}`; V4 what-if lab `.../what-if`; V5 models `#/models`; V7 about `#/about`. V6 watchlist `#/watchlist` and the watchlist and live-lookup dialogs are S-04 and S-09 items: check them only if they are in the build.

**Running example:** `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz`. **Outside-snapshot address:** `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`.

Tick each box when the item passes. Write a finding ID (see `findings-template.md`) against each item that fails.

---

## A. Keyboard-only pass, every view

Do this with the mouse unplugged or not touched. Browser: Chrome. Tab moves forward; Shift+Tab moves back; Enter and Space activate; Escape closes a dialog.

- [ ] **Skip link first.** On each view, the first Tab press shows a skip link to the main content. Activating it moves focus to the content. *Where: every view, the shell.*
- [ ] **Shell reachable.** Header product-name link, navigation (Addresses, Models, Watchlist, About), theme switch, service-status control, footer. Every one is reached by Tab in reading order. *Where: every view.*
- [ ] **V1 reachable.** The "Bitcoin address" field, submit, the address table's sort controls, the search box, the filter chips, each table row's link, and the error panel's "Try again" (after a forced error). *Where: `#/`.*
- [ ] **V2 reachable.** Tabs (Overview, Transactions, What-if) are reached and switched with the keyboard; copy button; Export menu opens, its items are reached and it closes with Escape; "Show all" on the day list. *Where: `#/address/{address}`.*
- [ ] **Transactions tab reachable.** Status chips, direction chips, both date fields, sort menu, "Reset filters", every table row opens V3 with Enter. *Where: `.../transactions`.*
- [ ] **Chart G1 keyboard control.** The left and right arrow keys move between days; Enter opens the day. The chart's "View as table" switch is reached. *Where: V2 Overview, `#/address/{address}`.*
- [ ] **V3 reachable.** Day list items, previous and next day, previous and next unusual day, the detail panel's copy button, "View on Blockstream" (it opens in a new tab and says so). *Where: `.../day/{date}`, `.../tx/{txid}`.*
- [ ] **V4 reachable.** Amount field, BTC or satoshi switch, the slider (arrow keys change the value), chips, Received/Sent switch, date and time fields and their chips, "Score it". *Where: `.../what-if`.*
- [ ] **V5 and V7 reachable.** Every card and every link on the models page and the about page. *Where: `#/models`, `#/about`.*
- [ ] **Dialogs and the phone sheet hold focus.** When a dialog or the phone's detail sheet is open, Tab stays inside it; Escape closes it; focus returns to the control that opened it. *Where: V3 on a phone width (sheet); S-04 and S-09 dialogs if built.*
- [ ] **No keyboard trap.** Tab can always leave any control, and focus never disappears to the top of the page. *Where: every view.*

## B. Visible focus

- [ ] **Focus ring on every focusable item.** In each view above, every link, button, field, chip, tab, slider and chart control shows a clear focus ring when it has focus. The ring is visible in light and dark themes. The plan asks for a visible focus ring; the 3:1 contrast figure is the WCAG minimum for non-text contrast, applied here by this checklist. *Where: every view, both themes.*
- [ ] **Ring is not hidden by the layout.** The ring is not clipped by its container, nor covered by a sticky header, when the control is scrolled into view. *Where: V1 table, V2 day list, V3 list, V4 form.*

## C. Screen-reader spot checks (VoiceOver, macOS)

Use Safari with VoiceOver: press Command+F5 to switch VoiceOver on or off. Use the VO keys (Control+Option) with the arrow keys to move. Check at least V1, V2, V3, V4 and V5.

- [ ] **Headings.** Each view's heading is announced as a heading at the right level, and focus moves to the new heading after navigation. *Where: all views.*
- [ ] **Named controls.** Every button and link has a name that says what it does. Icon-only controls (for example the copy button) say "Copy" or the transaction ID, not a blank name. *Where: V2, V3.*
- [ ] **Address field.** The field is announced as "Bitcoin address" with its hint ("Addresses start with 1, 3 or bc1"). *Where: V1.*
- [ ] **Errors read out.** When an invalid address is typed, the message under the field is read out, and the field keeps the text. *Where: V1.*
- [ ] **Status and toasts.** Toasts (for example "Copied") and loading messages are read out politely, without moving focus. *Where: V2, V3, any action that makes a toast.*
- [ ] **Chart summaries.** Each chart has a one-sentence text summary that is read out, and a "View as table" control. *Where: V2 (G1, G2), V3 (G3), V4 (G5).*
- [ ] **Flags read as words.** A flagged day or transaction is read with the word "Unusual" (or "Flag"), not only as a colour or a symbol. *Where: V2 day list, V3 day list and detail.*
- [ ] **Links that open elsewhere.** "View on Blockstream" says that it opens in a new window or tab. *Where: V3 detail.*

## D. Colour contrast, light and dark

Plan: text contrast of at least 4.5 to 1 in both themes. Use the Colour Contrast Analyser or the browser's inspector on the values of the design tokens; check the automated axe result as well.

- [ ] **Body text, light theme.** At least 4.5 to 1 against its background. *Where: V1, V2, V3, V4, V5, V7.*
- [ ] **Body text, dark theme.** At least 4.5 to 1. Choose the theme with the switch and reload. *Where: the same views, dark.*
- [ ] **Large text and headings.** At least 3 to 1 for text of 24 px or larger, or 18.66 px bold (the WCAG large-text size). *Where: V2 tiles, page headings.*
- [ ] **Badges, chips and the footer.** Status badges, filter chips (selected and not), the footer's limitation line, the service-status words. *Where: V2 Transactions, V1 chips, footer on every view.*
- [ ] **Chart colours.** Axis labels, legends and tick labels reach 4.5 to 1 in both themes. The chart colours are checked for colour-blind readers, as the plan requires: run the charts through a colour-vision simulator and confirm each series can still be told apart. *Where: G1 (V2), G2 (Transactions tab), G3 (V3), G5 (V4).*
- [ ] **Focus ring** meets section B in both themes. *Where: every view.*

## E. Not colour alone

Flagged items are marked by colour (orange), by shape (a triangle) and by the word "Unusual". Each must still be recognised without colour.

- [ ] **Take greyscale screenshots** of V2, the Transactions tab, V3 and V4, in both themes, and confirm each flagged item still has its triangle and its word. *Where: V2, Transactions tab, V3, V4.*
- [ ] **Chart markers.** Flagged days on G1 and flagged points on G2 have a shape or a label besides colour, and the chart's legend says what the shape means. *Where: V2 (G1), Transactions tab (G2), V3 (G3).*
- [ ] **Status badges.** Each status badge in the transaction table shows its word ("Unusual", "Not unusual", "Not scored"), not only a colour. *Where: Transactions tab.*
- [ ] **Verdict card and model table.** The verdict card says "Flagged" or "Not flagged" in words; the model table shows "Flag", a dash, or "not available" in words. *Where: V3 model table, V4 verdict card.*
- [ ] **Direction.** Received and sent are told apart by their words (and any arrow or sign), not only by colour. *Where: Transactions tab, V3 detail, V4 switch.*

## F. Touch targets of 44 px

Plan: touch targets are at least 44 px. Check in the browser's device mode at a 390 px width, measuring the element's box in CSS pixels.

- [ ] **Navigation and shell.** The menu button, the theme switch, the service-status control, the header links. *Where: every view, 390 px.*
- [ ] **V1 and V2.** Filter chips, sort controls, tabs, the copy button, day list items, "Show all". *Where: `#/`, V2 at 390 px.*
- [ ] **V3 and V4.** Day list items, previous and next controls, the slider handle and its chips, the Received/Sent switch, "Score it". *Where: V3, V4 at 390 px.*
- [ ] **Charts.** The chart toolbar buttons, the range buttons and the legend items of G1, G2, G3 and G5. The team's known open item is that the Plotly range buttons and legend may be under 44 px (see `docs/HANDOFF.md`, section 8). Record the measured sizes. *Where: V2, Transactions tab, V3, V4 at 390 px.*
- [ ] **Tap on a chart.** On a touch screen, a first tap shows the tooltip and a second tap opens the item (plan). *Where: G2 at 390 px.*

## G. Reduced motion

Turn the setting on: System Settings, Accessibility, Display, Reduce motion. Reload the app.

- [ ] **Panels and dialogs.** The phone's detail sheet, the dialogs and the toasts appear without sliding or easing movement. *Where: V3 at 390 px; any dialog; toasts.*
- [ ] **Charts.** Chart updates (for example after a filter change on V2, or after an amount change on V4) do not animate movement. The zoom is kept. *Where: V2 Transactions tab, V4.*
- [ ] **Loading.** The skeleton rows and the progress indicators show no continuous motion. *Where: V1 while loading, V4 "Updating".*
- [ ] **Setting respected, not just a choice.** With the setting off, the same actions do animate (so that the check is real). *Where: V3 sheet, toasts.*

## H. Zoom to 200 %

- [ ] **Layout holds at 200 %.** In Chrome, set zoom to 200 % (Command and plus) at a 1280 px wide window. The page has no sideways scroll; no text is cut off; no control overlaps another; every control can still be used. Tables and charts may scroll inside their own box. *Where: V1, V2, V3, V4, V5.*
- [ ] **Forms at 200 %.** The what-if form's fields, labels and feedback lines are all visible and not overlapped. *Where: V4.*
- [ ] **Footer and limitation line** are visible at 200 %. *Where: every view.*

## I. Form labels and error messages

- [ ] **Labels are visible.** Every field has a visible label, not only a placeholder: the address field, the amount, the direction, the date and the time fields, the watchlist label and note (if built). *Where: V1, V4.*
- [ ] **Errors are next to their field and say what is wrong.** An invalid address shows its message under the field; the field keeps the typed text and focus. *Where: V1.*
- [ ] **Errors are linked to the field.** A screen reader reads the error when the field is focused (VoiceOver check in section C). *Where: V1, V4.*
- [ ] **What-if feedback is in words.** The rule that fails is named under the amount field; the time message says whether the time is before the first transaction or too far ahead. *Where: V4.*
- [ ] **A rejected what-if keeps the values.** A 422 response shows its message ("At that time this address had 6 earlier transactions...") with its button to set the first date that works, and the typed values stay. A network failure also keeps every value. *Where: V4 (forced in devtools or by stopping the back end).*
- [ ] **Date range.** A "from" date after the "to" date marks both fields and sends no request. *Where: Transactions tab.*
- [ ] **No error relies on colour alone** (the words are present). *Where: V1, V4, Transactions tab.*

---

## Results record

| Section | Checks passed | Checks failed | Finding IDs | Checked by | Date and build |
|---|---|---|---|---|---|
| A. Keyboard | | | | | |
| B. Visible focus | | | | | |
| C. Screen reader (VoiceOver) | | | | | |
| D. Contrast, light and dark | | | | | |
| E. Not colour alone | | | | | |
| F. Touch targets 44 px | | | | | |
| G. Reduced motion | | | | | |
| H. Zoom 200 % | | | | | |
| I. Form labels and errors | | | | | |
| Automated (axe in Vitest) | | | | | |

**Known open items to re-check first** (from `docs/HANDOFF.md`, section 8): the Plotly range buttons and legend under 44 px; scrolling past a chart on a real phone is not yet verified.
