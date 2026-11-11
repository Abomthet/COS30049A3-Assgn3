# A3 to-do (Claude's working list)

Source: `docs/plan/main.pdf` (the full plan, which wins) and `../explainers/a3/a3.pdf` (the briefing).
Task numbers (T01–T52) and scope IDs (M/S/C) are the plan's. Owners are ignored: Claude does every task
it can, and **[you]** marks what needs a person (sending messages, meetings, people, signatures, recording, Canvas).
Log every AI session in `docs/AI_USE_LOG.md` the same day; it becomes the report's AI appendix.

Legend: `[ ]` open · `[~]` in progress · `[x]` done · **[you]** needs you · ⛔ blocked

---

## Brigade (who does what)
- **Lead (Opus 5.5)**: plans, writes the task specs, reviews every package, runs the checks, commits, signs off the API contract (T05), keeps `docs/WORKLOG.md` and `docs/AI_USE_LOG.md`.
- **Cooks (Sonnet 5.5, high effort)**: build one bounded package each in their own part of the tree; they never commit.
  - Wave 1 (11 Nov): **backend-core** → T03, T05, T06, T07, T08, T09 · **frontend-port** → T04, T16
  - Wave 2: **charts** → T23, T24, T26 (started 11 Nov against the mock) · next: **backend-endpoints** → T10–T13 (MS1) · **frontend-views** → T17, T18
- Status tag on each line: `@backend-core`, `@frontend-port`, … = handed to that cook.

## 0. Blockers found on 11 Nov
- [x] **Node.js is not installed on the Mac** → Node v24.22.2 LTS installed into `~/.local/node` (checksum verified), on PATH via `~/.local/bin`
- [x] Repository initialised (`main`, local only); baseline commit `0f6e1e3`
- [ ] **[you]** Which A2 commit was submitted? (no `v1.0` tag; head of `from-scratch` is `aa56a26`) → needed for T02/T03
- [ ] **[you]** OK to create the **private** GitHub repo `Defaul119/COS30049A3` and push?

## 1.4.1 Set-up and contract (11–12 Nov)
- [ ] T01 **[you]** Send the tutor questions and CR-07/CR-08 to the team (Claude drafts them from Appendix A)
- [x] T02 (repo `Defaul119/COS30049A3`, private; A2 `v1.0` → `aa56a26`, local tag) Tag A2's submitted commit `v1.0` (push needs your OK); `git init` A3 with the plan's layout, `.gitignore`, branch rules
- [x] T03 (`5a690f1`) `vendor_a2.py`: copy A2's runtime (`explorer/`, models at `results-v1.1`, settings) into `backend/` with SHA-256 hashes; pinned back-end env; smoke test that loads the `Predictor`
- [x] T04 (`271642a`, `a4727d0`) Copy the A1 prototype (`asm1_demo/frontend` @ `8375cf0`) → `frontend/`; it builds; its 66 tests pass; the client moves to Axios
- [x] T05 (`5a690f1`) Pydantic schemas for E1–E11 and the error body; export `openapi.json`; check it against `src/api/types.ts`
- [x] T06 (`5a690f1`) `web` block in settings; E2 `/api/config`

## 1.4.2 FastAPI back end (12–18 Nov) → MS1 on Sun 15 Nov
- [x] T07 (`5a690f1`) App factory, lifespan load, E1 `/api/health`, logging, request IDs, CORS (M-01)
- [x] T08 (`5a690f1`) Exception classes and handlers; validation errors → 400; Unsupported → 404; InsufficientHistory → 422 (M-10)
- [x] T09 (`5a690f1`) Address and txid validation in Python (Base58Check, Bech32, Bech32m); shared test vectors for pytest and Vitest (M-09)
- [x] T10 (`fd2d796`) Address store, explorer service, per-address cache (Mod-1 to Mod-4) (M-02)
- [x] T11 (`fd2d796`) E3 `/addresses`, E4 `POST /lookup`, E5 `/timeline`
- [x] T12 (`fd2d796`) E6 `/transactions` with filters, sorting and paging; E7 `/transactions/{txid}` (M-02, M-08)
- [x] T13 (`fd2d796`) Parity tests (API equals `predict.py`) and the wording test over all 28 addresses (M-14)
- [ ] **MS1** Both tiers start from a fresh clone; E1–E7 answer for all 28 and pass parity; V1–V3 show real data, including the unsupported and short-history states
- [~] T14 `@backend-whatif` E8 what-if; E9 curve with the batched feature build plus a parity test against single calls (Mod-5, Mod-6) (M-03, M-04)
- [~] T15 `@backend-whatif` E10 export (CSV/JSON); E11 `/methods` with the evaluation tables (M-12, M-13)

