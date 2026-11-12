# Handoff — COS30049 Assignment 3 (for any model or person picking this up)

Written 12 Nov 2026 by the lead (Claude Opus 5.5) so that another model run through the Claude Code
CLI (for example DeepSeek) or a teammate can continue **without any earlier conversation**. Read this
whole file first, then `TODO.md`, then the newest entries of `docs/WORKLOG.md`.

---

## 1. What the project is

- **Unit:** COS30049 Computing Technology Innovation Project, Swinburne (HCMC). **Group:**
  HCMC_COS30049.1_4. **Members:** Cam Dan Bui, Cao Tri Tran (the user, GitHub `Defaul119`), Le Quang Anh
  Hoang, Minh Khang Nguyen. **Tutor:** Arthur Hoang.
- **Assignment 3** (45 % of the unit): a full-stack web app on Assignment 2's models. **Due Sun 6 Dec
  2026 23:59 GMT+7; planned submission Sat 5 Dec.**
- **The product:** *Bitcoin Address Activity Explorer*, a React + TypeScript (Vite) front end and a
  FastAPI back end around A2's `Predictor`. It shows one Bitcoin address's activity per day, marks
  transactions that are **unusual compared with the same address's own earlier history**, explains
  why, shows what each of 9 models says, and lets the user try a hypothetical ("what-if") transaction.
  It is an **unusual-activity indicator, never a verdict about a person**.
