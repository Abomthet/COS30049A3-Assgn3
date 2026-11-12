# Bitcoin Address Activity Explorer

COS30049, Assignment 3. A web application that shows, for a Bitcoin address, which of its transactions were
unusual for **that address's own history**: a React front end over a FastAPI service that wraps Assignment 2's
`Predictor` (nine scoring methods over a frozen snapshot of 28 addresses, 22 October 2026). A flag means
*unusual compared with the address's usual activity* and nothing more: the application never says why an
address behaves as it does, and every flagged item carries the line "Unusual activity requires investigation;
it does not indicate wrongdoing." You can open an address, see its day-by-day activity, list and filter its
transactions, read the plain-language reasons for one transaction, try a what-if amount, compare the methods
and export what the table shows.

> **Status.** First draft (T43 completes it). Commands in a plain code block were run on macOS (Apple silicon,
> Python 3.11.18, Node v24.22.2) while writing this file. Where a command was not run, or only part of it was, the
> line says so. Nothing here has been run on Windows yet.

## What is in the repository

| Folder | What it holds |
|---|---|
| `backend/` | The FastAPI service (`app/`), Assignment 2's runtime copied unchanged (`explorer/`, `lm/`, `models/`, `data/`, `reports/`), `config/settings.json`, the tests, `MODIFICATIONS.md` (every change made for the web) |
| `frontend/` | The React + TypeScript application (Vite) and its tests |
| `shared/` | Test vectors read by both tiers (`address_vectors.json`, `whatif_vectors.json`) |
| `tools/` | `vendor_a2.py`, which copies Assignment 2's runtime in with a SHA-256 for every file; `precompute_assistant.py`, which writes the Assistant's prepared answers |
| `docs/` | The delivery plan and the engineering log |

## What you need

- macOS or Windows 10/11 (Linux should work and has not been tried), about 2 GB of disk, no GPU.
- **conda** (Miniforge or Miniconda) for the back end's Python 3.11 environment.
- **Node.js 22 or later** (`frontend/package.json` says `"node": ">=22"`) with npm.
- Optional: the Explorer Assistant (its weights, 610 MB, and PyTorch); see "The optional Assistant" below. Without it every explanation is the template text.

## Set-up

### macOS

```bash
cd backend
conda env create -f environment.yml     # run here as --dry-run only (the environment already existed): the solve succeeded
conda activate cos30049-a3
python --version                        # Python 3.11.x
cd ../frontend
npm ci
```

`npm ci` installs exactly what `package-lock.json` pins. It was run on this Mac in a copy of `frontend/` outside
the repository, and finished with exit code 0.

If `conda activate` is not recognised in a new terminal, run `conda init zsh` once and open a new terminal
(not run here; the hook was loaded with `eval "$(conda shell.zsh hook)"` instead).

### Windows 10/11 (not run on Windows)

Use the *Miniforge Prompt* or *Anaconda Prompt* for the back end.

```bat
cd backend
conda env create -f environment.yml
conda activate cos30049-a3
set PYTHONUTF8=1
cd ..\frontend
npm ci
```

The commands are the same as on macOS; `set PYTHONUTF8=1` is the plan's remedy for a text-encoding message on
Windows. **None of this block has been run on Windows.**

### Without conda

`pip install -r requirements.txt` on Python 3.11 installs the same pinned set (not run; `environment.yml` is the
tested route). The pins are Assignment 2's exact library versions, because the saved models are pickles and a
different scikit-learn warns on every load.

## The optional Assistant

The Explorer Assistant is a 152-million-parameter language model that Assignment 2 trained. It rephrases the template
explanation in plain words; a code check (six checks: numbers, limitation line, banned words, comparison direction,
verdict, not empty) decides whether its answer may be shown, and a rejected answer is replaced by the template. The
application never needs it: without the weights or PyTorch every explanation is the template.

**1. The weights.** `model.pt` (610 MB) and `tokenizer.json` are not in the repository. Copy both files into
`backend/models/assistant/` (the folder is git-ignored) and check them:

```bash
shasum -a 256 backend/models/assistant/model.pt backend/models/assistant/tokenizer.json
```

The expected values, from Assignment 2's submission checksums, are

```
f9306a5e2d734943469830c6012c49b9b380b4212becb64434d12d958f841434  model.pt
c8f4509cc0951d00426ae6bae99a34b8639c2f20c8c32e05b9d0bce1cc3e5d45  tokenizer.json
```

(On Windows: `certutil -hashfile backend\models\assistant\model.pt SHA256`, not run.) `tools/vendor_a2.py
--assistant-weights <folder>` copies and verifies them from a folder that holds Assignment 2's
`models/assistant/` and its `SHA256SUMS.txt`; it also re-copies Assignment 2's runtime.

