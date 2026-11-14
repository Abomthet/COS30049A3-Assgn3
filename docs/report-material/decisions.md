# Decisions for the architecture section

Three sources. **D-A3-1 to D-A3-11** are from `docs/plan/sections/s03-decisions.tex`; the plan says they are proposals
until the Week 9 meeting records them. **D-W-01 to D-W-15** are from `docs/WORKLOG.md`. The "As built" column is the state
found in the repository on 12 Nov 2026, checked against the files named in it; it is not a test result.

## A. Plan decisions (D-A3-1 to D-A3-11)

| ID | Decision | One-line reason | As built |
|---|---|---|---|
| D-A3-1 | A new, private repository; A2's runtime copied in with hashes; never public before marks are released | The brief wants the model code in the back end's zip; A2's repository is over 200 MB and under marking, so it does not change; the saved models name their classes by module path, so the package keeps the name `explorer` | Yes: `backend/explorer/` vendored, hashes in `backend/A2_VENDOR.json`, `tools/vendor_a2.py --check` (WORKLOG D-W-06) |
| D-A3-2 | The front end grows from the Assignment 1 prototype (React, TypeScript, Vite, its design system, hash router, tests) | A1 promised the screens would move to real data without a rewrite, and the prototype already has the states, validation, responsive layouts and accessibility work | Yes: `frontend/` from `asm1_demo` @ `8375cf0` (WORKLOG 11 Nov) |
| D-A3-3 | Plotly.js for every chart, behind one wrapper | Named in A1's WBS; zoom, pan, range slider, hover tooltips, legend toggles and PNG export are built in, so the effort goes into what the charts say | Yes: `frontend/src/charts/` (G1 to G6 through `PlotlyChart.tsx`) |
| D-A3-4 | Axios for every request: one instance with a base address, a time limit, cancellation and an error interceptor | A1's dictionary says "call the API with Axios"; cancellation and time limits are what the live what-if needs | Yes (WORKLOG 11 Nov, "One client, one error type") |
| D-A3-5 | A1's API kept and extended; validation errors answer 400, not 422 | FastAPI answers 422 for a failed validation, but A1 gave 422 the meaning "too little history to score"; keeping them apart maps each status to one state | Yes: 400 on validation and 422 for insufficient history in the schema (E7, E8, E9, E12) |
| D-A3-6 | The baseline decides the flags; the other eight methods are a view (selector S-01) | The models stay frozen (W-06), yet all nine reach the interface | Yes: the threshold comes from E2 (5.0); the method menu (`frontend/src/components/MethodMenu.tsx`) |
| D-A3-7 | The Must tier works with no internet; only the live lookup (S-09) calls Esplora | A1's risk 15 fires if the app needs a live call to run | Yes for the Must tier. S-09 is not built, so no live call exists |
| D-A3-8 | No accounts; preferences in the browser; the watchlist in one SQLite file | The brief asks for no login; a small store gives the API its PUT and DELETE and gives the interface something personal to remember | Yes: watchlist in SQLite (WORKLOG "Wave A back end"); preferences in one local-storage key (`explorer.preferences.v1`) |
| D-A3-9 | The Assistant is optional, guarded, cached and never streamed | A2's plan made it optional and off by default; showing text token by token would display words the guardrail has not checked | Back end only: E12 and `backend/app/services/assistant_service.py` (Mod-9). `frontend/src/api/endpoints.ts` has no call to E12, so no screen uses it. Weights kept (D-W-07) |
| D-A3-10 | One pinned environment per tier (`cos30049-a3` for Python 3.11; `package-lock.json` for Node) | A different scikit-learn prints a version warning for every model, and the rubric's execution line says "without errors or warnings" | Files exist: `backend/environment.yml`, `backend/requirements.txt`, `backend/requirements-assistant.txt`, `frontend/package-lock.json`. Not re-checked here against the versions in the plan |
| D-A3-11 | Two terminals, one origin: Uvicorn on 8000, Vite on 5173, Vite proxies `/api` | It is the layout the unit teaches (a React server and a FastAPI server); the proxy removes the most common first-run failure | Yes per `docs/HANDOFF.md` §5 and the README. "One-command mode" (C-05, serving the built front end from FastAPI) is a Could item and not checked here |

## B. Work-log decisions (D-W-01 to D-W-15)

