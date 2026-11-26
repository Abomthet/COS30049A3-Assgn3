# Licences

**This project.** Coursework for COS30049 at Swinburne University of Technology; all rights reserved by the group members unless stated otherwise.

**Assignment 2.** The back end's `explorer/`, `lm/`, `models/`, `data/` and `reports/` folders (the Predictor, the nine saved models, the snapshot's tables and the Assistant's weights) are Assignment 2's work by the same group, copied unchanged by `tools/vendor_a2.py` (source and hashes in `backend/A2_VENDOR.json`). The same line above applies to them.

**Data.** The snapshot is public blockchain data for 28 addresses, fetched on 22 October 2026 from the Blockstream Esplora public API (`https://blockstream.info/api`). The optional live lookup reads the same service (and, if it limits the rate, `mempool.space/api`). The application stores no personal data.

**Illustration.** The picture on the empty Watchlist screen is "Save to bookmarks" by Katerina Limpitsouni, from unDraw (`https://undraw.co/search/bookmark`), used under the unDraw licence (`https://undraw.co/license`, read 26 November 2026): "All images, assets and vectors published on unDraw can be used for free", for non-commercial and commercial purposes, with no permission or credit needed. The licence does not allow compiling the assets "to replicate a similar or competing service" or distributing them "in packs or otherwise", and it prohibits using them to train or develop AI or machine learning models. Here one illustration is simplified (coordinates rounded, metadata removed) and recoloured to the app's colours; credit is given anyway (`frontend/src/assets/PHOTO_CREDITS.md`).

**Libraries.** Each version and licence below was read from the installed package's own metadata (Python: `importlib.metadata`, npm: `package.json` after `npm ci`) on 21 November 2026. Versions are the pins in `backend/requirements.txt`, `backend/requirements-assistant.txt`, `frontend/package.json` (ranges such as `^19.3.0` show the version installed from `package-lock.json`) and `frontend/tools/typegen/package.json`.

## Python, back end (`backend/requirements.txt`)

| Package | Version | Licence |
|---|---|---|
| numpy | 2.2.6 | BSD |
| pandas | 2.2.3 | BSD |
| scikit-learn | 1.6.1 | BSD |
| scipy | 1.17.1 | BSD |
| joblib | 1.4.2 | BSD |
| threadpoolctl | 3.7.0 | BSD-3-Clause |
| fastapi | 0.162.4 | MIT |
| uvicorn | 0.54.0 | BSD-3-Clause |
| pydantic | 2.14.3 | MIT |
| httpx2 | 2.16.0 | BSD-3-Clause |
| pytest | 9.2.0 | MIT |
| annotated-doc | 0.0.6 | MIT |
| annotated-types | 0.8.0 | MIT |
| anyio | 4.16.0 | MIT |
| certifi | 2026.10.23 | MPL-2.0 |
| click | 8.5.1 | BSD-3-Clause |
| h11 | 0.16.0 | MIT |
| httpcore2 | 2.16.0 | BSD-3-Clause |
| idna | 3.20 | BSD-3-Clause |
| iniconfig | 2.3.1 | MIT |
| opentelemetry-api | 1.45.2 | Apache-2.0 |
| packaging | 26.3 | Apache-2.0 OR BSD-2-Clause |
| pluggy | 1.7.0 | MIT |
| pydantic_core | 2.50.4 | MIT |
| Pygments | 2.21.0 | BSD-2-Clause |
| python-dateutil | 4.0.0 | BSD-3-Clause |
| pytz | 2026.6 | MIT |
| starlette | 1.10.0 | BSD-3-Clause |
| truststore | 0.10.5 | MIT |
| typing-inspection | 0.4.5 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| tzdata | 2026.6 | Apache-2.0 |

Notes: the first five rows' metadata says "BSD License" (a classifier, no variant); the licence files of numpy, pandas,
scikit-learn and SciPy are BSD-3-Clause, but this table gives what the metadata states. certifi is MPL-2.0 (its
metadata says "Mozilla Public License 2.0"). The packages after `pytest` are what the web tier pulls in.

## Python, optional Assistant (`backend/requirements-assistant.txt`)

| Package | Version | Licence |
|---|---|---|
| torch | 2.7.1 | BSD (metadata: "BSD License") |
| tokenizers | 0.21.1 | Apache-2.0 (metadata: "Apache Software License") |

## npm, front end (`frontend/package.json`)

| Package | Version | Licence | Kind |
|---|---|---|---|
| axios | 1.21.0 | MIT | runtime |
| plotly.js-cartesian-dist-min | 4.1.2 | MIT | runtime |
| react | 19.3.0 | MIT | runtime |
| react-dom | 19.3.0 | MIT | runtime |
| @axe-core/playwright | 4.14.0 | MPL-2.0 | development |
| @playwright/test | 1.64.1 | Apache-2.0 | development |
| @testing-library/jest-dom | 7.0.1 | MIT | development |
| @testing-library/react | 16.3.3 | MIT | development |
| @testing-library/user-event | 14.6.7 | MIT | development |
| @types/node | 26.6.4 | MIT | development |
| @types/plotly.js | 3.0.15 | MIT | development |
| @types/react | 19.3.0 | MIT | development |
| @types/react-dom | 19.3.0 | MIT | development |
| @vitejs/plugin-react | 6.1.2 | MIT | development |
| jsdom | 30.1.2 | MIT | development |
| typescript | 7.0.2 | Apache-2.0 | development |
| vite | 8.3.3 | MIT | development |
| vitest | 5.0.3 | MIT | development |

## npm, type generator (`frontend/tools/typegen/package.json`)

| Package | Version | Licence | Kind |
|---|---|---|---|
| openapi-typescript | 7.13.0 | MIT | development |
| typescript | 5.9.3 | Apache-2.0 | development |

The libraries' own dependencies (installed with them, listed in `frontend/package-lock.json`) keep their own licences.
