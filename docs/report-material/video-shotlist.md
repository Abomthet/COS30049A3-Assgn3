# Video shot list (T48): the briefing's plan, updated to what is built

Source plan: the briefing's section "The video is the marking session" (`~/Desktop/COS30049/explainers/a3/t05-people-rules.tex`)
and `docs/plan/sections/s13-report.tex`, "The video". Both give 6:35. The brief allows at most 7:00 (`docs/brief/assignment3_description.md`,
section 3). This list keeps the 6:35 timing; the changes are marked.

**Speakers** are named as the briefing names them: **Dan** = Cam Dan Bui, **Hoang** = Le Quang Anh Hoang, **Khang** = Minh Khang
Nguyen, **Tri** = Cao Tri Tran.

**Addresses and inputs used** (the example data, from `frontend/src/api/mock/fixtures/examples.json`):
- Running example: `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz` (377 transactions in the snapshot; 3 unusual).
- Flagged day and transaction: `2024-07-11`, `c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140`.
- Early transaction, not scored: `2024-05-16`, `39c9f9c72d29cccbe0e3c4aab9a54bd1dbbeb2863f5a3e52ae5ccf9dc7465448`.
- Typo: `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dq` (one character wrong). Outside the snapshot: `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`.
- Short-history address: `bc1qx2stewzm2cel6ytwzraxt9z4d9vlh8e5gdnun6`; its transaction `2026-10-03`, `7df0c5cd25eb19c51565a33bd4c88150a4172c919213fc9d577b280580f9d0cc`.
- What-if: `0.05` BTC, out, at `2026-10-20T12:00:00Z` (flagged, 5.98 against 5.00). Not flagged: `0.0005`. Refused: `0.123456789`.

**Routes** (development run, `http://localhost:5173`, hash router; the production one-command mode is a Could item and not checked):
`#/` (V1), `#/address/{address}` (V2), `#/address/{address}/transactions` (V2 tab), `#/address/{address}/day/{date}/tx/{txid}` (V3),
`#/address/{address}/what-if` (V4), `#/models` (V5), `#/watchlist` (V6), `#/about` (V7). API page: `http://127.0.0.1:8000/docs`.

**Rubric lines** are the brief's (`docs/brief/assignment3_description.md`): Functionality 1 to 5, Visualization 1 to 4, Usability 1 to 2,
Source Code 1 to 3, Report 1 to 3. The plan's "Visualisation" is the same line.

**Status key:** *Built* = in the code and in the screenshots (or the TEST_LOG record). *Depends on unbuilt* = shows a feature that
does not exist yet. *Check* = built, but one detail the segment needs is not shown in any record yet.

