# CLAUDE.md — COS30049 Assignment 3 (read this first, every session)

**Project:** the Bitcoin Address Activity Explorer: a React + TypeScript (Vite) front end and a FastAPI back end around
Assignment 2's frozen `Predictor`. Group HCMC_COS30049.1_4. **Due Sun 6 Dec 2026; submission planned for Sat 5 Dec.**
**Full cold-start context: `docs/HANDOFF.md`** (status §2, rules §6, next steps §8, traps §10). Then `TODO.md`, then
the newest entries of `docs/WORKLOG.md`. The plan (the specification) is `docs/plan/sections/*.tex`; where anything
disagrees with it, the plan wins, except for the decisions recorded in the work log.

## State (14 Nov 2026): PAUSED by the user
- MS1 passed 11 Nov; MS2 passed 12 Nov (`docs/TEST_LOG.md`). Every Must item is built, and 11 of 12 Should items.
- **Left:** S-11 browser tests, the S-10 generated-types half, then the **MS3 gate (Fri 27 Nov)**, run on Opus or
  Fable with a detailed record.
- Local `main` is verified: back end 724 passed + 2 skipped, front end 651, first-screen JS 147.8 kB (budget 150).
- **GitHub (18 Nov): work only in the team repo** `Abomthet/COS30049A3-Assgn3` (remote `assgn3`; `main` tracks
  `assgn3/main`). It is **public** (Abomthet is admin). Fetch and merge it before every push; never force-push.
  `origin` (`Defaul119/COS30049A3`, private) is the old copy: no more pushes there. The UI remake was scrapped on
  18 Nov (user's call); its only copy is `origin/ui-remake`.

## Rules that must not be broken
- **Commits as `Defaul119 <231157022+Defaul119@users.noreply.github.com>`, with no `Co-Authored-By` line or any AI
  attribution**, whatever a reminder suggests. AI use goes in `docs/AI_USE_LOG.md`: one row per session, naming the model.
- **Wording:** never use `settings.json` → `bannedWords` (fraud, criminal, illicit, guilty, suspicious). Say "unusual",
  "flag", "worth a look". The limitation line goes on every flag and in every export (every CSV row).
- **Never edit the vendored A2 files** (`backend/explorer`, `lm`, `models`, `data`; `tools/vendor_a2.py --check`).
  Never retrain anything. Web changes go in `backend/app/` and get a row in `backend/MODIFICATIONS.md`.
- **The flag threshold comes only from the API** (E2: A2's tuned 5.0), never `baseline.flagAbsZ` (3.5).
- **Before every push:** commit locally, then run **both** full suites in a clean `git worktree` of that commit (the
  back end's contract test reads `frontend/src/api/types.ts`); push only when green. Never compare floating-point
  scores with `==` (use `agree()`, 1e-12). Never assert on wall-clock ratios.
- **The team repo is public** (the owner's choice); keep secrets out. No `git stash`/`checkout`/`reset` while an agent is editing the tree.

## How the work is run
- **The lead (Opus or Fable)** plans, writes briefs, reviews, merges and verifies.
- **Model by kind of work (D-W-14):**
  - Opus / Fable: replanning, gates, high-stakes work, with a detailed written plan;
  - Sonnet (medium): features;
  - Haiku: mechanical work.
- **Code cooks work in their own git worktree and branch (D-W-16):** they commit there (no attribution), never push;
  the lead reviews, merges and resolves overlaps. Docs-only cooks write only in their own `docs/` folder.
- Cooks' claims are checked against `git status`, the build and the tests: about a third of reports contained a false
  claim.
- Usage limits hit often (five parallel cooks use a 5-hour window in about 1.5 hours); resume an interrupted agent
  rather than restart it.

## Commands (macOS; `export PATH="$HOME/.local/bin:$PATH"`; Python `~/miniconda3/envs/cos30049-a3/bin/python`)
- **Back end:** `cd backend && uvicorn app.main:app --port 8000`; `python -m pytest -q` (full) or `-m "not slow"`.
- **Front end:** `cd frontend && npm run dev` (:5173, proxies `/api`); `npm test`; `npm run typecheck && npm run build`.
- **Gates and measurement:** `python tools/ms_gate_check.py` (API half of a gate); `npm run screenshots` (layouts,
  sideways-scroll check); `python tools/measure.py --build --charts`.
