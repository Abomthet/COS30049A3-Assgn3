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
