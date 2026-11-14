# Findings log: usability walkthrough (T39) and accessibility inspection (T40)

One log for both. Walkthrough issues get IDs U-01, U-02, …; accessibility issues get A-01, A-02, … Add a row
for every problem seen, then rate it. Every issue rated 3 or 4 is fixed and retested before MS4 (Sun 29 November
2026). The severity scale is in `observation-sheet.md`.

**Task** is 1 to 5 (walkthrough) or "A" (accessibility, see `accessibility-checklist.md`). **Evidence** names the
session and participant code (for example S1-P1, 25 Nov, 02:14) or the checklist item, plus the screenshot file in
`docs/screenshots/` if one exists. **Retest result** is pass, fail or not yet, with the date and build.

## 1. Issue log

| ID | Task | Severity (0 to 4) | Description (what happened; view and route) | Evidence (session, participant, time, or checklist item; screenshot) | Fix (what changed; commit or file) | Retest result (pass/fail/not yet; date; build) |
|---|---|---|---|---|---|---|
| U-01 | | | | | | |
| U-02 | | | | | | |
| U-03 | | | | | | |
| U-04 | | | | | | |
| U-05 | | | | | | |
| A-01 | A | | | | | |
| A-02 | A | | | | | |
| A-03 | A | | | | | |

**Rules:**
- Describe what was seen, not the suspected cause.
- A participant reading a flag as a claim of wrongdoing is severity 4; quote their words.
- Fixes use the app's wording: "unusual", "flag", "worth a look".
- A fix needs a failing-then-passing test where the team's rules require one (`docs/HANDOFF.md` §5).
- A retest is done by someone who has not seen the fix.

## 2. Summary table for the report (appendix: usability results)

| Task or check | Participants | Completed yes | partly | no | Median time (mm:ss) | Issues rated 0 | 1 | 2 | 3 | 4 | Open 3 or 4 at MS4 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Task 1: open an address's activity | | | | | | | | | | | |
| Task 2: find a day with unusual activity | | | | | | | | | | | |
| Task 3: the marker and what it means | | | | | | | | | | | |
| Task 4: look up an address outside the snapshot | | | | | | | | | | | |
| Task 5: how large a payment would stand out | | | | | | | | | | | |
| Accessibility inspection (A) | n/a | n/a | n/a | n/a | n/a | | | | | | |

**Notes for the report:**
- the number of sessions;
- that no participant built the app;
- the Task 3 count of "worth a closer look" readings versus others (no names quoted);
- each issue rated 3 or 4, with its ID, fix and retest result;
- which tasks were not run, and why.

## 3. Fixed and retested

| ID | Severity | Fix | Retested on (date and build) | Result |
|---|---|---|---|---|
| | | | | |
