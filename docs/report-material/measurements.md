# Measurements so far

**Read this first.** The consistent figures are now in `docs/report-material/measured/measure.md`: one run of
`tools/measure.py --build --charts` on a clean tree at commit `2339d66` (21 Nov 2026, after the MS3 gate). All 31 budgets are met,
and first-screen JavaScript is 148.0 kB gzip against a 150 kB budget. The older figures below are kept for history.
They are copied exactly from `docs/WORKLOG.md` and `docs/TEST_LOG.md`, come from different runs, on different commits
and under different conditions, so do not mix them in one table without the conditions column.

Figures are copied as written in the sources: no rounding, no estimates. Where the source gives no value, the cell says
"not measured yet". Machine: the entries do not name one; the work ran on the Mac (Apple M5, macOS 26.6, `docs/HANDOFF.md` §4)
unless stated. Plan budgets are from `docs/plan/sections/s10-realtime.tex` (section 4 table, "budgets").

---

## 1. API response times (E5 to E11)

Source: `docs/WORKLOG.md`, entry "2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed" (E5, E6, E7), and entry
"2026-11-11 — T14 and T15 reviewed and committed" (E8, E9, E10, E11).

**Conditions, E5 to E7.** Uvicorn over HTTP, gzip on. "warm" = median of 30 requests; "cold" = cache cleared.
Commit `fd2d796` (the reviewed package; the lead's review commit for T10–T13).
Running example `1Bbcsfxj…3dz` (377 transactions) and largest address (700 transactions).

| Request | Running example, cold / warm | Largest address (700 tx), cold / warm | Body (gzip), as the WORKLOG writes it |
|---|---|---|---|
| E5 timeline | 57 / 1.5 ms | 102 / 1.5 ms | 11.6–18.4 kB (1.2–1.5 kB) |
| E6, 50 rows | 97 / 1.5 ms | 104 / 1.5 ms | 12.5–13.0 kB (3.3–3.6 kB) |
| E6, 200 rows | 58 / 2.8 ms | 104 / 2.8 ms | 52 kB (13 kB) |
| E7 | 59 / 1.4 ms | 103 / 1.5 ms | 2.7–2.9 kB (1.2–1.3 kB) |

The WORKLOG's column is headed "Body (gzip)" and gives two figures per row; it does not say which is the gzip size and
which is the plain size. **To check before the report uses them.** The WORKLOG's own note: "All within the plan's budgets
(s10.3: E5 150 ms, or 20 ms cached; E6 page of 200 within 150 ms; E7 150 ms; timeline body 60 kB; one transaction 6 kB)."
Also in that entry: "Warming all 28 addresses: ~1.2 s and ~51 MB, after 'ready', so the 10 s start budget is untouched."

**Conditions, E8 to E11.** Uvicorn, warm = median of 7. Commit `2bde9b8` (the lead's review commit for T14 and T15; the entry does not say which tree was timed). Date 11 Nov 2026.

| Request | Running example | Largest (700 tx) | Budget | Plan's measurement |
|---|---|---|---|---|
| E8 | 267 ms (cold 339) | 340 ms | 700 ms | 400 ms |
| E9, 7 amounts | 156 ms | — | — | 160 ms |
| E9, 41 points (default) | 200 ms | 342 ms | 1.5 s | 180 ms |
| E9, 61 points | 165 ms | 238 ms | 1.5 s | — |
| E10 CSV (295 kB) | — | 21 ms (cold, uncached method: 120) | — | — |
| E11 | 1 ms | | — | — |

The WORKLOG's note on the default curve: "The default curve builds twice (a probe build finds the usual amount), which is
why 41 default points on the largest address cost more than 61 explicit ones."

**E12 to E15 (watchlist and Assistant).** Not measured yet. E13 to E15 and E12 are in the schema and the code; no timing is
recorded in the WORKLOG or TEST_LOG. (E12's docstring in `backend/app/api/explanations.py` says "about 10 seconds" for a first
answer and "about 3" for later ones. That is a code comment, not a measurement, and it is not used here.)

**E1 to E4.** Not measured yet (no timing recorded for health, config, addresses or lookup).

---

## 2. Load time

**Back-end start (model load), 11 Nov 2026.** Source: `docs/WORKLOG.md`, entry "2026-11-11 — Wave 1, back end: T03, T05–T09
reviewed and committed", "Measured". Commit `5a690f1`. Conditions: the running example.
- "Import 1.3–1.5 s, `Predictor.load()` 0.74 s, about 2.3 s in total on a warm run; about 5 s cold."
- "'ready' 0.7 s after start" (same entry, from the start of Uvicorn).
- The same entry: "what-if 0.05 BTC out scores 5.98 (both as in the plan)" — a result, not a timing.

**Other "ready" times recorded (different conditions, not the same measurement):**

| Date | Source | Commit | Figure | Conditions |
|---|---|---|---|---|
| 11 Nov 2026 | `docs/TEST_LOG.md`, MS1 record | `9adf130` | "Uvicorn ready in ~1.3 s with a clean log" | fresh clone, MS1 gate |
| 12 Nov 2026 | `docs/TEST_LOG.md`, MS2 record (server log line) | `3a83414` | "0.8 s since start" (the log line: "Explorer ready: 28 addresses, 9 methods (snapshot 2026-10-22, 0.8 s since start)") | fresh clone, MS2 gate |
| 12 Nov 2026 | `docs/HANDOFF.md` §5 | none | "ready ~1 s" | stated in the handoff, no run recorded |

**Warming the cache, 11 Nov 2026.** Source: `docs/WORKLOG.md`, entry "2026-11-11 — Wave 2, back end: T10–T13 reviewed and
committed": "Warming all 28 addresses: ~1.2 s and ~51 MB, after 'ready'".

**Front-end page load (time to first screen, time to interactive).** Not measured yet. No browser load time is recorded in
any log. The Plotly chunk's load time: not measured yet.

---

## 3. Bundle sizes (production build, `npm run build`)

Source: `docs/WORKLOG.md` build reviews. The sizes are the lead's build output at each review commit.

| Date | Entry (WORKLOG) | Commit | Main JS | Main JS gzip | Other | Budget or note |
|---|---|---|---|---|---|---|
| 11 Nov 2026 | "Wave 1, front end: T04 and T16 reviewed and committed" | `271642a` (work), `a4727d0` (rename) | 366.6 kB | 120.1 kB | CSS 25.1 kB | — |
| 11 Nov 2026 | "Wave 2, charts: T23, T24, T26 reviewed and committed" | `eeefa9c` | 374.4 kB | 123.8 kB (+3.8 kB gzip) | Plotly chunk 1,446 kB / 478 kB gzip; CSS 23.4 kB | — |
| 11 Nov 2026 | "T17 reviewed; MS1 passed" | `610331d` | not recorded as a figure | "~124 kB gzip" for the first screen, "now in one request instead of three" | — | — |
| 12 Nov 2026 | "T18, T25, V7 reviewed and committed" | `867c2f9` | 400.3 kB | 130.9 kB (+6.5 kB gzip on `610331d`'s 124.4) | — | "inside the 10 kB allowance" |
| 12 Nov 2026 | "The what-if lab (commit d57c220)" | `d57c220` | not recorded | 139.1 kB (+8.2) | — | — |
| 12 Nov 2026 | "Frontend polish (commits 55c0b98, 3a83414)" | `3a83414` | not recorded | 140.6 kB (+1.5) | — | — |
| 12 Nov 2026 | "Wave A front end reviewed" | `2411243` | not recorded | 142.4 kB | — | budget 150 |

The WORKLOG's "T17" and "d57c220" and "polish" entries give the gzip figure without the plain size. "Not recorded" means
the entry does not state it.

**Screenshots folder (a size, not a bundle).** `docs/WORKLOG.md`, "Frontend polish", 12 Nov 2026, commit `3a83414`:
"`docs/screenshots/` 48 files, 13 MB". The folder now holds 58 files (see `screenshot-index.md`).

**Other sizes recorded:**
- E10 CSV: 295 kB (WORKLOG, T14 and T15 entry, largest address; commit `2bde9b8`).
- E7 body: 3,041 bytes, budget 6 kB (WORKLOG, "Wave A back end reviewed", live probe; commit `a411820`, 12 Nov 2026).
- Address cache: 28 entries, ~51 MB (WORKLOG, "Wave 2, back end" design note "capacity of one snapshot (28 entries, ~51 MB)"; commit `fd2d796`).
- Back-end files to commit: 89 files, the largest 17 MB (`txgpt_method.joblib`) (WORKLOG, "Wave 1, back end", 11 Nov 2026; commit `5a690f1`). Repository file size, not a runtime measurement.
- A2 Assistant weights: 610 MB (WORKLOG, "Which Assignment 2 build A3 loads"; file size, git-ignored).

---

## 4. Method switch

Source: `docs/WORKLOG.md`, entry "2026-11-12 — Wave A front end reviewed (S-01 method selector, S-03 G6)". Commit `2411243`.
Conditions: "production build via `vite preview` on the real back end".

- Method-switch feedback: **8–24 ms**.
- Overview updated: **32–36 ms warm** (worst **46 ms**); **175 ms** (running example) to **349 ms** (largest) cold.
- The plan's target: **0.5 s** (from the same entry: "The plan's target is 0.5 s.").

---

## 5. Keystroke to verdict (the what-if lab)

Source: `docs/WORKLOG.md`, entry "2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its
developer tools", design note "The real-time loop". Commit `d57c220` (the lab).

- "Keystroke to verdict: **~600–650 ms**, including the 250 ms debounce."
- Conditions: **not recorded** in the entry (machine, browser and server load are not stated). Plan budget: "Under 1 s after
  the last keystroke" (`docs/plan/sections/s10-realtime.tex`, R1).

---

## 6. Not measured yet

- E1, E2, E3, E4 response times; E12 to E15 response times.
- Front-end page load (first screen, interactive), and the Plotly chunk's load time.
- Chart render times and "a chart redraw after new data" (plan budget 300 ms; `docs/plan/sections/s10-realtime.tex` table).
- The Assistant's first and later answer times (E12).
- Keystroke-to-verdict under stated conditions (only the approximate figure above exists).
- Anything on a real phone (WORKLOG: "Scrolling past a chart on a real phone is not verified").
- Any figure from one consistent run: this is what `tools/measure.py` (S-12) will produce.

---

## 7. Test-run figures (for the report's test summary, not timings)

From `docs/TEST_LOG.md`, MS2 record, commit `3a83414`, 12 Nov 2026: back end `pytest` **601 passed**; front end `npm test`
**546 passed, 0 skipped**; `npm run typecheck` and `npm run build` clean; `tools/vendor_a2.py --check` all hashes match.
Later counts in the WORKLOG: back end **646 passed** and front end **575** (wave A, commit `2411243` and `a411820`, 12 Nov 2026).
