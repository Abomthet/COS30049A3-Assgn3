# Plan after MS2 — the Should tier, to MS3 (feature freeze, Fri 27 Nov)

Written 12 Nov 2026 by the lead (Claude Opus 5.5) right after MS2 passed, following the user's rule that
replanning is written up in detail and done on Opus 5.5 or Fable 5.2. Read it with `docs/HANDOFF.md`.
The plan's own specification is in `docs/plan/sections/` (references below); where this file and the
plan disagree, the plan wins.

## 1. Where we stand and what limits us

- **Calendar:** MS2 passed on 12 Nov, ten days early. MS3 (feature freeze) is Fri 27 Nov, which leaves
  15 days. Every Should item fits in that time.
- **The real limit is usage, not days.** A high-effort Sonnet package costs about 250–380k tokens, and
  two 5-hour windows have already run out (11 and 12 Nov); the user's monthly spend limit was also
  reached. Hence: **at most two packages at once**, the cheapest model that can do each one well (D-W-14),
  and each wave ordered so the most valuable items are finished first.
- **Rules that do not change:** no Should item may break a Must item (re-run `tools/ms_gate_check.py`
  and the screenshots after each wave); an item not finished *and tested* by MS3 is **cut, not
  carried**, and the cut is recorded in `docs/WORKLOG.md` and the change log (plan §4.6).

## 2. The Should items, what each needs, and what already exists

| ID | Item | Plan reference | Already in place | Still to build | Tier(s) |
|---|---|---|---|---|---|
| S-01 | Method selector: view the flags of any of the nine methods | s07 §methods; s10 R5 (under 0.5 s) | **The back end accepts `?method=` on E3, E5, E6, E7, E10** (and caches per method) | A method menu (V2 header), carried in the URL and remembered in preferences; tiles, G1/G2 colours and lists follow it; the deciding-method label everywhere | front |
| S-02 | G4: each model's score against its own threshold for one transaction (dot plot, ranks) | s09 G4 | E7/E8 carry `scores` and `flags` for the nine methods; E11 has each threshold | **Ranks** (where this transaction sits among the address's own scored transactions, per method) need the back end: add `ranks` (percentile per method) to E7, and to E8 against the history; then the chart | back + front |
| S-03 | G6: each method's recall on planted test transactions, with intervals (grouped bar), on V5 | s09 G6; s08 V5 | E11 has `evaluation.recallByPattern.{spike,burst,dormant}` with `{value, ciLow, ciHigh}` | The chart, through the wrapper | front |
| S-04 | Watchlist with label and note (E13–E15), recent addresses, remembered preferences | s06 E13–E15; s08 V6; D-A3-8 (SQLite) | `web.watchlist` limits in settings (200 entries, label 40, note 500); `backend/var/` git-ignored | SQLite repository (`services/watchlist_repo.py`, file under `backend/var/`), E13 GET, E14 PUT (201 new / 200 replaced / 404 unsupported / 409 full), E15 DELETE (204 / 404); V6 page; a star on V1/V2 that opens a dialog with character counts; remove with Undo toast; recent addresses | back + front |
| S-05 | Explorer Assistant explanations (E12): guarded, cached, optional weights, prepared answers | s07 §assistant; s06 E12; s10 R7; D-A3-9 | **The weights are on disk and verified** (`backend/models/assistant/`, D-W-07); A2's guardrail `explorer.assistant.check` (six checks) is A2 code; `web.requests.assistantTimeoutMs` = 90 s; `EXPLORER_ASSISTANT` defaults to `off` (D-W-09) | **Torch is not in `cos30049-a3`**: add `backend/requirements-assistant.txt` (A2's torch version, CPU), installable on top; `services/assistant_service.py` (lazy load, one answer at a time, 429 while busy, SHA-256 cache of the facts, greedy decoding); E12; `tools/precompute_assistant.py` writing guarded answers for the snapshot's flagged transactions (baseline) to a JSON shipped in the zip; the front-end panel (template first, "Ask the Assistant to write this", progress line, "Keep the template" cancels, the source label, failed checks named); restore `EXPLORER_ASSISTANT=auto` | back + front |
| S-06 | Replay: an address's history played forward, the charts updating | s10 R6 and "the replay is honest" | G1, G2 and the tiles; all rows are loaded for G2 already | A timer over loaded rows at 1, 5 or 20 transactions a second; pause, step, restart; labelled "Replay of recorded history", never "live"; reduced motion respected | front |
| S-07 | Linked selection: points selected in the scatter filter the table and show a summary | s09 | G2 and the table share the URL filter state | Box/lasso selection in G2 → a selection set (not a URL filter) → the table shows only those rows plus a summary line; clear selection | front |
| S-08 | Scenario table in the what-if lab: keep, compare, export | s08 V4 | V4, E8 | Keep the current what-if as a row; compare rows; export as CSV (client-side, with the limitation line); kept in preferences | front |
| S-09 | Live lookup of any address (E16–E20) | s07 §live; s06 E16–E20 | `AddressStore` protocol is ready for a live store | **Blocked: needs CR-08 approved by all four members by Sun 22 Nov.** If not approved, it is never started (and that is recorded) | back + front |
| S-10 | TS types generated from OpenAPI; tests and builds on every push | s12 §tests | `backend/openapi.json` kept current by a test | A generator script (`openapi-typescript`, pinned) producing `frontend/src/api/generated.ts`, and a test that `types.ts` matches it (or `types.ts` re-exports it); a GitHub Actions workflow running both suites on push (private repo; check minutes) | both |
| S-11 | Browser tests of the journeys at three widths, producing the report's screenshots | s12 §tests | `frontend/scripts/screenshots.mjs` already drives the journeys and checks sideways scrolling | Turn the journeys into asserted browser tests (Playwright, pinned) at 390/820/1280, run by one command; keep the screenshot output | front |
| S-12 | A script measuring response times, bundle sizes and chart render times, for the report | s10 §budgets | Timings measured by hand in `docs/WORKLOG.md` | `tools/measure.py` (API timings cold/warm, sizes) plus the bundle sizes from the build and chart render times from the browser tests; writes the report's performance table | both |

