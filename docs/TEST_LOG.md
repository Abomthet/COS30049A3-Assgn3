# Test log — COS30049 Assignment 3

The record of milestone checks and test runs the plan asks for (sections 4.4, 12 and 14). Each entry
says what was run, on which commit, by whom (or which model), and what was seen. Newest first.

---

## Clean install from a trial zip, macOS (T44, wrap-up 4.3): PASSED (21 Nov 2026)

**Zip:** `git archive --format=zip HEAD` of `76e39c1` (tracked files only), 60.4 MB; no `node_modules`, `var/`,
database or `__pycache__` entries. Unzipped into a new, empty folder and installed by the README's macOS route.
**Run by:** the lead (Claude Opus 5.5), on the Mac above.

| README step | Result |
|---|---|
| 1. `conda env create -f environment.yml` | The environment file solves on conda-forge (`--dry-run`); the existing `cos30049-a3` environment, built from the same file, was used to run (a fresh environment build is part of the Windows install, 4.4) |
| 1. `python -m pytest -q` | **739 passed, 2 skipped** |
| 1. `uvicorn app.main:app` | `Explorer ready: 28 addresses, 9 methods (snapshot 2026-10-22, 0.8 s since start)`; `assistant: not_installed` (the 610 MB weights are a separate download, as the README says) |
| 2. `npm ci`; `npm run dev` | Installs from the lock file; Vite ready in under a second |
| 3. Check it works | `/api/health` answers the same on the back end and through Vite; the page answers 200; `tools/ms_gate_check.py` **PASS** (28 addresses, 945 bodies scanned) |
| Also | `npm test` 657 passed; `npm run build` clean; back-end log 0 warnings, 0 errors |

**Found and fixed in the README.** The first attempt ran into old servers still on 8000 and 5173: Uvicorn stopped with
"address already in use", and Vite silently moved to 5174 while still forwarding `/api` to the old back end on 8000,
so the checks reached the old servers (32 hours' uptime). The run was repeated on 8001 and 5175 with
`VITE_PROXY_TARGET`, which passed. The README's port item had suggested `VITE_API_BASE` (untested, and it bypasses
the proxy, so CORS applies); it now gives the tested `VITE_PROXY_TARGET` route and warns about Vite's silent move.

---

## **MS3 — feature freeze: PASSED** (Sat 21 Nov 2026, 6 days early)

**Commit:** `2041d49` (`assgn3/main`, the team repo). **Run by:** the lead (Claude Opus 5.5), on the Mac (Apple M5,
macOS 26.6.2, Node 24.22.2, Python 3.11.18 in `cos30049-a3`), under `caffeinate` (idle sleep had frozen earlier runs).
**Set-up:** a fresh `git clone` of `github.com/Abomthet/COS30049A3-Assgn3` into a scratch folder; `npm ci`; the back end
started from the README route (`uvicorn app.main:app`, with `EXPLORER_LIVE_LOOKUP=on` for the live shots) on port
8100 and Vite on 5300 (8000 and 5173 avoided). The back end logged `Explorer ready: 28 addresses, 9 methods (snapshot
2026-10-22, 0.8 s since start)`. The script and its full log are reproduced by the commands under "How to repeat".

**The gate** (plan §14.4: Should items finished or cut; the cut list recorded):

