# Engineering work log — COS30049 Assignment 3

The running record behind the technical documentation and the report. Each entry says **what was
done, why, what was decided, what was measured, and what is still open**, so the report's architecture,
implementation and AI-integration sections can be written from it without archaeology.

How the work is organised: one lead (Claude Opus 5.5) plans, writes task specs, reviews and integrates;
Claude Sonnet 5.5 subagents at high effort ("cooks") build bounded work packages in separate parts of
the tree. Cooks do not commit; the lead reviews each package, runs its checks and commits it.
Task numbers (T01–T52) and scope IDs (M/S/C/W, E/V/G) are from `docs/plan/main.pdf`.

Entry format: `## YYYY-MM-DD — title`, then **Context / Decisions / Done / Evidence / Open**.

---

## 2026-11-11 — Kick-off: repository, toolchain, first delegation

**Context.** The plan (`docs/plan/main.pdf`, 69 pp.) and the team briefing (`../explainers/a3/a3.pdf`,
17 pp.) were read. On disk, `COS30049A3/` held only `docs/`. MS1 (walking skeleton) is due Sun 15 Nov.

**Decisions.**
- **D-W-01 Repository.** `git init` on `main`, local only. A private GitHub remote waits for the user's
  approval (D-A3-1: never public before marks are released). Commit identity: `Defaul119` with the
  GitHub noreply address.
- **D-W-02 Node runtime.** The Mac had no Node and no Homebrew/sudo. Node **v24.22.2 LTS** (darwin-arm64)
  was installed per-user into `~/.local/node`, with `~/.local/bin` symlinks; the tarball was checked
  against nodejs.org's `SHASUMS256.txt`. The prototype's lockfile accepts `^22.22.2 || ^24.15.0 || >=26`.