**2. PyTorch.** With the environment active, from `backend/`:

```bash
pip install -r requirements-assistant.txt     # torch 2.7.1 and tokenizers 0.21.1, Assignment 2's versions; the CPU build on macOS and Windows
```

(Linux: add `--index-url https://download.pytorch.org/whl/cpu` for the CPU-only build, a smaller download.) Restart the
back end. `GET /api/health` then says `"assistant": "ready"`; it says `"not_installed"` while either part is missing
and `"off"` when `EXPLORER_ASSISTANT=off`. PyTorch is imported only when an answer is first asked for.

**How it behaves.** `POST /api/explanations` (E12) answers with the template or the Assistant's guarded answer.

- The first answer loads the model (about 8 seconds, `assistant` reads `loading` meanwhile) and writes in about 3; later
  answers take about 3 seconds each on a laptop CPU. The request's time limit is 90 seconds
  (`web.requests.assistantTimeoutMs`).
- One answer is written at a time. A second request that would have to write gets `429 rate_limited` with a
  `Retry-After` header; answers already written (the cache) or prepared are never kept waiting.
- Decoding is greedy, so the same facts always give the same answer, and answers are cached by a SHA-256 of the facts.
- **Prepared answers.** `backend/data/assistant_answers.json` holds the guarded answers for the snapshot's flagged
  transactions under the baseline (681 transactions; equal facts share an answer). E12 serves from it first, so a computer
  without the weights still reads the Assistant's explanations for those transactions. A what-if transaction needs the
  weights. Regenerate the file (about 30 minutes on a laptop CPU, resumable) with:

  ```bash
  python tools/precompute_assistant.py        # from anywhere, with PyTorch and the weights; --limit 5 --out x.json to try it
  ```

- With the Assistant off or not installed, E12 answers 200 with the template and `skippedWriters` says why.

## Run it: two terminals

Terminal 1, the back end (port 8000):

```bash
cd backend
conda activate cos30049-a3
uvicorn app.main:app --port 8000
```

It is ready when the log says `Explorer ready: 28 addresses, 9 methods` (about one second after the start).
It starts with no warnings (checked with `python -W error -m uvicorn app.main:app --port 8765`, because 8000 may be
busy on a shared machine).

Terminal 2, the front end (port 5173):

```bash
cd frontend
npm run dev
```

Open <http://localhost:5173>. Vite hands every `/api` request to Uvicorn on port 8000, so the browser sees one
origin and needs no configuration (decision D-A3-11). Check the pair with

```bash
curl http://localhost:8000/api/health        # {"status":"ok", ... "addressCount":28,"methodCount":9 ...}
curl http://localhost:5173/api/health        # the same answer, through Vite's proxy
```

A two-minute tour: pick the first address on the opening screen (the running example,
`1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz`), click a flagged day, open a flagged transaction to read its reasons, then try
the what-if with 0.05 BTC going out.

Try the API by hand (quote any URL that contains `?`, which zsh would otherwise treat as a pattern):

```bash
curl http://localhost:8000/api/addresses
curl http://localhost:8000/api/addresses/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz/timeline
curl -X POST http://localhost:8000/api/addresses/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz/what-if \
     -H "Content-Type: application/json" \
     -d '{"amountBtc": 0.05, "direction": "out", "time": "2026-10-20T12:00:00Z"}'
```

In the Windows Command Prompt the body needs double quotes with the inner quotes escaped (not run on Windows):

```bat
curl -X POST http://localhost:8000/api/addresses/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz/what-if -H "Content-Type: application/json" -d "{\"amountBtc\": 0.05, \"direction\": \"out\", \"time\": \"2026-10-20T12:00:00Z\"}"
```

## The API documentation

With the back end running, **<http://localhost:8000/docs>** lists every endpoint (E1 to E11) with its parameters,
its answers and each error status, and can send a request from the browser. The same schema is committed as
`backend/openapi.json`; regenerate it after changing a route with `python -m app.core.openapi` (from `backend/`).
Every failure answers with one body: `status`, a plain `message`, a `hint`, the `fields` at fault, and a
`requestId` that matches the server's log line. A 400 names every field at fault in one answer.

## Configuration

`backend/config/settings.json` holds the thresholds, the wording (banned words, limitation line) and the `web`
block (what-if ranges, list sizes, time limits). The front end reads the running values from `GET /api/config`.
Environment variables only choose what a machine may do:

| Variable | Default | Meaning |
|---|---|---|
| `EXPLORER_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Origins allowed to call the API directly (comma-separated) |
| `EXPLORER_LIVE_LOOKUP` | `off` | `on` turns the live address lookup on (not built yet) |
| `EXPLORER_ASSISTANT` | `auto` | `auto` uses the Assistant when its weights and PyTorch are installed (and serves the prepared answers); `off` shows the template text only |
| `EXPLORER_LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR` or `CRITICAL` |
| `VITE_API_BASE` (front end) | empty | Empty: same origin, through Vite's proxy. Otherwise the back end's address, such as `http://127.0.0.1:8001` |
| `VITE_API_MODE` (front end) | `http` | `mock` runs the screens on the in-browser mock, which the tests use |

An unusable value stops the service at start with a message that names the variable. On macOS:
`EXPLORER_LOG_LEVEL=DEBUG uvicorn app.main:app --port 8000` (the variable form was not run; the defaults were).
On Windows Command Prompt: `set EXPLORER_LOG_LEVEL=DEBUG` first (not run on Windows).

## Tests

Back end, from `backend/` with the environment active. Warnings are errors in every run.

```bash
python -m pytest -q                                   # the full suite: the default, no flag
python -m pytest -q -m "not slow"                     # everything except the long grids
PARITY_FULL=1 python -m pytest -q tests/test_whatif_parity.py   # every amount of every what-if curve against single calls
```

The `slow` marker (registered in `pytest.ini`) is on the long grids: the wording scans over all 28 addresses, the
per-address parity grid (the running example stays in the quick run), the what-if parity grid and the handful of
single tests that each take over a second (cache warm-up, E8/E9 loops).
`PARITY_FULL=1` widens that last grid from a spread to all 1,517 amounts and takes several minutes.

The suite covers the contract with Assignment 2 (parity for all 28 addresses and the batched what-if), every
endpoint and error status, the wording rule, the shared address vectors, the committed `openapi.json`, and
the integrity of the copied files. That last check can also be run alone, from the repository root:

```bash
python tools/vendor_a2.py --check                     # "Vendored files match A2_VENDOR.json."
```

Front end, from `frontend/` (Node 22 or later). These were run in a copy of `frontend/` outside the repository,
so the repository's own `node_modules` was not touched:

```bash
npm test                  # Vitest: no back end needed (the mock answers); 17 files, 320 tests when this was written
npm run typecheck
npm run build
npm run screenshots       # needs both servers running; writes ../docs/screenshots/ and fails on sideways scrolling
```

`npm run screenshots` drives an installed Edge or Chrome (it looks in the usual places; `BROWSER_PATH` overrides).
It ran here against both servers on their default ports.

## Troubleshooting

- **"Address already in use" on port 8000.** Uvicorn ends with
  `[Errno 48] error while attempting to bind on address ('127.0.0.1', 8000): address already in use`. Find the
  process with `lsof -nP -iTCP:8000 -sTCP:LISTEN` (macOS), then stop it with `kill <pid>`. On Windows:
  `netstat -ano | findstr :8000`, then `taskkill /PID <pid> /F` (not run). To use another port, start Uvicorn with
  `--port 8001` and start the front end with `VITE_API_BASE=http://127.0.0.1:8001 npm run dev` (not run; the proxy
  in `vite.config.ts` points at 8000). If 5173 is busy, Vite is expected to take the next free port, which the back
  end's CORS list does not include; set `EXPLORER_CORS_ORIGINS` to match (not tried).
- **The environment is not active.** `No module named uvicorn` (or `fastapi`, `pandas`) means the shell is using
  another Python. Run `conda activate cos30049-a3`, then check `which python` (macOS) or `where python`
  (Windows, not run).
- **Node is too old.** `node --version` must print v22 or later; `package.json` requires it. Install the current
  LTS from nodejs.org, open a new terminal and run `npm ci` again.
- **The page says the service is starting (or the status indicator shows "starting").** The models take about a
  second to load; until then `GET /api/health` answers 503 with "The explorer service is still starting."
  and the front end retries by itself. It was seen for the first one to three seconds after a start. If it stays,
  read Uvicorn's log: a line beginning "The explorer models could not be loaded" says what is missing.
- **A blank page, or "no answer" messages.** The back end is not running, or not on port 8000. Check
  `curl http://localhost:8000/api/health`.
- **A library-version message at start.** The saved models need Assignment 2's exact versions. Recreate the
  environment from `backend/environment.yml` rather than installing newer libraries.

## More

- `backend/MODIFICATIONS.md` lists every change made to Assignment 2's behaviour for the web, with the test that
  covers it.
- `docs/WORKLOG.md` records the decisions and measurements behind the build.