- **The plan is the specification.** `docs/plan/main.pdf` (69 pages; LaTeX sources in
  `docs/plan/sections/*.tex`, which are easier to read). It defines scope IDs (M-01…M-16 Must, S-01…S-12
  Should, C-01…C-07 Could, W-01…W-08 Won't), endpoints E1–E22, views V1–V8, charts G1–G9, journeys J1–J8,
  tasks T01–T52 and milestones MS1–MS5. **Where this file and the plan disagree, the plan wins.**
  A 17-page team briefing is at `~/Desktop/COS30049/explainers/a3/a3.pdf` (sources `t01`–`t05`); its
  chart owners are stale.
- **Brief and rubric:** `docs/brief/` (Markdown). 40 of the 45 marks are judged from the running app and
  the 7-minute video; the report (8 pages) is 5 marks.

## 2. Status on 12 Nov 2026

| Milestone | Date | State |
|---|---|---|
| MS1 walking skeleton | Sun 15 Nov | **Passed 11 Nov** (fresh-clone check, `9adf130`) |
| MS2 minimum viable demonstration (all Must items except M-14…M-16) | Sun 22 Nov | **Polish in progress** (T21, T28); then the MS2 check (T29) |
| MS3 feature freeze (Should items finished or cut) | Fri 27 Nov | not started; Should items wait for MS2 |
| MS4 code freeze, tag `v1.0-rc`, clean install Win + Mac | Sun 29 Nov | |
| MS5 submit on Canvas | Sat 5 Dec | |

**Built and committed** (all on `origin/main`, private repo `github.com/Defaul119/COS30049A3`):
- **Back end, all Must endpoints:** E1 health, E2 config, E3 addresses, E4 lookup, E5 timeline,
  E6 transactions (filters, sort, paging), E7 transaction detail with all 9 methods, E8 what-if,
  E9 what-if curve (batched), E10 export CSV/JSON, E11 methods. ETag/304, 413, one error body,
  validation as 400 with every faulty field. **601 tests.**
- **Front end:** shell (navigation, service status, theme, toasts, error boundary), Axios client,
  V1 address selection, V2 overview + Transactions tab (filter bar, table, G2) + What-if tab (V4, G5),
  V3 day and transaction (G3, verdict table), V5 models and limits, V7 about, export menu, charts
  G1/G2/G3/G5 in Plotly. **445 tests.**
- **In flight when this was written:** the *frontend-polish* package (T21 state catalogue, T28 layouts
  and touch targets, G5 tick labels, method names from E11, About list wording, screenshots into
  `docs/screenshots/`, MS2 dry run). It is **uncommitted** in the working tree. See §8 for how to finish
  it if its agent is gone.

## 3. Where everything is

| What | Path |
|---|---|
| A3 repository (work here) | `~/Desktop/COS30049/COS30049A3` (branch `main`) |
| Task list (keep current) | `TODO.md` |
| Engineering log (append-only; source for the technical document) | `docs/WORKLOG.md` |
| AI use log (source of the report's AI declaration) | `docs/AI_USE_LOG.md` |
| The plan | `docs/plan/main.pdf`, `docs/plan/sections/*.tex` |
| Brief | `docs/brief/` |
| README (draft; T43 completes it) | `README.md` |
| Web changes to A2 code, each with its test | `backend/MODIFICATIONS.md` (Mod-1…Mod-14 so far) |
| API contract | `backend/openapi.json` (regenerate: `python -m app.core.openapi` from `backend/`) |
| Front-end contract | `frontend/src/api/types.ts` (a back-end test parses it, see §6) |
| Shared test vectors (pytest **and** Vitest) | `shared/address_vectors.json`, `shared/whatif_vectors.json` |
| Assignment 2 repository (**read-only**) | `~/Desktop/COS30049/COS30049A2` (tag `v1.0` → `aa56a26`, local only, not pushed) |
| A2 submitted zip (downloaded) | `~/Downloads/COS30049A2_submisison-20261111T145705Z-1-001.zip` |
| Assistant weights (610 MB, verified, git-ignored) | `~/Desktop/COS30049/A2_submitted_artifacts/models/assistant/` (also copied into `backend/models/assistant/`) |
| A1 prototype (origin of the front end) | `~/Desktop/COS30049/asm1_demo` (commit `8375cf0`) |

## 4. Machine and tools (Mac, Apple M5, macOS 26.6)

- **Node v24.22.2** in `~/.local/node`, linked from `~/.local/bin` (already on the zsh PATH). In
  non-interactive shells run `export PATH="$HOME/.local/bin:$PATH"` first.
- **Python:** conda at `~/miniconda3` (not on the PATH; the `defaults` channel was removed, so use
  conda-forge). Back-end env **`cos30049-a3`** → `~/miniconda3/envs/cos30049-a3/bin/python`
  (Python 3.11.18, numpy 2.2.6, pandas 2.2.3, scikit-learn 1.6.1, FastAPI 0.162.4, Uvicorn 0.54.0,
  Pydantic 2.14.3, httpx2 2.16.0, pytest 9.2.0). A2's env `cos30049-a2` also exists.
- **The Apple Command Line Tools disappeared on 12 Nov 08:24**, so `/usr/bin/git` and `/usr/bin/python3`
  do not work (they ask to install developer tools). Workaround in place: **git 2.56.1 from conda**
  (`~/miniconda3/envs/tools/bin/git`, linked as `~/.local/bin/git`). Use the conda Python for every
  Python command. The user can restore the tools with `xcode-select --install` (needs their password).
- **GitHub CLI:** `~/.local/bin/gh`, logged in as `Defaul119`. Pushing over HTTPS works.
- **No sudo, no Homebrew.** Never try to use either.

## 5. How to run, test and verify

```bash
export PATH="$HOME/.local/bin:$PATH"; cd ~/Desktop/COS30049/COS30049A3
P=~/miniconda3/envs/cos30049-a3/bin/python

# back end
cd backend && $P -m uvicorn app.main:app --port 8000      # ready ~1 s; /docs lists every endpoint
$P -m pytest -q                      # full suite, 601 tests, ~2 min, warnings are errors
$P -m pytest -q -m "not slow"        # quick run, ~430 tests, ~28 s (inner loop only)
PARITY_FULL=1 $P -m pytest -q tests/test_whatif_parity.py   # 1,517 amounts, ~8 min (optional)
cd .. && $P tools/vendor_a2.py --check                       # A2 files unchanged (hashes)

# front end (second terminal; Vite proxies /api to 127.0.0.1:8000)
cd frontend && npm ci && npm run dev  # http://localhost:5173
npm test                              # Vitest, 445 tests, 0 skipped
npm run typecheck && npm run build    # must be clean, no warnings
VITE_API_MODE=mock npm run dev        # runs on the recorded fixtures, no back end
npm run fixtures                      # re-record fixtures from a running back end
npm run screenshots                   # layouts at 390/820/1280; fails on sideways scroll
```

**The verification protocol before every push** (each step exists because skipping it once caused a problem):
1. `git diff --cached --name-only` shows only the files you mean to commit (an agent once left paths staged).
2. Commit locally. Then verify **in a clean worktree of that commit**, never in a working tree that
   another agent is editing:
   ```bash
   W=/tmp/a3-verify; git worktree add -q --detach $W HEAD
   (cd $W && $P tools/vendor_a2.py --check)
   (cd $W/backend && $P -m pytest -q)                         # FULL suite, not a subset
   (cd $W/frontend && npm ci && npm test && npm run typecheck && npm run build)
   git worktree remove --force $W
   ```
   **Run both suites whatever tier you changed**: `backend/tests/test_schemas.py` parses
   `frontend/src/api/types.ts`.
3. Only then `git push`.
4. For a suspected flaky test, run the full suite 3 times with `-rf` and record the failing test names.

## 6. Rules that must not be broken

**Content and wording**
- **Wording rule.** Never use the words in `backend/config/settings.json` → `bannedWords` (fraud,
  criminal, illicit, guilty, suspicious) in any UI string, API message, test name, document or commit
  message. Say "unusual", "flag", "worth a look". Every flagged item carries the limitation line:
  *"Unusual activity requires investigation; it does not indicate wrongdoing."*, and so does every
  export (CSV: every row; JSON: at the top).
- **A2's numbers are frozen** (scope W-06). Never retrain, re-tune or regenerate any model or data file.
- **The vendored A2 code is never edited**: `backend/explorer/`, `backend/lm/`, `backend/models/`,
  `backend/data/` (hashes in `backend/A2_VENDOR.json`). Web changes go in `backend/app/` and get a
  row in `backend/MODIFICATIONS.md`.

**Single sources of truth**
- **The flag threshold comes only from the API** (E2 `thresholds.flagAbsZ` = **5.0**, A2's *tuned*
  value saved with the baseline model). `settings.json` → `baseline.flagAbsZ` = 3.5 is A1's untuned
  default and must never reach the screen (D-W-10).
- **One settings file**, `backend/config/settings.json`, imported by the front end at build time and
  served by E2 at run time. Never copy it.
- **Limits** live in `settings.json` → `web` and are enforced by the server and mirrored in the browser.

**Git and process**
- **Commits:** identity `Defaul119 <231157022+Defaul119@users.noreply.github.com>` (already set in the
  repo's git config). **Never add a `Co-Authored-By` line or any AI attribution** to commit messages
  or PRs. This is the user's explicit instruction; AI use is declared in `docs/AI_USE_LOG.md` instead.
- **The repository stays private** until marks are released (D-A3-1).
- **No working-tree-wide git command** (`stash`, `checkout`, `reset`) while another agent is editing
  the tree. Compare builds in a worktree.
- **If you delegate to sub-agents:** they write only in their assigned folders, run **no git commands**,
  stop their servers by PID, and report. The lead reviews, verifies (§5) and commits. Verify their
  claims against `git status` and the build: about a third of agent reports contained a false claim.
- **Should items only after MS2** (the plan's risk 6). Could items only after MS3, with a logged change.
- **Log as you go:** append a dated entry to `docs/WORKLOG.md` (Context / Decisions / Done / Evidence /
  Open, plus design notes worded for the technical document). Add a row to `docs/AI_USE_LOG.md` for
  every session, naming the model actually used (for example "DeepSeek via Claude Code CLI").
  Keep `TODO.md` current (`[ ]` open, `[~]` in progress, `[x]` done with the commit hash).

## 7. Decisions so far (details in `docs/WORKLOG.md`)

| ID | Decision |
|---|---|
| D-W-01 | Local git repo on `main`; a private remote only with the user's approval (given 11 Nov) |
| D-W-02 | Node v24.22.2 installed per user into `~/.local` (checksum verified) |
| D-W-03/06 | A3 loads A2 commit `aa56a26`, tagged `v1.0`: the submitted zip equals it plus wording-only edits |
| D-W-04 | One settings file: `backend/config/settings.json` |
| D-W-05 | Work split by tree (back end / front end) so agents never collide |
| D-W-07 | The Assistant's weights exist (in the submitted zip, hash-verified); S-05 can use them |
| D-W-08 | Remote `Defaul119/COS30049A3`, switched from public to **private** before the first push |
| D-W-09 | `EXPLORER_ASSISTANT` defaults to `off` until S-05 builds E12; then back to the plan's `auto` |
| D-W-10 | Thresholds only from the API (5.0), never `baseline.flagAbsZ` (3.5) |
| D-W-11 | The limitation line is on every CSV row, not only flagged ones |
| D-W-12 | E6/E10 `sort=amount` orders by absolute amount |
| D-W-13 | BTC amounts in server text are written to 8 decimal places (web-layer rewrite; A2 untouched) |

## 8. What to do next, in order

1. **Finish the frontend-polish package** (uncommitted in `frontend/` and `docs/screenshots/`). If its
   agent is gone, finish it yourself:
   - (a) `cd frontend && npm test && npm run typecheck && npm run build` and fix what fails.
   - (b) Check the brief items: every view handles the plan's state catalogue (`s11-errors.tex`: invalid,
     unsupported, loading, empty, insufficient history, network, timeout, server error, unavailable,
     too large, rate limited, offline banner); G5's log-axis tick labels no longer overlap; method names
     come from E11 everywhere; the About page's feature list reads "Size, Burst, Gap and Relative size";
     `docs/screenshots/` holds the useful shots, under 15 MB in total.
   - (c) Wording check, no mock in `dist/` (`ls dist/assets | grep -i mock` must print nothing), and the
     main chunk under ~145 kB gzip.
   - (d) Verify per §5, commit, push, log.
2. **The MS2 check (T29), run by the lead**, exactly as `docs/plan/sections/s04-scope.tex` §"minimum
   viable demonstration" states. On all 28 snapshot addresses, with both servers started from the README:
   - (1) J1, J2, J3 pass (AC-01, AC-02, AC-03 and all five FR-05 states);
   - (2) J4: a what-if returns every model's verdict, and an invalid value is refused by the browser
     **and** by the server;
   - (3) three chart types on screen (G1 bar, G2 scatter, G5 line) with zoom, tooltips, title, units,
     legend and snapshot date;
   - (4) the API uses GET and POST and `/docs` lists every endpoint;
   - (5) the wording test finds no banned word in any response or screen, and every flag shows the
     limitation line;
   - (6) layouts at 390/820/1280 with no sideways scrolling.

   Record the result in `docs/WORKLOG.md` and a `docs/TEST_LOG.md` entry (the plan asks for a test log).
3. **Should items after MS2, in the plan's build order** (cut from the bottom if time runs short):
   - T30 S-01 method selector: the back end already accepts `?method=` on E3/E5/E6/E7/E10; the front-end
     menu is missing.
   - T31 S-02 G4 and S-03 G6.
   - T32 S-04 watchlist: SQLite, E13–E15, V6.
   - T33 S-05 Assistant: E12. Then restore `EXPLORER_ASSISTANT=auto` (D-W-09).
   - T34 S-06 replay.
   - T35 S-07 linked selection and S-08 scenario table.
   - T37 S-10 types from OpenAPI and CI.
   - T38 S-11 browser tests and S-12 `tools/measure.py`.
   - T36 S-09 live lookup **only if the team approves CR-08 by 22 Nov**.
4. **Test and fix:** T39 usability walkthrough (people needed; prepare the script and sheets), T40
   accessibility (automated checks plus a keyboard pass), T41 fixes.
5. **Freeze and package:**
   - T42 MS3;
   - T43 README complete, docstring pass, `MODIFICATIONS.md`, a licence line in `LICENSES.md`;
   - T44 clean install from a trial zip on macOS (and the user on Windows);
   - T45 MS4 `v1.0-rc`;
   - T47 report material (API tables from `openapi.json`, measured tables from `measure.py`, screenshots);
   - T50 tag `v1.0`, build the zip from the tag (`tools/package.py`, not written yet), checksums, unzip
     and run.

**Open review findings:**
- Plotly's range buttons and legend are under 44 px touch targets (partly addressed by polish; see its report).
- Scrolling past a chart on a real phone is not verified.
- The About wording and the G5 ticks may be done by polish; check.

## 9. Things only the user or the team can do

- **Ask the tutor** whether A2's generative-AI arrangement (allowed, with a separate declaration) covers
  A3; the brief alone says AI must not generate content. All use is logged in `docs/AI_USE_LOG.md` either
  way. (Also: the downloaded A2 submission contained no separate AI declaration; worth checking with
  the team.)
- **CR-07** (scope) and **CR-08** (live lookup) need all four members' recorded votes (plan Appendix A).
  CR-08 by 22 Nov, or T36 never starts.
- **Restore the Command Line Tools:** `xcode-select --install`.
- **Push A2's `v1.0` tag** if wanted (`git -C ~/Desktop/COS30049/COS30049A2 push origin v1.0`; that repo is public).
- **Usability sessions, the Windows clean install, the video (recording and narration), report writing,
  minutes, the contribution form, the Canvas upload.**

## 10. Lessons and traps (each one cost time once)

- **E5 `range.start`/`end` are timestamps, not days.** Use `dayKey()` on the front end.
- **Floating-point noise.** Regression, fusion and k-means scores differ in the 15th digit between
  code paths and even between runs (multithreaded BLAS). Compare flags exactly and scores with the
  1e-12 helper `agree()` in `backend/tests/test_whatif_parity.py`. Never compare scores with `==`.
- **Never assert on wall-clock ratios** in pass/fail tests; they fail under load. Timings belong to
  `tools/measure.py` (S-12).
- **The mock must not ship.** It is imported only under `import.meta.env.VITE_API_MODE === 'mock'`
  (a build-time literal). Check `dist/` after building.
- **ETag hashing sits inside gzip** (gzip stamps the time, so hashing compressed bytes breaks 304s).
- **Plotly reports its own redraws as zoom (relayout) events.** `PlotlyChart` ignores them during a
  redraw; without that, the date filters drifted in a loop.
- **The default E9 curve answers 400 on `direction`** when that direction has no earlier history at
  that time; the lab falls back to a range around the typed amount.
- **Usage limits:** a high-effort agent package costs ~250–350k tokens. Two in parallel plus review used
  up a 5-hour window in about 4 hours. Plan one or two packages at a time, most important first. An
  interrupted agent's work stays on disk; resume it rather than restarting.
- **Servers left running:** agents sometimes leave Uvicorn/Vite running. Check
  `ps -eo pid,command | grep -E "uvicorn|vite"`, find the owner (`lsof -a -p PID -d cwd`), and stop only
  what is not in use.

## 11. Delegation brief template (if you use sub-agents)

> You are the **<name>** cook on COS30049 Assignment 3 (Bitcoin Address Activity Explorer: React +
> TypeScript + Vite over FastAPI around A2's `Predictor`). A lead reviews and commits your work.
> Build **<tasks with IDs>** and report back.
> **Where things are:** repo `~/Desktop/COS30049/COS30049A3`, head `<hash>`;
> `export PATH="$HOME/.local/bin:$PATH"`; Python `~/miniconda3/envs/cos30049-a3/bin/python`; current
> test counts; what already exists to reuse; the plan sections to read; the contract
> (`backend/openapi.json`, `frontend/src/api/types.ts`). Where the plan specifies something, follow it
> exactly; where it is silent, choose the simplest consistent option and say so.
> **Tasks:** numbered, each with its acceptance check.
> **Rules:** wording rule; tests, typecheck and build clean with no warnings; no dead code; **no git
> commands at all**; write only under `<folders>`; don't edit `TODO.md` or `docs/`; servers on port
> `<port>`, stopped by PID at the end.
> **Report:** files changed; test counts and build sizes; checks run (real API or mock); deviations and
> choices; problems found in other tiers (request, response, expected); 3–6 notes for the technical
> document.

**Review checklist for each returned package:**
- `git diff --cached` is empty;
- tests, typecheck and build re-run by you;
- banned-word grep;
- `vendor_a2.py --check`;
- no mock in `dist/`;
- main chunk size;
- look at 2–3 screenshots;
- probe the live API for back-end work;
- worktree verification (§5);
- commit (no AI attribution), push;
- WORKLOG entry, AI_USE_LOG row, TODO update.
