# Architecture figures for the report and the video

Three figures, each as TikZ (`.tex`), as a compiled PDF (`.pdf`) and as SVG (`.svg`). They show the code **as built on
`main`**, last checked against the files on 13 Nov 2026; they do not show what the plan intends. Where the plan and the code
differ, the code is drawn and the difference is listed in section 5.

| Figure | Files | Size at full text width (16.4 cm) | Used in |
|---|---|---|---|
| System architecture | `architecture.tex`, `.pdf`, `.svg` | about 17.7 cm tall | Report section 2 (plan `s13-report.tex`); the video's architecture segment |
| The path of one what-if | `whatif-flow.tex`, `.pdf`, `.svg` | about 14.7 cm tall | Report section 2, "the path of one what-if request" |
| One GET, and the error path | `request-lifecycle.tex`, `.pdf`, `.svg` | about 9.5 cm tall | Report section 4 (error body, status codes), or the appendix |

The colours and shapes are the plan's (`docs/plan/main.tex`, figure in `docs/plan/sections/s05-architecture.tex`): blue for
the front end, teal for the back end, violet for Assignment 2's code, grey for files, and amber for the error path. A dashed
outline or arrow means optional, or not on `main` yet.

## 1. How to rebuild

```bash
cd docs/report-material/figures
python3 make_figures.py          # writes the three .tex and the three .svg
python3 make_figures.py --pdf    # also runs pdflatex on each, keeps the .pdf, deletes .aux and .log
pdflatex architecture.tex        # each .tex also compiles on its own
```

- Both formats are written from one description in `make_figures.py` (boxes in centimetres, lines of text, arrows as
  points), so the TikZ and the SVG cannot drift apart. **Change a figure in the script, not in one output.**
- The `.tex` files need only `tikz` and `lmodern`. They do not use the `standalone` class, because this Mac's TinyTeX does
  not have it; the last lines of each file crop the page to the picture. In the report use
  `\includegraphics[width=\textwidth]{architecture.pdf}`.
- The script stops if a figure contains a word from `backend/config/settings.json` → `bannedWords`, and with `--pdf` it
  measures every line in LaTeX and reports one that is wider than its box.
- Each SVG has a white card behind it, so it reads the same on a light and on a dark page. Its fonts are the system's
  sans-serif and monospace, so line widths differ slightly from the PDF; the words and positions are the same.

## 2. `architecture`

**What it shows.** The browser application, the Vite dev proxy, the FastAPI service (middleware in its real order,
routers, services, the one error module), Assignment 2's frozen runtime, the two files Assignment 3 writes or ships, and
the optional parts.