- **D-W-03 A2 source commit.** Vendoring uses A2 commit **`aa56a26`** (head of `from-scratch`, the commit
  the plan's timings were measured on). Its `v1.0` tag is still to be confirmed by the user (T02).
- **D-W-04 One settings file.** `backend/config/settings.json` (A2's file, byte-identical at `aa56a26`)
  is the single source of thresholds and wording for both tiers. The front end imports it rather than
  keeping a copy; later it reads the runtime values from E2 `/api/config` (T16).
- **D-W-05 Work split for wave 1** (disjoint trees, so the two cooks can run in parallel):

  | Cook | Model / effort | Tasks | Writes only in |
  |---|---|---|---|
  | backend-core | Sonnet 5.5, high | T03 vendor + env + smoke, T05 schemas + `openapi.json`, T06 config/E2, T07 app factory/E1, T08 errors, T09 validation + shared vectors | `backend/`, `tools/vendor_a2.py`, `shared/` |
  | frontend-port | Sonnet 5.5, high | T04 prototype builds and tests pass on A3's layout, Axios client; T16 shell | `frontend/` |

  Lead keeps: the API contract review (T05 sign-off), cross-tier consistency, commits, this log.

**Done.**
- Repository initialised; `.gitignore` (Node, Python, `backend/var/`, LaTeX build files).
- Prototype `asm1_demo/frontend` @ `8375cf0` copied to `frontend/` (without `node_modules`, `dist`).
  `npm ci` succeeded. **Baseline before any change:** `npm test` → 6 of 6 test files failed to load;
  `npm run build` → `TS2307: Cannot find module '../../../config/settings.json'` (the prototype expects
  the settings at its repo root).
- `TODO.md` (repository root): the task list built from both plans.

**Open.** A2 submitted commit and `v1.0` tag (user); private remote (user); tutor's answer on
generative AI (team); CR-07 and CR-08 votes (team).

## 2026-11-11 — Which Assignment 2 build A3 loads (T02)

**Context.** The plan needs the submitted A2 commit tagged so the back end can name the models it
loads. The repository had no `v1.0` tag. The submission folder was downloaded from the team drive
(`COS30049A2_submisison-…zip`, 881 MB: code zip, report `main_v2.pdf`, minutes, contribution form).

**Method.** The inner code zip (449 files) was compared with every A2 commit since 6 Nov by git blob
hash, with CRLF normalised (the zip was built on Windows). Python files were also compared by AST with
docstrings blanked, and `settings.json` with every `_`-prefixed comment key removed.

**Findings.**
- Best match: **`aa56a26`**, equal to its three parents from 7 Nov. 431 files are byte-identical.
- 14 files differ, all **wording only**: comments, docstrings, the `_` comment keys in
  `settings.json` (every value is identical), a status string in `glossary.jsonl` and `make_glossary.py`,
  and the README and model/data cards. No code path or number differs.
- 4 files in the zip are not in git: `SHA256SUMS.txt`, `models/heist_best.joblib` (not used, W-04) and
  **the Explorer Assistant's weights** `models/assistant/model.pt` (610 MB) and `tokenizer.json`. All
  three match the zip's own `SHA256SUMS.txt`.

**Decisions.**
- **D-W-06** A2 tag `v1.0` → `aa56a26` (annotated, local, with the findings in the message). A3
  vendors from `aa56a26`, which loads the same models and settings values as the submission.
- **D-W-07** The Assistant's weights are no longer missing: a verified copy is kept at
  `~/Desktop/COS30049/A2_submitted_artifacts/` (outside git; the 610 MB file is git-ignored in A2 too).
  S-05 can run with real weights rather than prepared answers only.
- **D-W-08** Remote: `github.com/Defaul119/COS30049A3`. It already existed (empty, created 10 Nov) but
  was **public**; it was switched to **private** before the first push (D-A3-1).

**Open.** Pushing A2's `v1.0` tag (local only for now).

## 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed

**Delegated to** the frontend-port cook (Sonnet 5.5, high effort): 68 tool calls, ~13 min.
**Lead review:** re-ran `npm test` (9 files, **106 passed, 1 skipped**), `npm run typecheck` (clean)
and `npm run build` (clean; JS **366.6 kB, 120.1 kB gzip**; CSS 25.1 kB). Wording check: no banned
word in `frontend/src`. One comment corrected (the dev proxy answers 502, not 500). Commits `271642a`
(the work) and `a4727d0` (rename `screens/` → `views/`, `styles.css` → `styles/base.css`, to match
the plan's layout; flat `views/` for now, one folder per view when V4–V8 arrive).

**Root cause of the baseline failure.** One import: `src/lib/settings.ts` read
`../../../config/settings.json`. Every test loads `tests/setup.ts` → the mock → `settings.ts`, so all six
test files failed at load. Fixed by importing `backend/config/settings.json`; no copy, no alias
(Vite already allowed the repo root).

**Design notes for the technical document.**
- **One client, one error type.** A single Axios instance (D-A3-4) owns the base URL, the time limit
  (`web.requests.timeoutMs`, 10 s) and cancellation. A response interceptor turns every failure into an
  `ApiError`, so views switch on `error.body.status` and never see Axios. A reply without the service's
  JSON body (such as the dev proxy's empty 502 while Uvicorn is stopped) is treated as "no answer",
  not as a server error.
- **Cancellation by signal.** Every API method takes an `AbortSignal`. `useRequest` aborts on unmount
  or when its key changes, so a stale answer can never overwrite a newer one. The mock honours the
  same signal, so tests cover cancellation without a server.
- **Service status drives recovery.** A provider polls E1 every `healthPollSeconds` (15 s), and at once
  after any network, timeout or 503 failure. It reports checking, ready, starting or unreachable, each
  with a next action. When the service is back, views that failed for those reasons reload by
  themselves: recovery without a click, and without a query library.
- **Settings: the service first, the bundled file as the floor.** The shell reads E2 at start and
  after each recovery. Until then it uses the bundled `settings.json`, so limits and the limitation
  line are always present; only the snapshot details need the service.
- **Fault isolation.** The error boundary sits inside `<main>` and resets on navigation, so a crash in
  one view leaves the header, the navigation and the status indicator working.
- **Preferences** live in one versioned local-storage key (`explorer.preferences.v1`), with a session
  fallback when storage is blocked. The theme follows the system until the user chooses.

**Choices where the plan was silent** (accepted): default API mode `http` with a same-origin base URL;
a fourth status `checking` until the first E1 answer; placeholder pages for `#/models`, `#/watchlist`,
`#/about` so navigation never leads to "not found"; toasts only on a status change.

**Carried to the view work.** Offline banner; 429 countdown; per-call time limit (the Assistant's 90 s);
`useRequest` keeping the previous data while refreshing; the prototype banner and tools (T17).
**Contract handshake.** The front end's expected E1/E2/error shapes were sent to the backend cook;
any difference from the plan is resolved in the plan's favour.

## 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed

**Delegated to** the backend-core cook (Sonnet 5.5, high effort): 80 tool calls, ~23 min.
**Lead review:** re-ran `pytest` (**135 passed**, warnings are errors) and `tools/vendor_a2.py --check`
(all hashes match). Started Uvicorn and called E1, E2, an unknown path (404 `not_found`) and a wrong
method (405 `invalid`): all as specified, request IDs on every body, no warnings in the log, "ready"
0.7 s after start. Checked the one surprising dependency, `httpx2`: it is the pydantic organisation's
package, and Starlette 1.10's own test client imports it and warns when it finds `httpx`.
Checked what would be committed: 89 files, the largest 17 MB (`txgpt_method.joblib`); the 610 MB weights
are git-ignored. Commit `5a690f1`.

**Lead change.** E1 said `assistant: "ready"` and E2 `capabilities.assistant: true` because the weights
file exists, but E12 does not exist yet, so the front end would offer a button that returns 404.
**D-W-09:** `EXPLORER_ASSISTANT` defaults to `off` until S-05 adds E12, then goes back to the plan's
`auto` (s05, environment table). Two tests updated to match.

**Measured.** Running example `1Bbcsfxj…3dz`: 377 transactions, 367 scored, 3 flagged on 3 days;
what-if 0.05 BTC out scores 5.98 (both as in the plan). Import 1.3–1.5 s, `Predictor.load()` 0.74 s,
about 2.3 s in total on a warm run; about 5 s cold.

**Design notes for the technical document.**
- **Copying with proof.** A2's runtime is copied from a commit (`git cat-file`), never from a working
  folder. The file list is found by running the entry points (`Predictor.load`, `score_address`,
  `score_what_if`, `txgpt_surprisal`) in a clean interpreter under an audit hook, so it cannot drift
  from what the code needs. `A2_VENDOR.json` stores each file's SHA-256, and a test recomputes them.
  `.gitattributes` marks the folders `-text` so Windows line-ending conversion cannot change a hash.
- **Models load once, in the background.** The Predictor loads in the lifespan on a worker thread and
  is shared read-only. While it loads, E1 answers 503 `unavailable`, which lets the front end tell
  "starting" from "down". A failed load is logged and E1 keeps answering 503.
- **One error body, one place.** `core/errors.py` alone chooses statuses and builds bodies. Services raise
  A2's `Unsupported` (404) or `InsufficientHistory` (422), or typed API errors. Validation becomes 400
  with per-field messages. No trace, path, library text or echoed input reaches a client; the real
  text is logged under the same request ID.
- **One address checker, two tiers.** `core/validation.py` ports the prototype's Base58Check, Bech32
  and Bech32m checker. `shared/address_vectors.json` (53 addresses, 9 transaction IDs: snapshot
  addresses, BIP 173/350 vectors, and hand-built cases where the checksum is valid but one rule fails)
  is read by pytest now and by Vitest later. The two checkers agree on every entry except the
  server-only 100-character limit.
- **Configuration in one place.** Every web limit is in `settings.json` → `web`, validated by Pydantic
  models that reject unknown or missing keys. E2 passes the block on unchanged, so the browser checks
  the same numbers the server enforces. Environment variables only choose what a machine may do (CORS
  origins, live lookup, Assistant, log level).
- **Contract first.** camelCase schemas for E1–E11 match A1's `types.ts` field for field (a test
  parses `types.ts` and compares names, optionality and nullability). `openapi.json` is exported with
  the contract-only schemas merged in, and a test keeps the committed copy current.

**Deviations accepted.** `httpx2` instead of `httpx` (see above); the exporter is
`python -m app.core.openapi` rather than `tools/export_openapi.py`; invalid JSON → 400 and a wrong
Content-Type → 415; E2 feature units (`BTC`, `count`, `hours`, `ratio`) are typed in
`system_service.py` because A2 records none.
**Carried forward.** OpenAPI still shows FastAPI's default 422 for parameterised routes (given to the
endpoints cook); the 413 body limit and ETags are not built yet; Mod-10's fail-fast start is not built.

## 2026-11-11 — Wave 2 started
- **charts** cook: T23 Plotly wrapper, T24 G1, T26 G3, against the mock (`frontend/` only).
- **backend-endpoints** cook: T10 store and cache, T11 E3–E5, T12 E6–E7, T13 parity and wording
  tests over the 28 addresses, the OpenAPI 400 fix, and timings (`backend/` only).

## 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed

**Delegated to** the charts cook (Sonnet 5.5, high effort): 79 tool calls, ~19 min.
**Lead review:** re-ran `npm test` (12 files, **168 passed, 1 skipped**), typecheck and build (clean).
Bundle: main JS **374.4 kB / 123.8 kB gzip** (+3.8 kB gzip), Plotly a separate on-demand chunk of
**1,446 kB / 478 kB gzip**, CSS 23.4 kB. Checked the Plotly package's publisher (Plotly's own
maintainers) and publish date (4.1.2, 5 Oct 2026). Wording check clean. Commit `eeefa9c`.
**Process note.** The cook ran `git rm` on the removed chart files against its instructions and
reported the index as clean; three paths were still staged. It was harmless, because the same changes
were being committed, but cook reports are checked against `git status`, not taken at their word.

**Finding: two sources for the flag threshold (D-W-10).** The Explorer's flag line is the *tuned*
threshold saved with A2's baseline model (`Predictor.flag_abs_z()` → `methods["baseline"].threshold`
= **5.0**). `settings.json` → `baseline.flagAbsZ` (**3.5**) is A1's untuned default, used only as a
fallback when no model is loaded. The back end is right (E2 reports 5.0). The front end's bundled
fallback (`lib/settings.ts`) and the mock (`api/mock/mockApi.ts`) read 3.5. **Decision:** E2 (or a
response carrying the method) is the only source of thresholds in the browser. The bundled fallback
must not invent one, and the mock takes the tuned value from fixtures recorded from the real API.
Assigned to T17.

**Design notes for the technical document.**
- **One wrapper; a chart is a figure function.** Every chart goes through `PlotlyChart`. A chart
  supplies its words, its table and `figure(context)`, which returns Plotly data and layout for the
  current theme and size. The wrapper adds what the contract promises for all charts (theme, tool
  bar, exports, states, keyboard, resizing), so the contract is tested once and a new chart is one file.
- **Plotly is loaded on demand, and failure is a state.** Only `plotlyLoader.ts` imports Plotly, by
  dynamic `import()`, so it ships as a separate chunk that the first screen never fetches. A failed
  fetch is not cached, so "Try again" retries; if loading or drawing fails, the chart's table takes its
  place and the numbers stay reachable.
- **Theme from CSS tokens.** Plotly cannot read CSS, so `chartTheme.ts` reads the stylesheet's tokens
  after the theme attribute changes and passes them in. Light and dark share one definition, and a theme
  switch redraws in place, keeping the zoom (`uirevision`).
- **Accessibility rebuilt around Plotly.** The chart sits in a focusable group with the prototype's keys
  (arrows, Home, End, Enter). Each key calls `Plotly.Fx.hover`, so keyboard users see the same tooltip as
  mouse users, and a live region reads it out. Screen readers get the same data as a table. An unusual
  item is never shown by colour alone: it is orange, has a triangle, and says so.
- **The PNG is a deliberate copy.** Export draws an offscreen 1200×675 figure from the current zoom,
  with the title and caption, without the range slider, on an opaque background. The image explains
  itself whatever the window size or theme.
- **Library choice.** `plotly.js-cartesian-dist-min` is the smallest prebuilt Plotly with bar, scatter,
  WebGL scatter and heat map, which G1–G9 need. A custom `plotly.js/lib/core` build would be smaller,
  but Vite cannot compile Plotly's glslify shaders. `chunkSizeWarningLimit` was raised to 1500 kB for
  that one chunk; the first-screen budget is checked from the build report instead.

**Carried forward.** Plotly's range buttons and legend are below the 44 px touch-target size (for T40,
the accessibility inspection). Scrolling past a chart on a real phone is not verified, since Plotly may
capture the drag (T38 and a real-device check). E2's `features` (names, units) is not yet in the
front end's `AppSettings`, so G3 formats units by feature id (for T17).

