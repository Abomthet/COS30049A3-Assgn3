# Acknowledgement of generative AI use — DRAFT for the team to check (wrap-up 5.3)

> **Status: draft written by Claude Code (Opus 5.5) from `docs/AI_USE_LOG.md` on 21 Nov 2026. Not yet checked by a
> member.** Before it goes in the report: (1) a member checks every sentence against the log; (2) the tutor's written
> answer on AI use (expected by email after the in-person answer of 12 Nov) is saved in `docs/brief/` and quoted where
> marked; (3) the other members add any AI use of their own that is not in the log (the log has rows from one member
> only). Keep it factual: the brief says all AI use must be acknowledged.

---

## Appendix: Acknowledgement of generative AI use

**The rule and what we were told.** The Assignment 3 brief permits generative AI for learning, idea generation and
debugging, says it must not be used to generate content, and requires all use to be acknowledged. On 12 November 2026
our tutor told Cao Tri Tran in person that using AI for this project was acceptable, as it had been for Assignment 2.
*[Quote the tutor's written confirmation here, with its date, once received; file: `docs/brief/…`.]*

**What we used.** Claude Code (Anthropic), from 11 to 21 November 2026, in 41 logged sessions, all run by Cao Tri Tran.
A lead model (Claude Opus 5.5) planned the work, wrote the task descriptions, reviewed every change and ran the checks;
smaller models did bounded tasks under that review: Claude Sonnet 5.5 (23 sessions) for features and tests, Claude
Haiku 5.5 (8) for mechanical work, Claude Fable 5.2 (1) for the architecture figures.

**What it produced.** The AI generated most of the application's source code and much of its documentation, working
from the team's delivery plan (the plan, its scope and its decisions are the team's). This includes:
- the FastAPI back end around Assignment 2's unchanged models (endpoints E1–E20, validation, error handling, caching,
  the watchlist store, the optional live lookup and the Assistant service);
- the React front end (views V1–V8, the charts G1–G6, the what-if lab, the state catalogue, layouts at three widths);
- the tests (pytest, Vitest, Playwright browser and accessibility tests), the CI workflow and the measurement script;
- the README, `LICENSES.md`, code comments, the screenshots, the architecture figures and the generated API reference.
Assignment 2's model code and saved models were copied unchanged (hashes in `backend/A2_VENDOR.json`); the AI did not
retrain or alter them.

**How we checked it.** Every AI change was reviewed before it was merged: the full test suites ran on a clean copy of
each commit before it was pushed, and claims in the AI's own reports were checked against the code and the test
results (several were found wrong and corrected; the log records each case). Milestone gates were run from a fresh
clone (`docs/TEST_LOG.md`).

**What the AI did not do.** It did not write this report's text*[— confirm when the report is written; if any part of
the report was drafted with AI, say which]*, record or narrate the video, run the usability sessions, or decide the
project's scope. *[Members: add anything else, e.g. if you used AI to learn a library or debug.]*

**Our understanding of the code.** *[Describe honestly what each member did to understand the code they present, e.g.
the guided walkthroughs of the code that Cao Tri Tran took (notes in the team folder). The brief requires that members
can explain all core logic.]*

The session-by-session record is `docs/AI_USE_LOG.md` in the repository: date, member, tool and model, what it was
used for, where the output went, and how it was checked.