**Caption.** *The Explorer as built: a React application in the browser reaches a FastAPI service through Vite's
same-origin `/api` proxy, and the service wraps Assignment 2's frozen `Predictor`, copied in with a SHA-256 hash for every
file. Every request passes five middleware layers, every failure is turned into one error body by `core/errors.py`, and the
dashed parts (the Assistant's weights and the live lookup, S-09) are optional or still in progress.*

| Box or arrow | Checked against |
|---|---|
| Views V1–V7, hash router | `frontend/src/App.tsx`, `frontend/src/lib/router.ts`, `frontend/src/views/*.tsx` (V4, V5, V6 and V7 name themselves in their header comments) |
| Charts G1–G6, one wrapper, Plotly on demand | `frontend/src/charts/G1…G6*.tsx`, `PlotlyChart.tsx`, `plotlyLoader.ts` (a dynamic `import()` of `plotly.js-cartesian-dist-min`), `LazyG4.tsx`, `frontend/vite.config.ts` (the chunk note) |
| Hooks | `frontend/src/hooks/useRequest.ts` (abort on a new key, session cache), `useServiceStatus.tsx` (polls E1), `useSettings.tsx` (reads E2) |
| API client, one `ApiError` | `frontend/src/api/endpoints.ts`, `http.ts` (`toApiError`), `client.ts`, `types.ts` (`class ApiError`) |
| Vite dev server, `/api` proxy, one origin | `frontend/vite.config.ts` (`proxy = { '/api': 'http://127.0.0.1:8000' }`, port 5173); decision D-A3-11 in `docs/report-material/decisions.md` |
| `settings.json`, and its two arrows | `backend/config/settings.json`; `frontend/src/lib/settings.ts` (imports the file, so it is bundled); `backend/app/core/config.py` (`load_settings`); E2 in `backend/app/api/system.py` |
| Middleware 1 to 5, and "adds them in reverse" | `backend/app/main.py` lines 130–138; the built stack was printed from `create_app().build_middleware_stack()`: RequestContext, CORS, BodyLimit, GZip, ETag, outermost first |
| What each middleware does | `backend/app/core/middleware.py`, `core/body_limit.py`; `GZIP_MIN_BYTES = 1000` in `main.py`; `web.limits.maxBodyBytes` = 10240 |
| BodyLimit → `core/errors.py` (413) | `core/body_limit.py::_refuse` calls `handle_api_error` |
| `core/errors.py` | `backend/app/core/errors.py` (`error_response`, `register_handlers`), `backend/app/schemas/errors.py` (`ErrorBody`) |
| Routers and their endpoints | `backend/app/main.py` lines 140–147 (the order drawn), `backend/app/api/*.py`, `backend/openapi.json` (14 paths, 15 operations: E1–E15) |
| Services | `backend/app/services/explorer_service.py` (the `lru_cache` keyed by method and address, `warm`), `whatif_service.py`, `whatif_batch.py`, `export_service.py`, `methods_service.py`, `store.py`, `system_service.py`, `model_service.py`, `watchlist_service.py`, `watchlist_repo.py`, `assistant_service.py`; the lifespan in `main.py` (`load_models`, `warm_cache`) |
| A2's frozen runtime, hashes | `backend/A2_VENDOR.json` (49 files: 24 in `explorer/`, 11 in `models/`, 7 in `lm/`, 5 in `data/`, 2 in `reports/`; commit `aa56a26`), `backend/MODIFICATIONS.md`, `tools/vendor_a2.py` |
| `var/explorer.db` | `DEFAULT_DATABASE` in `main.py`; `watchlist_repo.py` |
| `assistant_answers.json`, 677 answers | `backend/data/assistant_answers.json` (677 entries counted), `core/config.py` (`ASSISTANT_ANSWERS_PATH`), Mod-15 |
| Assistant weights, PyTorch, tokenizers (dashed) | `assistant_service.py` (`LIBRARIES`, `_load`), `backend/requirements-assistant.txt`, Mod-9 and Mod-16 |
| Esplora, "S-09, in progress" (dashed) | Not on `main`: no `api/live.py`, no live service, no E16–E20 in `openapi.json`. Only the hooks for it exist (`store.py`'s `AddressStore` protocol, `web.live` in the settings, `EXPLORER_LIVE_LOOKUP`, off by default). The branch was not inspected |

## 3. `whatif-flow`

**What it shows.** One what-if from a keystroke to the charts: the browser's steps, the two validation layers and their
single 400, E8 through Assignment 2's `score_what_if`, E9 through the batched feature build, and what each answer draws.

**Caption.** *One what-if, end to end: a keystroke is checked in the browser, held for `web.whatIf.debounceMs` (250 ms),
and sent as E8 and E9 while any older request is cancelled; the service checks types and then its own rules, and reports
every faulty field in one 400. E8 calls Assignment 2's `score_what_if` unchanged, and E9 builds the features of every
amount in one `build_features` call, with all hypothetical rows at the same second so that none becomes another's
history; the answers draw the verdict card, G3 and G4, and the curve G5, whose crossings follow the server's flags.*

| Step | Checked against |
|---|---|
| 1 Keystroke, form rules | `frontend/src/views/WhatIfLab.tsx` (`checkAmount`, `checkWhen`; `request` is null while a field is invalid), `frontend/src/lib/whatIf.ts` |
| 2 Debounce | `frontend/src/hooks/useDebouncedValue.ts`; `WhatIfLab.tsx` (`verdictKey`, `curveKey`); `settings.json` → `web.whatIf.debounceMs` = 250 |
| 3 Cancel the older | `frontend/src/hooks/useRequest.ts` (the effect's `controller.abort()`; the `cache` map) |
| 4 Send E8 and E9 | `frontend/src/api/endpoints.ts` (`whatIf`, `whatIfCurve`), `frontend/src/hooks/useCurve.ts` |
| 5 Layer 1 | `backend/app/schemas/whatif.py` (`Amount`, `AwareDatetime`), `schemas/common.py` (`RequestModel`, `extra="forbid"`), `api/deps.py::path_address` |
| 6 Layer 2 | `backend/app/services/whatif_service.py` (`_problems`, `_curve_problems`, `_raise_for`), `core/validation.py` (`amount_problem`, `gap_problem`) |
| One 400 | `core/errors.py::handle_validation`, `api/field_rules.py` (`FIELD_RULES`), `whatif_service.py` (`rejected_what_if`, `rejected_curve`); Mod-13 |
| 7 E8 | `whatif_service.py` (`what_if`, `scored_what_if`, `_ranks`, `_too_early`), `backend/explorer/predict.py::score_what_if`, `services/reasons.py`; Mod-6, Mod-12 |
| 8 E9 | `whatif_service.py::curve`, `services/whatif_batch.py` (`hypothetical_frame`, `score_frame`, `usable_methods`), `explorer/predict.py` (`PRECOMPUTED_ONLY = {"txgpt_method"}`); Mod-5; `settings.json` → `web.whatIf.curvePoints` = 41 |
| 9 Verdict card, G3, verdict table, G4 | `WhatIfLab.tsx` (`Verdict`, `G3FeatureDeviation`, `VerdictTable`, `LazyG4`), `charts/G4ModelVerdicts.tsx` |
| 10 G5, crossings | `charts/G5WhatIfResponse.tsx`, `lib/curve.ts` (`crossings`, `flaggedRuns`: both read the server's `flags`) |
| One `ApiError` | `api/http.ts`, `WhatIfLab.tsx` (`serverField`, the "Not enough history at that time" panel) |

## 4. `request-lifecycle`

**What it shows.** One `GET /api/addresses/{address}/timeline` passing the five middleware layers, the router and its
dependencies, and the explorer service's cache; the way back with an `ETag` or a 304; and where an error joins the way out.

**Caption.** *One GET, in and out: the request passes RequestContext, CORS, BodyLimit, GZip and ETag to the router, and the
explorer service answers from its cache, calling Assignment 2's `score_address` only on a miss. On the way out the ETag
layer tags the body and answers 304 when the client's copy is current, and any error raised on the way is built by
`core/errors.py` and leaves through the same layers.*

| Box or arrow | Checked against |
|---|---|
| The five strips, in and out | `core/middleware.py` (`RequestContextMiddleware`, `ETagMiddleware`), `core/body_limit.py`, `main.py` (CORS and GZip settings) |
| Router and dependencies | `api/addresses.py::timeline`, `api/deps.py` (`path_address`, `get_explorer`, `snapshot_data`) |
| Cache, miss to A2 | `services/explorer_service.py` (`timeline`, `_view`, `_build_view`), `explorer/predict.py::score_address` |
| `core/errors.py` and the raise arrows | `core/errors.py`; `services/model_service.py::require_ready` (503), `services/store.py` (`Unsupported`), `core/validation.py::require_address` (400) |

Two things the small figure does not say. The `If-None-Match` header is sent by the browser's own HTTP cache; no front-end
code sets it, and within one session `useRequest` does not repeat a request it already has an answer for. A handled error
leaves through all five layers; an unexpected exception (500) is answered by the same `core/errors.py`, but from
Starlette's outermost error layer, outside the five, which is why `error_response` adds `X-Request-ID` itself.

## 5. Where the plan and the code differ (the code is drawn)

| No. | Plan (`s05-architecture.tex` unless named) | Code on `main` |
|---|---|---|
| 1 | Views V1–V8 | V1–V7. V8, the live lookup dialog, is not on `main` |
| 2 | Charts G1–G9 | G1–G6 |
| 3 | Routers for E1–E22 | E1–E15 (`openapi.json`: 14 paths, 15 operations). No `api/live.py`; `addresses.py` has no E20 |
| 4 | Services "explorer, what-if, export, assistant, live" | No live service. Also present: methods, watchlist (service and repository), system, model, and the store |
| 5 | An `AddressStore` with a snapshot store and a live store | The `AddressStore` protocol and `SnapshotStore` only |
| 6 | SQLite file: "watchlist, live cache index" | One table, `watchlist` |
| 7 | API client: "Axios, `ApiError`, request cache" | The cache of answers is in the hook `useRequest`, not in the Axios client |
| 8 | Hooks `useDebounced`, `useEventSource`; views "one folder each" | `useDebouncedValue`; no `useEventSource`; views are single files |
| 9 | "The front end reads them from E2" (section 5.7) | True while the service is up. The front end also bundles `settings.json` at build time; the health poll interval and the Axios time limit come from the bundled copy |
| 10 | Walkthrough step 8: "the curve request (E9) follows" E8 | E8 and E9 are two independent requests, each debounced on its own key. E9's key has no amount, so typing an amount sends E8 only |
| 11 | Walkthrough step 3: a wrong type, an unknown field or a value out of range answers 400 "with the failing field" | Two layers: Pydantic checks types, the service checks ranges, and one 400 names every faulty field of both (Mod-13) |
| 12 | Walkthrough step 4: the service "converts the amount to whole satoshis" | The service passes the amount in BTC; `score_what_if` (A2) converts it. For E9, `whatif_batch.to_sats` converts with the same rounding |
| 13 | The figure has no middleware; `main.py`'s own docstring names three (request context, CORS, compression) | Five: BodyLimit and ETag as well |
| 14 | V3 calls E12 (section 8) | As planned since `ea70d25`: V3 and V4 call E12 through the Assistant panel (S-05); the figures were first drawn before that merge, and the footer was updated |
| 15 | Vendored: `explorer/`, `lm/`, `models/`, `data/processed/esplora/` | Also `reports/tables/` (two evaluation tables that E11 reads). `data/assistant_answers.json` is Assignment 3's own file (Mod-15), not vendored |
| 16 | The figure's "Optional" box holds the Esplora API as a drawn, optional part | Drawn dashed and labelled "S-09, in progress": nothing of it runs on `main` |

Two comments in the code that no longer match the code (not plan differences, found while checking):
`backend/app/core/middleware.py` says the browser supplies its own `X-Request-ID`, but `frontend/src/api/http.ts` sends
none; `frontend/src/api/endpoints.ts` says the service exposes only `X-Request-ID`, but `main.py` also exposes
`Content-Disposition` and `Retry-After`.

## 6. What is left out, and why

- **`architecture`:** the Pydantic schemas (`app/schemas/`), `api/deps.py`, `api/field_rules.py`, `core/validation.py`,
  `core/runtime.py`, `core/logging.py`, `core/openapi.py`, `services/ranks.py` and `services/reasons.py` have no box; the
  first four appear in the other two figures, the rest would add boxes without adding a decision. Arrows between services
  (explorer and what-if read the store; export and watchlist call the explorer service) and the response arrows are not
  drawn, to keep the request path readable. The front end's `components/`, `lib/` (address checker, router), the mock API
  mode (`VITE_API_MODE=mock`), `VITE_API_BASE`, local-storage preferences and the replay are not drawn. The cache is
  least-recently-used and is warmed in a worker thread; the box says "warmed at start" only.
- **`whatif-flow`:** the curve's fallback (when an address has no earlier transaction in the chosen direction, E9 answers
  400 naming `direction` and `useCurve` asks again for a range around the typed amount); the slider and the chips; E12's use
  of `scored_what_if`; the three ways a curve's amounts can be given (the box says "N amounts (41 by default)"). The 422
  arrow is drawn once, from E9; E8 raises the same error, as the amber box says. G5 places a crossing between two points by
  the scores and the threshold; which pair of points it lies between comes from the server's flags.
- **`request-lifecycle`:** POST, PUT and DELETE; Starlette's own outer and inner error layers (see the note in section 4);
  the cache warm-up; measured times (they are in `../measurements.md`).
- **Not inspected:** the S-09 branch (no git commands were run). The one-command mode (C-05) was not checked and is not drawn.