## 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1)

**Delegated to** the backend-endpoints cook (Sonnet 5.5, high effort): 62 tool calls, ~20 min.
**Lead review:** `git diff --cached` empty (no stray staging); `vendor_a2.py --check` passes (vendored
files untouched); `pytest` **478 passed** (343 new), warnings are errors. E6's paged shape was checked
against the plan (s06 E6: "A1, extended", answers `address, date|null, transactions, page, pageSize,
total`): it matches. Live probe: E3 lists 28; E4 for an address outside the snapshot → 404
`unsupported` with three examples and `canLookupLive:false`; E5 for the running example → 377 tx,
367 scored, 3 flagged on 3 days; E6 `status=flagged&sort=-score` → 3 rows (scores 5.61, 5.19, 5.11);
E7 → flagged, the limitation line present, all nine methods' flags; a bad query → 400 with field
errors; `If-None-Match` → **304**; no warnings in the server log. Commit `fd2d796`.

**Measured** (Uvicorn over HTTP, gzip; warm = median of 30, cold = cache cleared):

| Request | Running example cold / warm | Largest address (700 tx) cold / warm | Body (gzip) |
|---|---|---|---|
| E5 timeline | 57 / 1.5 ms | 102 / 1.5 ms | 11.6–18.4 kB (1.2–1.5 kB) |
| E6, 50 rows | 97 / 1.5 ms | 104 / 1.5 ms | 12.5–13.0 kB (3.3–3.6 kB) |
| E6, 200 rows | 58 / 2.8 ms | 104 / 2.8 ms | 52 kB (13 kB) |
| E7 | 59 / 1.4 ms | 103 / 1.5 ms | 2.7–2.9 kB (1.2–1.3 kB) |

