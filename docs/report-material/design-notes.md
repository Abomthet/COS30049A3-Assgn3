# Design notes for the technical document

Collected from `docs/WORKLOG.md` by `docs/report-material/make_design_notes.py`. Each bullet is copied
verbatim from the work log (its wording is not changed). The topic grouping is the script's TOPIC table.
Bullets found: **55** in 11 entries of the work log.

## Back end (20)

<!-- source: 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed -->
- **Models load once, in the background.** The Predictor loads in the lifespan on a worker thread and
  is shared read-only. While it loads, E1 answers 503 `unavailable`, which lets the front end tell
  "starting" from "down". A failed load is logged and E1 keeps answering 503.

<!-- source: 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed -->
- **One error body, one place.** `core/errors.py` alone chooses statuses and builds bodies. Services raise
  A2's `Unsupported` (404) or `InsufficientHistory` (422), or typed API errors. Validation becomes 400
  with per-field messages. No trace, path, library text or echoed input reaches a client; the real
  text is logged under the same request ID.

<!-- source: 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed -->
- **One address checker, two tiers.** `core/validation.py` ports the prototype's Base58Check, Bech32
  and Bech32m checker. `shared/address_vectors.json` (53 addresses, 9 transaction IDs: snapshot
  addresses, BIP 173/350 vectors, and hand-built cases where the checksum is valid but one rule fails)
  is read by pytest now and by Vitest later. The two checkers agree on every entry except the
  server-only 100-character limit.

<!-- source: 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed -->
- **Configuration in one place.** Every web limit is in `settings.json` → `web`, validated by Pydantic
  models that reject unknown or missing keys. E2 passes the block on unchanged, so the browser checks
  the same numbers the server enforces. Environment variables only choose what a machine may do (CORS
  origins, live lookup, Assistant, log level).

<!-- source: 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed -->
- **Contract first.** camelCase schemas for E1–E11 match A1's `types.ts` field for field (a test
  parses `types.ts` and compares names, optionality and nullability). `openapi.json` is exported with
  the contract-only schemas merged in, and a test keeps the committed copy current.

<!-- source: 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1) -->
- **One scoring, three views.** `score_address` returns up to 2 MB, so the service scores an address once
  per method, keeps the result and cuts it into the timeline (11–18 kB), a filtered, sorted, paged
  list, and one transaction (under 3 kB). Endpoints only filter, sort, page and pick; nothing is
  recomputed. Parity tests rebuild the whole `score_address` result from those pieces for all 28 addresses.

<!-- source: 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1) -->
- **An address store behind one interface.** Services read an address through `AddressStore.get` (its
  features, transactions, scores and source, or `Unsupported`). `SnapshotStore` splits the frozen tables
  once at start. A live store (S-09) only implements the same two methods.

<!-- source: 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1) -->
- **A bounded, warmed, per-method cache.** One entry per (method, address), least-recently-used
  eviction, capacity of one snapshot (28 entries, ~51 MB). It fills lazily and is warmed for the
  default method after "ready", so a warm view takes ~1.5 ms. A non-default method shares the loaded
  tables (`dataclasses.replace(predictor, selected=m)`) and never disturbs the default entries.

<!-- source: 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1) -->
- **Short-history addresses stay visible.** `score_address` raises for them, but the screen must list
  their transactions unscored, so their timeline and rows come from the feature table (E5/E6 200).
  E7 answers 422 `insufficient_history` with the transaction's own history, the same body for a
  short address and for an early transaction of a normal one.

<!-- source: 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1) -->
- **Layered validation, always 400.** Pydantic checks types and enums; `core/validation` checks
  addresses, transaction IDs and days; the service checks rules that need settings or two fields (page
  size, day order, `date` versus a range). Limits come from `settings.json` → `web`. Bodies over
  `maxBodyBytes` are refused with 413 by a middleware that reads at most one byte past the limit.

<!-- source: 2026-11-11 — Wave 2, back end: T10–T13 reviewed and committed (back-end half of MS1) -->
- **Revalidation without state.** An innermost middleware hashes the finished JSON (inside gzip, whose
  timestamp would otherwise change the hash) and answers 304 on a matching `If-None-Match`. Routes opt in
  with `Cache-Control: no-cache` through one dependency. No version table, and the tag changes exactly when
  the answer does.

<!-- source: 2026-11-11 — T14 and T15 reviewed and committed (what-if, export, methods) -->
- **Why one batch is valid.** A2's `build_features` never treats rows at the same second as each
  other's history. All hypothetical rows share one timestamp, so none sees another, and one build
  scores them all. Staggering their times is exactly the bug the third meta-test plants.