| # | Should item | State | Evidence (tests on `2041d49`; screenshots from this run) |
|---|---|---|---|
| S-01 | Method selector (`?method=`), both tiers | **Finished** | `methodMenu.test.tsx`, `methodNames.test.tsx`, `test_explorer_api.py`, `test_parity.py` (every method's flags equal `scores.csv`); shot 48 |
| S-02 | G4: each model's score against its own threshold (ranks) | **Finished** | `g4ModelVerdicts.test.tsx`, `test_ranks.py`; J2 browser test draws "Where each model ranks it"; shots 53, 54 |
| S-03 | G6: planted-test recall with intervals, on V5 | **Finished** | `g6PlantedRecall.test.tsx`, `modelsScreen.test.tsx`; shots 36–38 |
| S-04 | Watchlist (E13–E15), recent addresses, preferences | **Finished** | `test_watchlist_api.py`, `watchlist.test.tsx`, `settings.test.tsx`; a11y spec (watch dialog focus trap, toast live region); shots 49–52, 57 |
| S-05 | Assistant explanations (E12): guarded, cached, prepared answers | **Finished** | `test_assistant_api.py`, `test_precompute_assistant.py`, `assistantPanel.test.tsx`; works without the weights (Mod-15); shots 58, 59 |
| S-06 | Replay | **Finished** | `replay.test.tsx`; a11y spec (no autoplay under reduced motion); shots 55, 56 |
| S-07 | Linked selection | **Finished** | `selection.test.tsx`; shots 60, 61 |
| S-08 | Scenario table: keep, compare, export | **Finished** | `scenarios.test.tsx`; J4 browser test keeps two scenarios; shots 62, 63 |
| S-09 | Live lookup (E16–E20), off by default | **Finished** | `test_live_api.py` (a snapshot address pushed through the live route scores as the snapshot does), `liveLookup.test.tsx`, `liveHttp.test.ts`; a real fetch of 500 of 1,164 transactions during this run; shots `live-01`–`live-03` |
| S-10 | TS types from OpenAPI; tests and builds on every push | **Finished** | `generatedTypes.test.ts` (staleness), `typeAgreement.check.ts` (typecheck); `npm run types` on the clone changed 0 files; CI green on the team repo |
| S-11 | Browser tests of the journeys at three widths | **Finished** | `npm run e2e`: **462 passed, 42 skipped (by design), 0 failed** in 5.0 min — J1–J6, the wider-text checks and the accessibility spec, in Chromium, Firefox and WebKit at 390, 820 and 1280 px |
| S-12 | Measurement script for the report | **Finished** | `tools/measure.py --build --charts`: **31 of 31 budgets PASS** (below) |

**Cut list: no Should item is cut.** Could items C-01 to C-07 (plan §4) were not started. The lead recommends cutting
all seven so the remaining time goes to the report, the video and the usability sessions; **the team decides (wrap-up
3.3) and the decision goes in the minutes and the change log.** Until then none is built.

**Everything else on the same commit, from the fresh clone:**
- `tools/vendor_a2.py --check`: every vendored A2 file matches its hash.
- Back end `pytest` (full, warnings are errors): **739 passed, 2 skipped** (the real-model and opt-in network tests).
- Front end `npm test`: **657 passed** in 36 files; `npm run typecheck` clean.
- `tools/ms_gate_check.py` through Vite's proxy: all **28** addresses (3 short-history), **7,966** transaction rows,
  **822** transaction details (681 flagged), **945** bodies scanned for the banned words, **20** operations (DELETE,
  GET, POST, PUT): **PASS**.
- `measure.py` (31 of 31 budgets met) highlights: E5 warm 1.2 ms (budget 20), E8 what-if warm 277.5 ms (700), E9 curve of 41 at the largest
  address 371.6 ms (1,500), G1 first chart from opening the page 336 ms (1,500), **first-screen JavaScript 148.0 kB
  gzip (budget 150)**.
  The gate run's header said "uncommitted changes": a bug in `measure.py` (an empty `git status` read as dirty), fixed
  in `2339d66` with a test. `docs/report-material/measured/` now holds a re-run on the clean tree at `2339d66` (back-end
  code unchanged): the same verdicts, first-screen JavaScript 148.0 kB, E8 warm 278.3 ms, E9 largest warm 347.4 ms.
- `npm run screenshots`: all 70 re-taken (normal run, live run, mock-only states); each run ended "Responsive check
  passed: no page scrolls sideways at any width"; 23 images changed: 13 phone shots (the tighter tab spacing from `303f5fb`),
  the rest from live data, watchlist state, scenario order or timing.
- Server log: 0 warnings, 0 errors; the only 5xx is the expected `GET /api/health 503` while the models loaded,
  before "Explorer ready".

**Known limits and risks carried forward (none blocks MS3):**
- **First-screen JavaScript has 2.0 kB of headroom** (148.0 of 150 kB; it was 145.3 on 13 Nov). Any new screen must
  load lazily; re-measure after any front-end change.
- Scrolling past a chart has not been verified on a real phone (wrap-up 1.6, a person).
- The automated accessibility checks run axe in Chromium only; the VoiceOver and keyboard-by-hand passes are the
  team's (checklist `docs/usability/accessibility-checklist.md`).
- WebKit skips the keyboard group (Safari does not Tab to links by default).
- Plotly's range slider is not keyboard-operable by itself; the period buttons and G1's arrow keys cover zoom.
- The Windows clean install is untested until 29 Nov (4.4).

**How to repeat:** clone the team repo; `npm ci` in `frontend/`; run the back end and Vite as in the README; then
`python tools/vendor_a2.py --check`, `cd backend && python -m pytest -q`, `cd frontend && npm test && npm run
typecheck && npm run e2e`, `python tools/ms_gate_check.py`, `python tools/measure.py --build --charts`, `npm run
screenshots` (plus `LIVE=1 ONLY='^live'` with live lookup on, and `MOCK=1 ONLY='^(04|11|4[0-4])'` on the mock).

---

## MS1 recheck and **MS2 — the minimum viable demonstration: PASSED** (12 Nov 2026, 10 days early)

**Commit:** `3a83414` (`origin/main`). **Run by:** the lead (Claude Opus 5.5), on the Mac (Apple M5,
macOS 26.6.2, Node 24.22.2, Python 3.11.18 in `cos30049-a3`).
**Set-up, as the README says:** a fresh `git clone` of `github.com/Defaul119/COS30049A3` into a scratch
folder; `npm ci` in `frontend/`; terminal 1 `uvicorn app.main:app --port 8000` in `backend/` (the
`cos30049-a3` environment); terminal 2 `npm run dev` in `frontend/`. Ports 8000 and 5173 were checked
free first. The back end logged `Explorer ready: 28 addresses, 9 methods (snapshot 2026-10-22, 0.8 s
since start)`; `curl localhost:5173/api/health` returned the same answer as port 8000.

**The gate** (plan §4.4, "The minimum viable demonstration": on all 28 snapshot addresses, with both
servers started from the README):

| # | Condition | Result | Evidence |
|---|---|---|---|
| 1 | J1, J2, J3 pass: AC-01, AC-02, AC-03 and all five FR-05 states | **PASS** | `tools/ms_gate_check.py` through Vite's proxy: all **28** addresses open (E3, E4, E5); every page of every address's transactions, **7,966 rows** = the snapshot's count, each address's total equal to E3's `txCount`; **822** transaction details (every flagged one plus a fifth of the rest); the **3** short-history addresses give E5/E6 200 unscored and E7 422 `insufficient_history`; an address outside the snapshot → 404 with 3 examples; a typo → 400. In the browser, the screenshot run (shots 01–10, 14–16, 20–28) walked J1 (select → overview), J2 (flagged day → transaction with reason, comparison basis, limitation line, G3, nine verdicts) and J3 (typo caught before any request, unsupported with examples, short history unscored) against the real back end. Vitest `journey.test.tsx` and `stateCatalogue.test.tsx` (72 cases) cover the same states. |
| 2 | J4: a what-if returns every model's verdict; an invalid value is refused in the browser and by the server | **PASS** | Server: E8 0.05 BTC out at 2026-10-20T12:00Z on the running example → 200, flagged, **score 5.98**, 8 methods scored + `notAvailable: ["txgpt_method"]` = 9; `amountBtc 0.123456789`, `amountBtc -1` and `direction "sideways"` → **400 `invalid`**; E9 → 41 points. Browser: shot 34 (invalid amount refused with the server's wording, no request sent); Vitest `whatIfLab.test.tsx` and `whatIf.test.ts` (every entry of `shared/whatif_vectors.json`). |
| 3 | Three chart types (G1 bar, G2 scatter, G5 line) with zoom and tooltips, a title, axis units, a legend and the snapshot date | **PASS** | Shots 05 (G1), 20 (G2), 30 (G5): titles, axis titles with units, legends, "snapshot of 22 Oct 2026". Zoom and tooltips: Vitest `plotlyChart.test.tsx` (29 tests on the wrapper's zoom, keyboard tooltips and relayout handling) and the frontend-polish cook's real-browser run on 12 Nov (mouse-drag zoom narrowed each axis; hover tooltips shown; 0 console errors). *The lead did not drag-zoom by hand in this run.* |
| 4 | The API uses GET and POST, and its documentation page lists every endpoint | **PASS** | `/openapi.json`: **11 operations**, GET and POST (E1–E11); `/docs` answers 200. |
| 5 | The wording test finds none of the banned words in any response or screen, and every flagged transaction shows the limitation line | **PASS** | `ms_gate_check.py` scanned **945 response bodies**: 0 banned words. All **681** flagged transactions carry the limitation line (and E10's CSV filtered to unflagged rows still carries it, D-W-11). Screens: the polish cook's crawl of 113 pages over all 28 addresses (0 banned words; all 24 flagged-transaction pages show the line); back-end `test_wording.py`; front-end `wording.test.ts`. |
| 6 | Layouts at 390, 820 and 1280 px with no sideways scrolling | **PASS** | `npm run screenshots` from the fresh clone against the real back end: 48 shots; "Responsive check passed: no page scrolls sideways at any width." Light and dark were checked by the polish cook. |

**Test suites on the same commit** (clean worktree, run by the lead):
- back end `pytest` **601 passed** (warnings are errors), ~2 min;
- front end `npm test` **546 passed, 0 skipped**;
- `npm run typecheck` and `npm run build` clean;
- `tools/vendor_a2.py --check`: all vendored A2 files match their hashes.

**Server log during the gate:** 0 warnings, 0 errors, no 5xx responses.

**Plan's MS2 definition (§14.4):** "The minimum viable demonstration … on all 28 addresses, at three widths.
Every Must item except M-14 to M-16 is done." Must items M-01 to M-13 are built (see `TODO.md`).
M-14 (tests, README, clean install), M-15 (usability walkthrough, accessibility) and M-16 (submission)
are scheduled later by the plan.

**Known limits, carried forward (none blocks MS2):**
- Plotly's legend entries stay under 44 px with a mouse on a desktop (display-only on touch).
- Scrolling past a chart has not been verified on a real phone.
- The offline banner follows `navigator.onLine` only.
- The mock's health check also answers 429 in "busy" mode (a test-only quirk).

**How to repeat:** start both servers as above, then
`~/miniconda3/envs/cos30049-a3/bin/python tools/ms_gate_check.py` (prints the totals and PASS, or each
failure), then `cd frontend && npm run screenshots`.

---

## MS1 — walking skeleton: PASSED (11 Nov 2026)

**Commit:** `9adf130`. **Run by:** the lead (Claude Opus 5.5).
From a fresh clone: `vendor_a2.py --check` passed; Uvicorn ready in ~1.3 s with a clean log; E5 200 for
all 28 addresses; back end 478 passed (after fixing a cross-tier contract test, `9adf130`); front end
`npm ci`, 244 tests and the build clean; V1–V3 on real data, including the unsupported and short-history
states. Details in `docs/WORKLOG.md` (11 Nov, "MS1 passed").
