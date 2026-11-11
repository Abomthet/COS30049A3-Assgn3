# Modifications for the web

Assignment 2's runtime in `explorer/`, `lm/`, `models/`, `data/` and `reports/` is copied unchanged from
commit `aa56a26` (tag `v1.0`) by `tools/vendor_a2.py`; `A2_VENDOR.json` holds the SHA-256 of every file and
`tests/test_vendor_integrity.py` recomputes them. Every change made for the web is in `app/` or is listed
here, with the test that covers it. Numbers refer to plan section 7.5.

| No. | Modification | Why | Test |
|-----|--------------|-----|------|
| (config) | `config/settings.json` gains a `web` block (what-if limits, list sizes, time limits, chart, watchlist and live-lookup limits, replay speeds, request limits). Every other key is Assignment 2's, unchanged | The web tier needs numbers of its own, and the front end reads them from `GET /api/config`, so the tiers cannot disagree | `test_vendor_integrity.py::test_settings_json_differs_from_assignment_2_only_by_the_web_block`; `test_config.py` |
| Mod-1 | The Predictor loads once, in the background during the application's lifespan, and is shared read-only. `GET /api/health` answers 503 until it is loaded | A load takes about a second; a request must not pay it, and the front end must be able to tell "starting" from "down" | `test_system_api.py::test_health_is_503_while_the_models_load_then_200`; health reports the counts |
| Mod-2 | `services/explorer_service.py` keeps a per-address cache of `score_address`'s result, one entry per (method, address), least recently used leaving first, as many entries as there are snapshot addresses (28). It fills lazily and is warmed for all 28 addresses under the default method in a background thread once the service is ready (about 1.2 s, about 50 MB) | Repeat views answer from memory (E5 1.5 ms warm against 57 to 102 ms cold) | `test_cache.py` (second view served from the cache and equal; least-recently-used eviction; warm-up after ready) |
| Mod-3 | `score_address`'s single result (up to 2 MB) is cut into the timeline (E5), a filtered, sorted, paged list of rows (E6) and one transaction (E7) | A view needs a few kB: the timeline is 11 to 18 kB, a page of 200 rows 52 kB, a transaction under 3 kB | `test_parity.py`: for all 28 addresses E5, E6 and E7 rebuild exactly what `score_address` returns |
| Mod-4 | An address with too little history gets a timeline and rows built from the feature table, all unscored; a transaction that could not be scored answers 422 with its facts and how much history lay behind it | `score_address` raises for these addresses, but the screen lists their transactions unscored | `test_parity.py::test_a_short_history_address_...`, `test_explorer_api.py` (E5, E6, E7 for the three short-history addresses) |
| Mod-7 | `method=` (E3, E5, E6, E7) gives the request a `Predictor` that shares the loaded tables and differs in `selected` (`dataclasses.replace`) | S-01: the deciding method is the user's choice | `test_parity.py::test_each_methods_flags_equal_scores_csv` (nine methods) |
| (http) | `ETag` and `Cache-Control: no-cache` on snapshot GETs with 304 on a matching `If-None-Match` (`core/middleware.py`); a body over `web.limits.maxBodyBytes` answers 413 (`core/body_limit.py`) | Plan sections 6.1 and 6.3: a repeat request costs a 304; a body over 10 kB is refused before it is parsed | `test_http_layer.py` |
| Mod-8 | `Unsupported` becomes 404, `InsufficientHistory` 422, `ValueError` 400 and a missing file 503, in `app/core/errors.py` and nowhere else; validation errors answer 400 instead of FastAPI's 422 | One error body, and Assignment 1's meaning of 422 | `test_errors.py`, one test per mapping |

Planned and not yet built: Mod-5, Mod-6 and Mod-9 to Mod-11 (plan section 7.5).

The Assistant's weights (`models/assistant/`, 610 MB) are copied in by `tools/vendor_a2.py --assistant-weights`,
are git-ignored, and are not loaded by anything yet (S-05).
