# Modifications for the web

Assignment 2's runtime in `explorer/`, `lm/`, `models/`, `data/` and `reports/` is copied unchanged from
commit `aa56a26` (tag `v1.0`) by `tools/vendor_a2.py`; `A2_VENDOR.json` holds the SHA-256 of every file and
`tests/test_vendor_integrity.py` recomputes them. Every change made for the web is in `app/` or is listed
here, with the test that covers it. Numbers refer to plan section 7.5.

| No. | Modification | Why | Test |
|-----|--------------|-----|------|
| (config) | `config/settings.json` gains a `web` block (what-if limits, list sizes, time limits, chart, watchlist and live-lookup limits, replay speeds, request limits). Every other key is Assignment 2's, unchanged | The web tier needs numbers of its own, and the front end reads them from `GET /api/config`, so the tiers cannot disagree | `test_vendor_integrity.py::test_settings_json_differs_from_assignment_2_only_by_the_web_block`; `test_config.py` |
| Mod-1 | The Predictor loads once, in the background during the application's lifespan, and is shared read-only. `GET /api/health` answers 503 until it is loaded | A load takes about a second; a request must not pay it, and the front end must be able to tell "starting" from "down" | `test_system_api.py::test_health_is_503_while_the_models_load_then_200`; health reports the counts |
| Mod-8 | `Unsupported` becomes 404, `InsufficientHistory` 422, `ValueError` 400 and a missing file 503, in `app/core/errors.py` and nowhere else; validation errors answer 400 instead of FastAPI's 422 | One error body, and Assignment 1's meaning of 422 | `test_errors.py`, one test per mapping |

Planned and not yet built: Mod-2 to Mod-7 and Mod-9 to Mod-11 (plan section 7.5).

The Assistant's weights (`models/assistant/`, 610 MB) are copied in by `tools/vendor_a2.py --assistant-weights`,
are git-ignored, and are not loaded by anything yet (S-05).