<!-- source: 2026-11-11 — T14 and T15 reviewed and committed (what-if, export, methods) -->
- **One 422 for "not enough history".** `score_what_if` returns an unscored row when history exists but
  is under the minimum, and raises when there is none. E8 and E9 turn both into the same 422 with the
  counts and the first scorable date.

<!-- source: 2026-11-11 — T14 and T15 reviewed and committed (what-if, export, methods) -->
- **The export is the screen.** E10 reuses E6's cached view and filters, so the file lists exactly
  what the table shows. Amounts are formatted from integer satoshis with A2's own `format_btc`. Text
  cells that start like a formula (`=`, `+`, `-`, `@`, tab, CR) get a leading apostrophe; numbers stay
  numbers.

<!-- source: 2026-11-11 — T14 and T15 reviewed and committed (what-if, export, methods) -->
- **Scoring once per batch.** Scoring through `fusion.Cached` instead of a score pass and then a flag
  pass halved batch scoring (≈0.26 → 0.13 s for 41 rows) without reimplementing A2's flag logic.

<!-- source: 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools -->
- **One place for A2's wording.** A2's explanation template is frozen, so the web layer rewrites its
  output once (two F4 phrases; amounts to a satoshi's precision), keyed by A2's own `headline()`, so a
  change in A2's wording fails `test_reasons.py` first.

<!-- source: 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools -->
- **Two-layer validation, one answer.** Pydantic checks types; each route's service rules then judge the
  values that passed; one 400 lists every field at fault. A value that failed its type check is named
  once.

<!-- source: 2026-11-12 — Wave A back end reviewed (S-04 watchlist back end, S-02 ranks) -->
- **An exact cap under concurrency.** One SQLite connection behind a lock; the count check and the insert
  run in one `BEGIN IMMEDIATE` transaction, so the 200-entry limit holds when requests arrive in parallel on
  the thread pool (tested with 100 threads against a limit of 10).

<!-- source: 2026-11-12 — Wave A back end reviewed (S-04 watchlist back end, S-02 ranks) -->
- **Ranks without rescoring.** A rank is the share of the address's own scored transactions at or below
  this score, found by `searchsorted` in one sorted pool per address and method, built from the cached
  `score_address` result. For a what-if, the pool is the stored scores strictly before its time, the same
  history it is judged against.

<!-- source: 2026-11-12 — Wave A back end reviewed (S-04 watchlist back end, S-02 ranks) -->
- **No file at import.** The database opens in the lifespan (`create_app(database=…)`, then `EXPLORER_DB`,
  then `backend/var/explorer.db`), so tests and tools that build the app write nothing.

## Front end (15)

<!-- source: 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed -->
- **One client, one error type.** A single Axios instance (D-A3-4) owns the base URL, the time limit
  (`web.requests.timeoutMs`, 10 s) and cancellation. A response interceptor turns every failure into an
  `ApiError`, so views switch on `error.body.status` and never see Axios. A reply without the service's
  JSON body (such as the dev proxy's empty 502 while Uvicorn is stopped) is treated as "no answer",
  not as a server error.

<!-- source: 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed -->
- **Cancellation by signal.** Every API method takes an `AbortSignal`. `useRequest` aborts on unmount
  or when its key changes, so a stale answer can never overwrite a newer one. The mock honours the
  same signal, so tests cover cancellation without a server.

<!-- source: 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed -->
- **Service status drives recovery.** A provider polls E1 every `healthPollSeconds` (15 s), and at once
  after any network, timeout or 503 failure. It reports checking, ready, starting or unreachable, each
  with a next action. When the service is back, views that failed for those reasons reload by
  themselves: recovery without a click, and without a query library.

<!-- source: 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed -->
- **Settings: the service first, the bundled file as the floor.** The shell reads E2 at start and
  after each recovery. Until then it uses the bundled `settings.json`, so limits and the limitation
  line are always present; only the snapshot details need the service.

<!-- source: 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed -->
- **Fault isolation.** The error boundary sits inside `<main>` and resets on navigation, so a crash in
  one view leaves the header, the navigation and the status indicator working.

<!-- source: 2026-11-11 — Wave 1, front end: T04 and T16 reviewed and committed -->
- **Preferences** live in one versioned local-storage key (`explorer.preferences.v1`), with a session
  fallback when storage is blocked. The theme follows the system until the user chooses.

<!-- source: 2026-11-11 — T17 reviewed; **MS1 passed** (4 days early) -->
- **One flag line, from the model.** The front end draws the threshold that E2 reports (A2's tuned 5.0),
  echoed in each response's `method`. With the service unreachable it draws none rather than guess.

<!-- source: 2026-11-11 — T17 reviewed; **MS1 passed** (4 days early) -->
- **A transaction can be unscorable on a normal address.** E7's 422 covers early transactions of a
  well-covered address too. V3 handles it per transaction: the facts stay, the reason is given, and the
  next step is the address's first scored day.

<!-- source: 2026-11-12 — T18, T25, V7 reviewed and committed -->
- **The URL is the filter state.** One `Filters` object, parsed from the route's query string
  (`lib/transactionFilters.ts`), feeds the filter bar, G2 and the table; none keeps its own copy.
  Serialisation uses a fixed key order, so equal filters give equal links and equal request keys. The
  browser applies the server's rules with the server's wording, and nothing is sent while a date is
  invalid.

<!-- source: 2026-11-12 — T18, T25, V7 reviewed and committed -->
- **No sideways scrolling anywhere.** Tables become cards (rows stack, cells carry `data-label`) below
  720 px for the transaction table and 560 px for chart tables. The screenshot script enforces it.

<!-- source: 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools -->
- **The real-time loop.** The form state becomes a request key, debounced by `web.whatIf.debounceMs`;
  `useRequest` cancels the older request and keeps the previous result, dimmed. "Updating" shows as
  soon as the key and its debounced copy differ (within one frame), so feedback is immediate while the
  server is asked at most once per pause. Keystroke to verdict: ~600–650 ms, including the 250 ms
  debounce.

<!-- source: 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools -->
- **Amounts are strings until the server.** The browser parses BTC amounts as digit strings (BigInt),
  never as floats, and sends the decimal string, so "0.1" is never 0.1000000000000000055.

<!-- source: 2026-11-12 — Polish reviewed (T21, T28); **MS2 passed**; model allocation policy -->
- **One panel, one catalogue.** Every failure leaves the client as an `ApiError` and every view renders it
  through `ErrorState`. `stateCatalogue.test.tsx` crosses 7 views with 8 failure kinds, so a new status
  or view is covered by adding one row. The mock reproduces offline, starting, busy, slow and timeout.

<!-- source: 2026-11-12 — Polish reviewed (T21, T28); **MS2 passed**; model allocation policy -->
- **A slow request says so; a busy service counts down.** One `useSlow` hook, driven by the time limit in
  settings, so the notice and the timeout cannot drift apart. The 429 panel reads `Retry-After`, counts
  down visually, announces the wait once to screen readers, and retries by itself.

<!-- source: 2026-11-12 — Wave A front end reviewed (S-01 method selector, S-03 G6) -->
- **The link decides the method.** `method=` is in the URL (left out for the default), so a shared link reproduces the
  view exactly; the remembered preference only seeds links out of V1. Requests and caches are keyed by method.

## Charts (13)

<!-- source: 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed -->
- **One wrapper; a chart is a figure function.** Every chart goes through `PlotlyChart`. A chart
  supplies its words, its table and `figure(context)`, which returns Plotly data and layout for the
  current theme and size. The wrapper adds what the contract promises for all charts (theme, tool
  bar, exports, states, keyboard, resizing), so the contract is tested once and a new chart is one file.

<!-- source: 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed -->
- **Plotly is loaded on demand, and failure is a state.** Only `plotlyLoader.ts` imports Plotly, by
  dynamic `import()`, so it ships as a separate chunk that the first screen never fetches. A failed
  fetch is not cached, so "Try again" retries; if loading or drawing fails, the chart's table takes its
  place and the numbers stay reachable.

<!-- source: 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed -->
- **Theme from CSS tokens.** Plotly cannot read CSS, so `chartTheme.ts` reads the stylesheet's tokens
  after the theme attribute changes and passes them in. Light and dark share one definition, and a theme
  switch redraws in place, keeping the zoom (`uirevision`).

<!-- source: 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed -->
- **Accessibility rebuilt around Plotly.** The chart sits in a focusable group with the prototype's keys
  (arrows, Home, End, Enter). Each key calls `Plotly.Fx.hover`, so keyboard users see the same tooltip as
  mouse users, and a live region reads it out. Screen readers get the same data as a table. An unusual
  item is never shown by colour alone: it is orange, has a triangle, and says so.

<!-- source: 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed -->
- **The PNG is a deliberate copy.** Export draws an offscreen 1200×675 figure from the current zoom,
  with the title and caption, without the range slider, on an opaque background. The image explains
  itself whatever the window size or theme.

<!-- source: 2026-11-11 — Wave 2, charts: T23, T24, T26 reviewed and committed -->
- **Library choice.** `plotly.js-cartesian-dist-min` is the smallest prebuilt Plotly with bar, scatter,
  WebGL scatter and heat map, which G1–G9 need. A custom `plotly.js/lib/core` build would be smaller,
  but Vite cannot compile Plotly's glslify shaders. `chunkSizeWarningLimit` was raised to 1500 kB for
  that one chunk; the first-screen budget is checked from the build report instead.

<!-- source: 2026-11-12 — T18, T25, V7 reviewed and committed -->
- **Pages joined for the chart, not for the table.** G2 needs every matching transaction, so
  `useAllTransactions` fetches E6 pages of 200 in time order (rows cannot move between pages), draws
  after the first page, keeps the previous rows while refreshing, and is cancelled by a filter change.
  The table pages 50 at a time.

<!-- source: 2026-11-12 — T18, T25, V7 reviewed and committed -->
- **Zoom and filters stay in step.** Dragging G2's time axis writes `from`/`to`, and reset clears them.
  Plotly reports its own redraws as relayout events, so the wrapper ignores events during a redraw;
  without that guard the dates drifted in a loop.

<!-- source: 2026-11-12 — T18, T25, V7 reviewed and committed -->
- **Status and direction never by colour alone.** Orange triangle (unusual), blue circle (not
  unusual), grey diamond (not scored); filled = received, outlined = sent; the legend names both.
  (The plan's "hollow grey" for not scored was not used, so direction stays readable on short-history
  addresses, where every point is not scored.)

<!-- source: 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools -->
- **The curve follows the server's flags.** G5 marks crossings between neighbouring points whose
  server flags differ, interpolated on log amount, and writes the sentence under the chart from the same
  runs, rather than re-deriving a rule in the browser.

<!-- source: 2026-11-12 — Polish reviewed (T21, T28); **MS2 passed**; model allocation policy -->
- **Why Plotly's widgets are replaced on touch.** Plotly's range buttons, legend entries and tool bar are
  19–24 px tall with no setting. The wrapper draws its own 44 px range buttons (on every width, so they are
  also keyboard-reachable), drops the tool bar on touch, and makes the legend display-only there.

<!-- source: 2026-11-12 — Polish reviewed (T21, T28); **MS2 passed**; model allocation policy -->
- **Axis labels fit the room.** `amountTicks` picks the finest log-axis tick set whose widest label fits
  the measured chart width (1-2-5 per decade, then powers of ten, then every nth power), so nothing
  depends on a breakpoint.

<!-- source: 2026-11-12 — Wave A front end reviewed (S-01 method selector, S-03 G6) -->
- **G6 is honest about what it measures.** Recall per planted pattern with 95 % intervals, straight from E11,
  captioned as measured on planted test transactions, which says nothing about accuracy on real activity.

## Testing (5)

<!-- source: 2026-11-11 — T17 reviewed; **MS1 passed** (4 days early) -->
- **Fixtures are recorded, not invented.** `scripts/record-fixtures.mjs` saves the service's own answers
  (E1–E3, an E4 404, E5, all E6 pages and selected E7 answers for one normal and one short-history
  address). The mock only filters, sorts and pages them, so tests and the demo mode use real shapes and
  numbers, and re-running the script refreshes both after a new snapshot.

<!-- source: 2026-11-11 — T17 reviewed; **MS1 passed** (4 days early) -->
- **Two checkers, one set of vectors.** pytest and Vitest both run `shared/address_vectors.json`, so the
  browser and the server are shown to accept and reject the same addresses with the same messages.

<!-- source: 2026-11-11 — T14 and T15 reviewed and committed (what-if, export, methods) -->
- **Exact where it can be, bounded where it cannot.** Flags and five methods are exactly equal; three
  methods differ by BLAS summation order (≤ 4.3e-14), the same noise as between two identical single
  calls. The test states that tolerance and why.

<!-- source: 2026-11-12 — Hardening and the what-if lab reviewed; a flaky test found; the Mac lost its developer tools -->
- **Tolerances are stated, not hidden.** Wherever two code paths compute the same score (batch vs
  single, E9 vs E8), flags are compared exactly and scores within 1e-12, with the reason in the test.

<!-- source: 2026-11-12 — Wave A front end reviewed (S-01 method selector, S-03 G6) -->
- **Waiting for the state, not the first event.** Tests of charts whose words come from a second request wait for
  the redraw that carries them; reading the first draw raced under load.

## Tooling (2)

<!-- source: 2026-11-11 — Wave 1, back end: T03, T05–T09 reviewed and committed -->
- **Copying with proof.** A2's runtime is copied from a commit (`git cat-file`), never from a working
  folder. The file list is found by running the entry points (`Predictor.load`, `score_address`,
  `score_what_if`, `txgpt_surprisal`) in a clean interpreter under an audit hook, so it cannot drift
  from what the code needs. `A2_VENDOR.json` stores each file's SHA-256, and a test recomputes them.
  `.gitattributes` marks the folders `-text` so Windows line-ending conversion cannot change a hash.

<!-- source: 2026-11-11 — T17 reviewed; **MS1 passed** (4 days early) -->
- **The mock cannot ship.** It is reachable only through a condition on `import.meta.env`, which the
  build replaces with a literal, so production bundles contain neither the mock nor its data.
