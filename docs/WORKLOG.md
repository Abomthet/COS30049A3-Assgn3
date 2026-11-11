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