## 3. Waves (at most two packages at once; each package in its own tree)

Dependencies: G4 needs the `ranks` field (back end first). The Assistant panel needs E12. S-10 is easier
after the API stops changing. S-11 and S-12 come last, because they record the finished application.

| Wave | Package | Model (D-W-14) | Contents | Why this model |
|---|---|---|---|---|
| **A** | **A-back** | Sonnet 5.5, medium | S-04 back end (SQLite repo, E13–E15, tests, OpenAPI); S-02's `ranks` in E7 and E8 (per method, with tests against a direct computation from `score_address`) | Follows existing patterns (store, schemas, errors, ETag) |
| **A** | **A-front** | Sonnet 5.5, medium | S-01 method menu (URL + preference; every view follows it; under 0.5 s); S-03 G6 on V5 | A menu and one more chart through the wrapper |
| **B** | **B-back** | **Sonnet 5.5, high** | S-05 back end: requirements-assistant.txt, assistant_service, E12 (statuses 200/400/404/422/429), cache, `precompute_assistant.py`; restore `auto` (D-W-09); tests that a guardrail failure never returns text | Subtle: model loading, concurrency, the guardrail contract, a long precompute run |
| **B** | **B-front** | Sonnet 5.5, medium | S-04 front end (V6, star dialog, Undo, recent addresses); S-02 G4; S-06 replay | Patterns exist; three medium items |
| **C** | **C-front** | Sonnet 5.5, medium | S-05 panel (template → Assistant, progress, cancel, labels); S-07 linked selection; S-08 scenario table | Medium; depends on E12 |
| **C** | **C-tools** | Sonnet 5.5, medium (Haiku for the fixture re-record) | S-10 generated types + CI; S-12 `measure.py` | Tooling; contract-sensitive |
| **D** | **D-browser** | Sonnet 5.5, medium | S-11 browser tests at three widths, final screenshots into `docs/screenshots/` | Records the finished app |
| — | Mechanical jobs between waves | **Haiku 5.5** | Re-record fixtures after back-end changes (`npm run fixtures`); screenshot runs; tables from `openapi.json` for the report; tidy `docs/WORKLOG.md` headings | Mechanical |
| — | **MS3 gate and freeze** | **Opus 5.5 (the lead) or Fable 5.2** | Each Should item finished *and tested*, or cut and recorded; re-run the MS2 gate (no regression); the cut list; a detailed MS3 record in `docs/TEST_LOG.md` | A gate |

S-09 (live lookup) is not in a wave: if the team approves CR-08 by 22 Nov, a **Sonnet 5.5 high**
package (network, rate limits, server-sent events, cancellation) is added after wave B and the plan is
updated here. Otherwise it is recorded as cut on 22 Nov.

## 4. The review routine for every package (unchanged)

The lead re-runs everything; cooks' claims are not taken on trust:
1. `git diff --cached` is empty.
2. Tests, typecheck and build.
3. The wording grep.
4. `vendor_a2.py --check`.
5. No mock in `dist/`; the main-chunk size (**budget: stay under 150 kB gzip** for the first screen;
   lazy-load V6, replay and the Assistant panel if needed).
6. Look at 2–3 screenshots.
7. Probe the live API for back-end work.
8. **Both suites in a clean worktree of the commit**, then push.
9. Log: a `docs/WORKLOG.md` entry, a `docs/AI_USE_LOG.md` row naming the model, and the `TODO.md` update.

After each wave, re-run `tools/ms_gate_check.py` and the screenshot check against a fresh clone (no
regression of MS2).

## 5. Cut rules (plan §4.6), applied from the bottom if time or usage runs short

1. Every Could item (never started before MS3).
2. S-12, S-11, S-10 (evidence and tooling; the Must tests still run by hand).
3. S-09 (also blocked on CR-08).
4. S-08, S-07.
5. S-06.
6. S-05 (the template already satisfies FR-04).
7. S-04 (the API then has GET and POST only, which still meets the brief).
8. S-03, S-02.
9. S-01.

**Usage trigger:** if a 5-hour window runs out with more than one wave left, drop to one package at a time
and move up the cut list rather than delay MS3.

## 6. What the team must decide (owner: the user)

- **CR-08 (live lookup): approve or reject by Sun 22 Nov.** Without a decision, S-09 is cut.
- **CR-07 (scope):** record the four members' votes in the minutes (it covers the Should list built here).
- **Tutor on generative AI:** still unanswered as far as this repository records. All use is in
  `docs/AI_USE_LOG.md`.
- **People for T39** (the usability walkthrough, two sessions, from 25 Nov): book them now. The lead can
  prepare the script and recording sheets (a Haiku/Sonnet job) once the Should items settle.