| ID | Date | Decision | One-line reason | Status on 12 Nov 2026 |
|---|---|---|---|---|
| D-W-01 | 11 Nov | Local git repository on `main`; a private remote only with the user's approval | Keeps the history local until the user approves the remote (D-A3-1) | Done; the remote was approved and made private (D-W-08) |
| D-W-02 | 11 Nov | Node v24.22.2 installed per user into `~/.local`, checksum verified | No Homebrew or sudo on the Mac | Done |
| D-W-03 | 11 Nov | A3 loads A2 at commit `aa56a26` | It is the submitted zip plus wording-only edits, and loads the same models and settings values | Done (see D-W-06) |
| D-W-04 | 11 Nov | One settings file: `backend/config/settings.json` | Thresholds and wording in one place for both tiers | Done |
| D-W-05 | 11 Nov | Work split by tree (back end, front end) for the cooks | Two parallel packages cannot collide | Process, in use |
| D-W-06 | 11 Nov | A2's `v1.0` tag points at `aa56a26` (annotated, local) | The tag names the build the back end loads; the findings are in the tag message | Done locally; pushing the tag is open (HANDOFF §9) |
| D-W-07 | 11 Nov | The Assistant's weights are kept as a verified copy outside git | S-05 can run with real weights, not prepared answers only | Done (`~/Desktop/COS30049/A2_submitted_artifacts/`, copied into `backend/models/assistant/`) |
| D-W-08 | 11 Nov | Remote `Defaul119/COS30049A3`, switched from public to private before the first push | D-A3-1: never public before marks are released | Done |
| D-W-09 | 11 Nov | `EXPLORER_ASSISTANT` defaults to `off` until S-05 builds E12, then back to the plan's `auto` | E1 would report the Assistant ready for an endpoint that did not exist | **Conflict.** `backend/app/core/config.py` line 170 now defaults to `"auto"`, and E12 exists. The restore is not recorded in the WORKLOG |
| D-W-10 | 11 Nov | Thresholds only from E2 (the tuned 5.0), never `settings.json` `baseline.flagAbsZ` (3.5) | 3.5 is A1's untuned default and must not reach the screen | Done (T17) |
| D-W-11 | 11 Nov | The limitation line on every CSV row, not only flagged rows | The wording rule says every export carries it | Done (commit `2bde9b8`). **Conflict** with the plan's E10 text (see C below) |
| D-W-12 | 11 Nov | E6 and E10 `sort=amount` order by absolute amount | Sorting by signed amount put every received transaction before any sent one | Done (Mod-14) |
| D-W-13 | 12 Nov | BTC amounts in server text written to 8 decimal places, in the web layer | A2's `format_btc` strips zeros, so the explanation and the screen disagreed | Done (Mod-12); A2's file untouched |
| D-W-14 | 12 Nov | Model by type of work: Opus or Fable for gates and review; Sonnet for routine features; Haiku for mechanical work | With every cook at high effort, two five-hour windows ran out | In force (the A-back package used Sonnet at medium, about 130k tokens) |
| D-W-15 | 12 Nov | CR-08 (live lookup) approved by the team; S-09 is wave B2; off by default | The Must tier still needs no network (D-A3-7) | Approval reported by the user; the minutes are not yet recorded. **Not built**: no E16 to E20 in `backend/openapi.json` |

## C. Conflicts and deviations to resolve before the report

1. **D-W-09 against the code.** The work log says the Assistant defaults to `off` until E12 exists. E12 exists in the
   schema (`backend/openapi.json`, "POST /api/explanations") and the code, and `backend/app/core/config.py` line 170 reads
   `_choice(environ, "EXPLORER_ASSISTANT", "auto", ("auto", "off"))`. The architecture section should say `auto`, and the
   WORKLOG should record the change.
2. **E10 wording.** The plan (`docs/plan/sections/s06-api.tex`, E10) says the CSV carries "on flagged rows, the limitation
   line". D-W-11 (WORKLOG, commit `2bde9b8`) puts the line on every row. The built behaviour follows D-W-11, which the
   wording rule requires. The plan text should be changed, or the report will quote a rule the code does not follow.
3. **Recording the decisions.** The plan's minutes table asks for D-A3-1 to D-A3-11 to be recorded at the Week 9 meeting
   (by 13 Nov). Nothing in the repository records that meeting yet; the only recorded approvals are CR-08 and the tutor's
   answer on AI (WORKLOG 12 Nov).
4. **Assistant status.** D-A3-9 says the Assistant is shown on request. Back end: built (E12). Front end: no screen calls
   E12 (`frontend/src/api/endpoints.ts`). The report's section 5 ("the Assistant's guardrail") must say which part exists.