| Time | On screen (route, address, inputs) | Rubric line(s) | Speaker | Status |
|---|---|---|---|---|
| 0:00–0:20 (20 s) | Title card (a slide the team makes, not a screen): project, group, members. What the Explorer is, in one sentence. The limitation line: "Unusual activity requires investigation; it does not indicate wrongdoing." Start on `#/`. | Context for all lines; no rubric line of its own | Dan | Built (the line is on every flagged screen, `frontend/src`); title card not made |
| 0:20–0:45 (25 s) | Terminal 1: `cd backend && uvicorn app.main:app --port 8000` (ready after about 1 s; see measurements). Terminal 2: `cd frontend && npm run dev`. Browser: `http://localhost:5173/api/health` (200, ready). Then `http://127.0.0.1:8000/docs`, the generated API page with all 15 operations. | Source Code 1 (execution); Functionality 4 (API design, documented) | Hoang | Built |
| 0:45–1:35 (50 s) | **J1.** `#/`: type `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz` and open it. `#/address/1Bbcsfxj…3dz`: the tiles; chart G1 with its range slider; a hover tooltip; click the flagged day `2024-07-11` (opens the day view). | Visualization 1 (chart types), 2 (interactivity: slider, tooltip, click); Functionality 5 | Khang | Built (G1 has a range slider, `frontend/src/charts/G1DailyActivity.tsx`) |
| 1:35–2:25 (50 s) | **J2.** `#/address/…/day/2024-07-11/tx/c91d9fbb…73140`: the transaction; the reason, the comparison basis and the limitation line; chart G3; the nine models' verdicts on the same page. | Functionality 1 (AI model integration: all nine models); Visualization 3 (legends, titles, units); Functionality 2 (GET) | Tri | Built (TEST_LOG J2 record; screenshots 08 and 53) |
| 2:25–3:25 (60 s) | **J4.** `#/address/…/what-if?direction=out`. Type `0.05`: the verdict and the chart G5 update as typed (250 ms after the last key). Then three refused inputs, each with its own message and no request sent: `0.123456789` (too many decimals, shot 34), `-1`, and `abc`. Move the slider along the curve. Switch the direction to `in`. | Functionality 5 (real-time); Functionality 3 (validation, refusals); Visualization 2 | Tri | Confirmed in the browser by the MS2 dry run (12 Nov): `0.123456789`, `-1`, `abc`, `0`, `1,000.5` and `30000000` are each refused with their own message, and no request is sent. Direction is two buttons, so it cannot be mistyped; show the server's own 400 with a direct request if wanted (`docs/TEST_LOG.md`, MS2 row 2) |
| 3:25–4:05 (40 s) | **J5 and J6.** `#/address/…/transactions?status=flagged`: the filter chips. Zoom on chart G2 (drag the time axis, then reset). Click a point (not yet confirmed to open the transaction; check). Export CSV (E10 file, `1Bbcsfxj-2026-10-22.csv`) and open it in a spreadsheet; the limitation line is on every row. Save chart G2 as PNG. | Visualization 2 (zoom, filtering, tooltips); Usability 2 (export, feedback) | Khang | Built: chips, zoom, CSV and PNG. **Check:** "a point opened" |
| 4:05–4:40 (35 s) | **J3.** Typo `1Bbcsfxj…3dq` on `#/?q=…`: the message is shown before any request. `1A1zP1eP…fNa` (outside the snapshot): the unsupported answer with examples. `bc1qx2stewzm…nun6`: short history, transactions listed unscored. Then stop the back end (Ctrl-C in terminal 1): the service status shows the network state; start it again: the views recover by themselves, with no click. | Functionality 3 (error handling and validation); Functionality 2 (comms, recovery) | Hoang | Built (shots 02, 03, 06, 09, 11, 39; recovery is in the WORKLOG). **Check:** the live stop-and-restart is not in the screenshots; record it on the real service |
| 4:40–5:15 (35 s) | The Should items that made MS3. S-01: `#/address/…?method=regression` (the deciding method changes the flags; shot 48). S-04: the star opens the watch dialog with a label and a note (shot 51); `#/watchlist` lists the entries (shot 49). S-06: the replay at 20 a second, part way through (shot 55). **S-09 live lookup: not built.** | Functionality 1 (method choice); Usability 2 (watchlist, feedback); Functionality 5 (replay updates); Visualization 2 | Khang | S-01, S-04 and S-06 **built**. **Depends on unbuilt S-09** (no E16 to E20 in the schema, no screen). If S-09 is not built by MS3 (27 Nov), replace the live lookup with the watchlist note alone, and give the 10 seconds to the limits (see 5:45) |
| 5:15–5:45 (30 s) | The same journey at 820 px (`#/address/…`, shots 12, 13, 23, 32, 37, 45) and at 390 px (shots 14, 15, 16, 24b, 33, 38), with the dark theme (46). Then a clip of a real phone: scrolling past a chart. | Usability 1 (responsive layouts); Functionality 5 (across devices) | Khang | Layouts **built** (no sideways scroll, shot script). **Depends on a real device** for the phone clip; scrolling past a chart on a real phone is not verified (WORKLOG) |
| 5:45–6:35 (50 s) | The architecture figure (**not drawn yet**: there is no figure file in the repository; the plan's section 5 has the text). Three decisions: the batched what-if (one feature build for 41 amounts, parity to 1e-12; WORKLOG "Why one batch is valid"); 400 against 422 (D-A3-5); the copied Assignment 2 package with hashes, names unchanged (D-A3-1). Two difficulties: the flaky test found by recording failing names (WORKLOG 12 Nov, `==` on scores); the BLAS noise (WORKLOG 11 Nov). Then the limits. | Report 2 (architecture) mirrored; Source Code 3 (structure); the brief's "key technical decisions and challenges" | Dan, then all | Decisions and difficulties **built as records**. **Figure not drawn.** Limits: say the live lookup is not in this build (if so), the Assistant has no screen, and a real-phone scroll is not verified |

## Totals and changes from the briefing's plan

- Segment times add to **6:35** (20 + 25 + 50 + 50 + 60 + 40 + 35 + 35 + 30 + 50 seconds). Spare: **25 s** to the 7:00 limit.
- **Changed:** 4:40–5:15 now names what is built (method selector, watchlist, replay) and depends on S-09; the briefing's list had the live lookup in it.
- **Added to the checks:** "a point opened" in J5/J6; the live stop-and-restart in J3.
- **Not in the shot list, not built:** the Assistant (S-05): E12 exists in the back end, but no screen calls it. Do not show it unless the front end gets a button first.
- **Speaker split**: the briefing gives Dan 0:00–0:20 and 5:45–6:35 (with all), Hoang 0:20–0:45 and 4:05–4:40, Khang 0:45–1:35, 3:25–4:05, 4:40–5:15 and 5:15–5:45, Tri 1:35–3:25. Unchanged.

## Before recording (from the plan)

- Write the script and time it in a rehearsal; 1080p; browser zoom so the text reads; notifications off.
- Choose the example address and the what-if values (above). If S-09 is shown, one lookup cached and one short fresh one.
- After recording: check the length is under 7:00 and the sound is clear; export H.264 MP4; check the size against Canvas's limit.
- Upload an unlisted YouTube copy and open it in a private window the day before submission (plan risk 8). The brief says that if the video cannot be opened at grading time, most components score zero.
