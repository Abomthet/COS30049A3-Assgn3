# Test log — COS30049 Assignment 3

The record of milestone checks and test runs the plan asks for (sections 4.4, 12 and 14). Each entry
says what was run, on which commit, by whom (or which model), and what was seen. Newest first.

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