## 1.4.3 React front end (13–20 Nov)
- [x] T16 (`271642a`) Shell: navigation, service-status indicator, theme, toasts, error boundary; settings from E2 (M-05, M-10)
- [~] T17 `@frontend-views` V1, V2 and V3 on the real API; fixtures recorded; prototype banner and tools removed (M-05). Also: thresholds only from E2 (D-W-10), E2 `features` into `AppSettings`, Vitest reads `shared/address_vectors.json` (un-skip)
- [ ] T18 Tabs; filter bar (status, direction, date range); transaction table (M-08)
- [ ] T19 V4 what-if lab: form, rules, feedback, live request with cancellation (M-06, M-11)
- [ ] T20 V5 models and limits; V7 about and help (M-13)
- [ ] T21 State catalogue in every view; time limits; recovery and retry (M-10)
- [ ] T22 Export menu; PNG export (M-12)

## 1.4.4 Charts (15–21 Nov), Plotly.js
- [x] T23 (`eeefa9c`) Chart wrapper: contract, theme, table view, export, lazy loading (M-07)
- [x] T24 (`eeefa9c`) G1 daily activity (bar), keyboard control, range slider
- [ ] T25 G2 transactions over time (scatter, log amount), driven by the filters
- [x] T26 (`eeefa9c`) G3 feature deviation (horizontal bar)
- [ ] T27 G5 what-if response (line, log amount, flag line)
- [ ] T28 Layouts at 390 / 820 / 1280 px; screenshot script fails on sideways scroll (M-11)
- [ ] T29 **MS2 (Sun 22 Nov)**: minimum viable demonstration on all 28 addresses; test log entry

## 1.4.5 Should items (23–27 Nov), in build order; cut from the bottom
- [ ] T30 S-01 method selector (`?method=`), both tiers
- [ ] T31 S-02 G4 model verdicts (dot plot, ranks); S-03 G6 planted-test recall
- [ ] T32 S-04 watchlist: SQLite store, E13–E15, dialog, V6; preferences
- [ ] T33 S-05 Assistant: service, E12, panel, guardrail, cache, prepared answers (works without the 610 MB weights)
- [ ] T34 S-06 replay
- [ ] T35 S-07 linked selection; S-08 scenario table
- [ ] T36 S-09 live lookup, E16–E20, dialog V8 — ⛔ **only if CR-08 is approved by 22 Nov**
- [ ] T37 S-10 TS types generated from OpenAPI; CI runs tests and builds on every push
- [ ] T38 S-11 browser tests at three widths; S-12 `measure.py` (response times, bundle sizes, render times)

## 1.4.6 Test and fix (25–29 Nov)
- [ ] T39 **[you]** Usability walkthrough, two sessions (Claude prepares the script, tasks and recording sheet)
- [ ] T40 Accessibility inspection (Claude runs the automated checks; **[you]** keyboard and screen-reader pass)
- [ ] T41 Fix every severity 3–4 issue; retest
- [ ] T42 **MS3 (Fri 27 Nov)**: feature freeze; cut list recorded in the change log
- [ ] T43 README complete; comment and docstring pass; `MODIFICATIONS.md`; `LICENSES.md` line
- [ ] T44 Clean install from a trial zip: macOS (Claude); **[you]** Windows PC
- [ ] T45 Browsers and devices; test log complete; **MS4 (Sun 29 Nov)**: tag `v1.0-rc`

## 1.4.7 Report, video, submission (28 Nov–5 Dec)
- [ ] T46 **[you/team]** Report sections (8 pages max) — Claude supplies generated material only
- [ ] T47 Figures, screenshots, API tables from `openapi.json`, measured table from `measure.py`
- [ ] T48 **[you/team]** Video (7 min): Claude drafts the shot list and checks timing; recording, narration and unlisted upload are yours
- [ ] T49 Report review against the rubric; page count; Harvard references; AI acknowledgement from the log
- [ ] T50 Tag `v1.0`; build the zip from the tag (no `node_modules`); checksums; unzip and run clean
- [ ] T51 **[you/team]** Minutes for Weeks 1–12; contribution form signed
- [ ] T52 **[you]** **MS5 (Sat 5 Dec)**: submit on Canvas; download the upload and open every file

## Could (only after MS3, with a logged change)
- [ ] C-01 G7 surprisal (E21) · C-02 profile card (E22) · C-03 G8 calendar, G9 snapshot map · C-04 review marks · C-05 one-command mode and Docker · C-06 watch mode · C-07 printable summary

## Housekeeping found while reading
- [ ] Fix the chart owners in `explainers/a3/t05-people-rules.tex` to match the plan (or drop owners from the briefing)

## Review findings to fix later
- [ ] A2's reason text repeats itself ("…ratio to the usual amount than usual"): fix in the web layer, record in `MODIFICATIONS.md`
- [ ] A 400 reports only the first validation layer's faults (`pageSize=999&status=bogus` → only `status`)
- [ ] Plotly range buttons and legend are under 44 px touch targets (T40)
- [ ] Phone scroll past a chart not verified on a real device (T38)
- [ ] Restore `EXPLORER_ASSISTANT` default to `auto` with S-05 (D-W-09)