All within the plan's budgets (s10.3: E5 150 ms, or 20 ms cached; E6 page of 200 within 150 ms; E7
150 ms; timeline body 60 kB; one transaction 6 kB). Warming all 28 addresses: ~1.2 s and ~51 MB, after
"ready", so the 10 s start budget is untouched.

**Design notes for the technical document.**
- **One scoring, three views.** `score_address` returns up to 2 MB, so the service scores an address once
  per method, keeps the result and cuts it into the timeline (11–18 kB), a filtered, sorted, paged
  list, and one transaction (under 3 kB). Endpoints only filter, sort, page and pick; nothing is
  recomputed. Parity tests rebuild the whole `score_address` result from those pieces for all 28 addresses.
- **An address store behind one interface.** Services read an address through `AddressStore.get` (its
  features, transactions, scores and source, or `Unsupported`). `SnapshotStore` splits the frozen tables
  once at start. A live store (S-09) only implements the same two methods.
- **A bounded, warmed, per-method cache.** One entry per (method, address), least-recently-used
  eviction, capacity of one snapshot (28 entries, ~51 MB). It fills lazily and is warmed for the
  default method after "ready", so a warm view takes ~1.5 ms. A non-default method shares the loaded
  tables (`dataclasses.replace(predictor, selected=m)`) and never disturbs the default entries.
- **Short-history addresses stay visible.** `score_address` raises for them, but the screen must list
  their transactions unscored, so their timeline and rows come from the feature table (E5/E6 200).
  E7 answers 422 `insufficient_history` with the transaction's own history, the same body for a
  short address and for an early transaction of a normal one.
- **Layered validation, always 400.** Pydantic checks types and enums; `core/validation` checks
  addresses, transaction IDs and days; the service checks rules that need settings or two fields (page
  size, day order, `date` versus a range). Limits come from `settings.json` → `web`. Bodies over
  `maxBodyBytes` are refused with 413 by a middleware that reads at most one byte past the limit.
- **Revalidation without state.** An innermost middleware hashes the finished JSON (inside gzip, whose
  timestamp would otherwise change the hash) and answers 304 on a matching `If-None-Match`. Routes opt in
  with `Cache-Control: no-cache` through one dependency. No version table, and the tag changes exactly when
  the answer does.

**Choices accepted:** `sort=amount` is by signed `netSats`; unscored rows sort last both ways; unknown
query parameters are a 400; `page` past the end is an empty 200 with the real `total`.
**Found in review, carried forward:**
- (a) A2's reason text can repeat itself ("Lower ratio to the usual amount than usual"). It comes from the
  frozen `explorer/explain.py`; any fix belongs in the web layer and in `MODIFICATIONS.md`.
- (b) A 400 names only the first layer's faults: with `pageSize=999&status=bogus` only `status` is
  reported, because the type check stops before the page-size rule.
- (c) E2 has no ETag (the plan lists only snapshot GETs).

## 2026-11-11 — T17 started (front-end half of MS1)
**frontend-views** cook: aligns `types.ts` with the real E3–E7, applies D-W-10 (thresholds only from E2),
adds E2's `features`, records fixtures from the real API in place of the illustrative mock data, makes
Vitest read `shared/address_vectors.json`, puts V1–V3 on the real API and removes the prototype banner.
**backend-whatif** cook started in parallel: T14 (E8, E9 with the batched feature build and its parity
test, which must be shown to catch a planted bug) and T15 (E10 export, E11 methods). `backend/` only.

## 2026-11-11 — T17 reviewed; **MS1 passed** (4 days early)

**Delegated to** the frontend-views cook (Sonnet 5.5, high effort): 87 tool calls, ~18 min.
**Lead review:** `npm test` **244 passed, 0 skipped** (the D1-sample skip is replaced by the shared
vectors: 52 browser-checkable entries, all agreeing with the server's checker), typecheck and build
clean, wording clean, index clean. Looked at the cook's screenshots against the real API (desktop
transaction view, phone transaction view): real data, the flag line at ±5, the nine verdicts, the
limitation line. Commit `610331d`.

**Cook claim found false: "the mock is not in the production bundle".** The build emitted a 32 kB
`mockApi` chunk, because `api/client.ts` imported the mock statically. **Lead fix:** both mock imports
(`client.ts`, `main.tsx`) now sit under a condition written on `import.meta.env.VITE_API_MODE`, which
Vite replaces with a literal at build time, so production folds it away. Checked: no mock strings and
no fixture addresses in `dist/`. The first screen downloads the same ~124 kB gzip as before, now in one
request instead of three; the old chunk was mostly shared code that the static import always loaded.

**Contract drift caught by running live** (by the cook): E5's `range.start`/`end` are timestamps,
not day keys; G1 and the tiles would have broken on real data. Fractional `spanDays` now prints as
"under a day" or whole days.

**MS1 gate, run by the lead from a fresh clone of `origin/main`** (scratch folder):
`vendor_a2.py --check` passes; Uvicorn ready in ~1.3 s with a clean log; E5 answers 200 for all 28
addresses; `npm ci`, `npm test` (244) and `npm run build` are clean. The first back-end run found
**1 failure**: `test_schemas.py` parses `frontend/src/api/types.ts` and read the `null` inside
`Record<MethodId, number | null>` (added by T17) as "this property is nullable". `main` had been red
since `610331d`, because the lead ran only the front-end suite before committing a front-end package.
**Fix** (`9adf130`): `top_level_nullable()` strips nested `<…>` and `{…}` before looking for `null`
(six cases checked). Re-run in the clone: **478 passed**. MS1's conditions (both tiers from a fresh
clone; E1–E7 for all 28 with parity; V1–V3 on real data, including the unsupported and short-history
states) are met. The clone reused the existing `cos30049-a3` environment; building a fresh environment
from `environment.yml` was checked by the backend-core cook.

**Lessons recorded (process).**
- **Cross-tier tests exist** (the back end reads `types.ts`), so **both suites run before every
  commit**, whichever tier the package touched.
- **Lead slip:** while checking a bundle size, the lead ran `git stash` / `git stash pop` for a few
  seconds while the backend-whatif cook was editing `backend/`. The pop was clean (stash list empty, no
  conflict markers, the cook's files present), and the cook was told. **Rule from now on:** no
  working-tree-wide git command (stash, checkout, reset) while a cook is running. Compare builds in a
  separate clone or worktree instead.
- Cook reports are verified against the build and `git status`. Two of four reports so far contained a
  false claim (the index left "clean" while three paths were staged; "mock not bundled").

**UI observations from the screenshots** (to fix later):
- (a) On a phone, the G3 table's Role column clips ("contribut…").
- (b) Amounts are printed with different precision in the explanation and the facts ("0.0011126" vs
  "0.00111260").
- (c) The verdict table shows K-Means 6.69 and TxGPT 5.57 next to "–" while the baseline's 5.61 says
  "Flag". Each method has its own scale; G4 (S-02, score against its own threshold) is the plan's
  answer, and the verdict table could add a threshold column once E11 exists.

**Design notes for the technical document.**
- **Fixtures are recorded, not invented.** `scripts/record-fixtures.mjs` saves the service's own answers
  (E1–E3, an E4 404, E5, all E6 pages and selected E7 answers for one normal and one short-history
  address). The mock only filters, sorts and pages them, so tests and the demo mode use real shapes and
  numbers, and re-running the script refreshes both after a new snapshot.
- **The mock cannot ship.** It is reachable only through a condition on `import.meta.env`, which the
  build replaces with a literal, so production bundles contain neither the mock nor its data.
- **One flag line, from the model.** The front end draws the threshold that E2 reports (A2's tuned 5.0),
  echoed in each response's `method`. With the service unreachable it draws none rather than guess.
- **A transaction can be unscorable on a normal address.** E7's 422 covers early transactions of a
  well-covered address too. V3 handles it per transaction: the facts stay, the reason is given, and the
  next step is the address's first scored day.
- **Two checkers, one set of vectors.** pytest and Vitest both run `shared/address_vectors.json`, so the
  browser and the server are shown to accept and reject the same addresses with the same messages.
**frontend-explore** cook started: T18 (tabs, filter bar, table), T25 (G2), V7, and the two UI fixes (phone table, amount precision). `frontend/` only.

## 2026-11-11 — T14 and T15 reviewed and committed (what-if, export, methods)

**Delegated to** the backend-whatif cook (Sonnet 5.5, high effort): 108 tool calls, ~34 min.
**Lead review and changes** (commit `2bde9b8`):
- **Limitation line in every CSV row.** The cook followed the plan's E10 note (flagged rows only), which
  conflicts with the wording rule ("every export"): a CSV filtered to unflagged rows carried no
  limitation at all. Now every CSV row carries it (the JSON file states it once at the top and in
  flagged rows). Two tests that encoded the old behaviour were updated, and a test was added for a CSV
  with no flagged row. **D-W-11.**
- The what-if vectors moved to `shared/whatif_vectors.json`, where the plan puts them.
- **Verification in a clean worktree of the commit, before pushing** (the new rule): `vendor_a2.py
  --check` passes; `pytest` **570 passed** (119.8 s); `npm ci`, `npm test` (244), typecheck and build
  clean; Uvicorn under `-W error` starts clean; live E8 (0.05 BTC out: flagged, 5.98, limitation
  present), E9 (41 points, usual 0.000525 BTC, 8 methods), E10 (`text/csv`, `attachment;
  filename="1Bbcsfxj-2026-10-22.csv"`), E11 (baseline threshold 5.0).

**Parity of the batched curve (the T14 claim that matters).** Batch against single `score_what_if`
calls over 6 addresses (the running example; the largest; the one with the fewest scored; the oldest;
a Taproot address; a mid-sized one) × both directions × 3 times (the first scorable moment, the exact
second of a real transaction, a day after the last) × 41 log-spaced amounts (0.000001–10 BTC).
- **Flags equal everywhere.**
- **Scores** exactly equal for baseline, Isolation Forest, LOF, DBSCAN and regression range. Within
  4.3e-14 (regression), 7.1e-15 (fusion) and 8.9e-16 (k-means): BLAS summation order. Two identical
  single calls differ at the same level, and the features themselves are bit-identical. Tolerance 1e-12.
- The full grid (1,517 amounts, 8 min 16 s) runs under `PARITY_FULL=1`. The default run spot-checks it
  in ~40 s and always checks the running example's full 41-point curve.
- **Planted bugs:** dropping the newest earlier row failed 15 of 20 parity tests. Three meta-tests stay
  in the suite and plant bugs (newest earlier row dropped; same-second real row counted as history;
  hypothetical rows staggered in time) to prove the check fails.

**Measured** (Uvicorn, warm median of 7):

| Request | Running example | Largest (700 tx) | Budget | Plan's measurement |
|---|---|---|---|---|
| E8 | 267 ms (cold 339) | 340 ms | 700 ms | 400 ms |
| E9, 7 amounts | 156 ms | — | — | 160 ms |
| E9, 41 points (default) | 200 ms | 342 ms | 1.5 s | 180 ms |
| E9, 61 points | 165 ms | 238 ms | 1.5 s | — |
| E10 CSV (295 kB) | — | 21 ms (cold, uncached method: 120) | — | — |
| E11 | 1 ms | | — | — |

The default curve builds twice (a probe build finds the usual amount), which is why 41 default points
on the largest address cost more than 61 explicit ones.

**Design notes for the technical document.**
- **Why one batch is valid.** A2's `build_features` never treats rows at the same second as each
  other's history. All hypothetical rows share one timestamp, so none sees another, and one build
  scores them all. Staggering their times is exactly the bug the third meta-test plants.
- **Exact where it can be, bounded where it cannot.** Flags and five methods are exactly equal; three
  methods differ by BLAS summation order (≤ 4.3e-14), the same noise as between two identical single
  calls. The test states that tolerance and why.
- **One 422 for "not enough history".** `score_what_if` returns an unscored row when history exists but
  is under the minimum, and raises when there is none. E8 and E9 turn both into the same 422 with the
  counts and the first scorable date.
- **The export is the screen.** E10 reuses E6's cached view and filters, so the file lists exactly
  what the table shows. Amounts are formatted from integer satoshis with A2's own `format_btc`. Text
  cells that start like a formula (`=`, `+`, `-`, `@`, tab, CR) get a leading apostrophe; numbers stay
  numbers.
- **Scoring once per batch.** Scoring through `fusion.Cached` instead of a score pass and then a flag
  pass halved batch scoring (≈0.26 → 0.13 s for 41 rows) without reimplementing A2's flag logic.

**Choices accepted:**
- Mod numbering follows the plan (batch = Mod-5, 422 = Mod-6).
- E9 accepts a list, a log range or the default.
- The default curve answers 400 on `direction` when that direction has no history at that time.
- `maxGapYears` uses 365.25-day years.
- JSON export in satoshis.
- E11's `burst` is A2's per-transaction recall.

**Carried forward:**
- The back-end suite now takes ~2 min (from 33 s): the wording and parity grids. Consider a `-m "not slow"`
  marker for inner loops, with the full suite before every commit.
- A Uvicorn on port 8000 started detached (parent `launchd`) was still running after the cook
  reported "servers stopped". Owner unclear (it may be the explore cook's test server); cleared once
  no cook is running.
**backend-hardening** cook started: web-layer rewording of A2 reasons, one 400 for every faulty field, `slow` marker, ETag on E2, README draft (every command run). No Should items before MS2 (risk 6).

## 2026-11-12 — Usage limit hit mid-wave; both cooks resumed
Both running cooks (frontend-explore, backend-hardening) stopped on an API usage limit (HTTP 429, monthly
spend / 5-hour window) on the night of 11 Nov. Their unfinished work stayed on disk and uncommitted,
and nothing was half-committed: commits are only made by the lead after review, so an interrupted cook
leaves the repository consistent at `9715eea`. After the reset both were resumed from where they stopped
(not restarted), so no work was repeated.
**Lesson for planning:** high-effort Sonnet cooks cost about 200–300k tokens per package. Two in parallel
plus the lead's reviews used up a 5-hour window in about 4 hours. Keep at most two cooks at once, and put
the next wave's most important package first.

## 2026-11-12 — T18, T25, V7 reviewed and committed

**Delegated to** the frontend-explore cook (Sonnet 5.5, high effort; stopped once by the usage limit and
resumed): 53 tool calls. **Lead review:** index clean; `npm test` **320 passed, 0 skipped**; typecheck
and build clean; main JS **400.3 kB / 130.9 kB gzip** (+6.5 kB gzip on `610331d`'s 124.4, inside the
10 kB allowance); no mock in `dist/`; wording clean; `types.ts` unchanged. Looked at the transactions
tab (desktop) and the About page screenshots against the real back end. Verified in a clean worktree
of the commit: back end **570 passed**, front end 320 passed, build clean. Commit `867c2f9`.

**Back-end findings passed to the hardening cook** (it was editing that code):
- (a) E6 `sort=amount` ordered by signed `netSats`, so "largest first" put every received transaction
  before any sent one. **D-W-12:** sort by absolute amount.
- (b) A2's `format_btc` strips trailing zeros, so the explanation said "0.0011126 BTC" while the screen
  says "0.00111260 BTC". **D-W-13:** BTC amounts in server text are normalised to 8 places in the web
  layer (the plan: "amounts to eight places"); the vendored file is unchanged.

**Server ownership resolved.** The explore cook reports the Uvicorn on :8000 (pid 96319) and the Vite
on :5173 (pid 98068) as its own, and stopped both by PID. This corrects the lead's earlier guess (from
start times) that 96319 was an orphan of the endpoints cook. No stray servers remain.

**Design notes for the technical document.**
- **The URL is the filter state.** One `Filters` object, parsed from the route's query string
  (`lib/transactionFilters.ts`), feeds the filter bar, G2 and the table; none keeps its own copy.
  Serialisation uses a fixed key order, so equal filters give equal links and equal request keys. The
  browser applies the server's rules with the server's wording, and nothing is sent while a date is
  invalid.
- **Pages joined for the chart, not for the table.** G2 needs every matching transaction, so
  `useAllTransactions` fetches E6 pages of 200 in time order (rows cannot move between pages), draws
  after the first page, keeps the previous rows while refreshing, and is cancelled by a filter change.
  The table pages 50 at a time.
- **Zoom and filters stay in step.** Dragging G2's time axis writes `from`/`to`, and reset clears them.
  Plotly reports its own redraws as relayout events, so the wrapper ignores events during a redraw;
  without that guard the dates drifted in a loop.
- **Status and direction never by colour alone.** Orange triangle (unusual), blue circle (not
  unusual), grey diamond (not scored); filled = received, outlined = sent; the legend names both.
  (The plan's "hollow grey" for not scored was not used, so direction stays readable on short-history
  addresses, where every point is not scored.)
- **No sideways scrolling anywhere.** Tables become cards (rows stack, cells carry `data-label`) below
  720 px for the transaction table and 560 px for chart tables. The screenshot script enforces it.

**Choices accepted:**
- Direction labels Received/Sent everywhere.
- Default sort newest first.
- Filter changes replace history.
- The main reason is shown only on unusual rows (a reason on a not-unusual row would read like a flag).
- "Flagged by n of 9 methods".
- The plan's "remember last filters" preference left out (filters live in the URL).

**Carried forward:** the About page's generated feature list lacks an "and" ("Size, Burst, Gap,
Relative size are measured"); the mock-only loading and offline shots were not re-run.
**frontend-whatif** cook started: T19 V4 what-if lab, T27 G5 (MS2 critical path first), then V5 models page (with thresholds in the verdict table) and T22 export menu. `frontend/` only, back end on port 8010.

## 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools

### Back-end hardening (commit `ee858f7`)
**Delegated to** the backend-hardening cook (Sonnet 5.5, high effort; resumed once after the usage limit):
88 tool calls. Delivered:
- **Mod-12** (`app/services/reasons.py`): A2's F4 reasons "Higher/Lower ratio to the usual amount than
  usual" become "Larger/Smaller amount relative to the usual for this direction", keyed by A2's own
  `headline()`; BTC amounts in A2's text are written to 8 places (D-W-13), checked against E7's facts.
- **Mod-13:** one 400 names every faulty field across both layers.
- **Mod-14:** `sort=amount` by absolute amount (D-W-12).
- E2 ETag; a `slow` marker (`-m "not slow"`: 431 tests in ~28 s; full: 600 in ~2 min).
- **The README draft:** every command run on the Mac except those marked as not run (the Windows block,
  `pip install`, `--assistant-weights`).
**Lead review:** index clean, wording clean (re-run after the tool problem below), vendored files
untouched, README structure checked.

### The what-if lab (commit `d57c220`)
**Delegated to** the frontend-whatif cook (Sonnet 5.5, high effort): 104 tool calls, ~27 min.
**Lead review:** `npm test` **445 passed, 0 skipped**; typecheck and build clean; main JS **139.1 kB
gzip** (+8.2); no mock or fixtures in `dist/`; wording clean. Looked at the lab (the 0.05 BTC example:
flagged 5.98 against 5.00, both crossings marked, "flagged from about 0.023 BTC upwards, and below about
0.000011 BTC") and V5 (nine E11 cards with intervals). The verdict table now has each method's flag
line, which settles the "K-Means 6.69 next to –" confusion: its line is 9.98.
**Lead fix:** CORS now exposes `Content-Disposition`, so a cross-origin page can read E10's file name
(commit `14309b2`).

### A flaky test, found and fixed (commit `89d8c6e`)
The full back-end suite failed **1 run in about 5**, both in the cooks' runs and in clean worktrees with
nothing else running. A first guess, a wall-clock ratio in `test_cache.py` (`warm < cold / 5`), was
removed (the hit counter already proves the cache), but failures continued. Recording failing test names
over repeated runs found the real cause: `test_e9_scores_equal_what_e8_answers_for_each_amount`
compared E9 and E8 **scores with `==`**, and the regression score differed in the 15th digit
(11.471391016432957 vs …962). This is the multithreaded-BLAS noise the parity tests already tolerate
(1e-12). Now flags are compared exactly and scores with the parity helper `agree()`.
**Verification:** three consecutive full runs in a clean worktree, **601 passed** each time; front end
445 passed; build clean.
**Lead mistake recorded:** `14309b2` (the CORS change) broke `test_cors_allows_the_vite_origins_and_nothing_else`,
because the lead ran only `test_http_layer.py` before committing. It was caught by the worktree run
before any push, and fixed in `89d8c6e`. The rule stands: **the full suite runs before every commit**.

### The Mac lost its Command Line Tools
At 08:24 on 12 Nov, `/Library/Developer/CommandLineTools` disappeared, so Apple's `/usr/bin/git` and
`/usr/bin/python3` stubs began asking to install the developer tools. macOS itself was not updated
(the system version dates from 13 Aug), and no installer was running. Deleting that folder needs
administrator rights, which the lead and the cooks do not have. **Workaround (no admin needed):** a
standalone git 2.56.1 in its own conda environment (`conda create -n tools -c conda-forge git`), linked
as `~/.local/bin/git` (first on the PATH). Python commands use the conda interpreters. Pushing works.
The user can reinstall the tools with `xcode-select --install`.

### Design notes for the technical document
- **One place for A2's wording.** A2's explanation template is frozen, so the web layer rewrites its
  output once (two F4 phrases; amounts to a satoshi's precision), keyed by A2's own `headline()`, so a
  change in A2's wording fails `test_reasons.py` first.
- **Two-layer validation, one answer.** Pydantic checks types; each route's service rules then judge the
  values that passed; one 400 lists every field at fault. A value that failed its type check is named
  once.
- **The real-time loop.** The form state becomes a request key, debounced by `web.whatIf.debounceMs`;
  `useRequest` cancels the older request and keeps the previous result, dimmed. "Updating" shows as
  soon as the key and its debounced copy differ (within one frame), so feedback is immediate while the
  server is asked at most once per pause. Keystroke to verdict: ~600–650 ms, including the 250 ms
  debounce.
- **Amounts are strings until the server.** The browser parses BTC amounts as digit strings (BigInt),
  never as floats, and sends the decimal string, so "0.1" is never 0.1000000000000000055.
- **The curve follows the server's flags.** G5 marks crossings between neighbouring points whose
  server flags differ, interpolated on log amount, and writes the sentence under the chart from the same
  runs, rather than re-deriving a rule in the browser.
- **Tolerances are stated, not hidden.** Wherever two code paths compute the same score (batch vs
  single, E9 vs E8), flags are compared exactly and scores within 1e-12, with the reason in the test.

**Carried forward:**
- G5's log-axis tick labels overlap at desktop width.
- Method names differ between E11 ("Robust z baseline (A1)") and the front end's own list ("Robust z
  baseline"); one source (E11) is to be chosen.
**frontend-polish** cook started (one cook only: the front end is the only Must work left before MS2): T21 state catalogue, T28 layouts and touch targets with screenshots into `docs/screenshots/`, method names from E11, the About list wording, and a front-end MS2 dry run. Should items wait for MS2 (risk 6).
