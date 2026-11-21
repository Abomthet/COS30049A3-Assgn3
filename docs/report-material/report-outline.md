# Report outline: structure and pointers only (21 Nov 2026)

This file is a skeleton for the project report. The team writes every sentence of the report; this file holds no report text.
It gives headings, a page budget, topic prompts, and where the evidence already is. Prompts are topics, not wording.
Date: 21 Nov 2026 (after MS3). Sources: `docs/brief/assignment3_description.md` (called "brief" below), `docs/brief/assignment3_summary.md`
(called "summary"), the plan `docs/plan/sections/s13-report.tex` (and `s01-deliverables.tex`, `s03-decisions.tex`), and the evidence files named per section.

## Format rules

| Rule | Source | Note |
|---|---|---|
| 8 pages at most; cover page, table of contents, bibliography and appendix are excluded | brief:83; summary:29 | The plan checks the page count on the built PDF (`s13-report.tex:48`) |
| Cover page: project title | brief:84 | |
| Cover page: group name and ID, student names and IDs, tutor's name | brief:85 | Plan cover row: `s13-report.tex:16` (tutor named there) |
| Cover page: the video link, if the video goes on unlisted YouTube; the same link goes in `group-name-video-link.txt` | brief:106; summary:37 | The brief says the link is needed only for the YouTube option. INFERRED: put it on the cover anyway (the plan does, `s01-deliverables.tex:18`) |
| Required sections: System Architecture, Front-End, Back-End incl. endpoint documentation (request type, JSON response), AI Model Integration, Conclusion | brief:86-90 | |
| Report must also cover preprocessing, postprocessing, error handling, validation, key design decisions, and an introduction | brief:66-67 | The brief lists "introduction" here but not in the deliverables list (brief:86-92). The plan adds a section 1 Introduction (`s13-report.tex:18`) |
| Back end: document at least 4 APIs "if long" | summary:30 | The plan documents E4, E5, E7, E8 in full (`s13-report.tex:21`) |
| Bibliography in Harvard style | brief:91; rubric brief:142 | CONFLICT: the plan says "Harvard style, numbered as in Assignments 1 and 2" (`s13-report.tex:27`), but Harvard is author-date, not numbered. Settle before writing |
| Diagrams or tables adapted from other sources must be cited (Harvard) | brief:132 | Plan: diagrams are the team's own (`s13-report.tex:44`) |
| Acknowledge all statements and information taken from other sources | brief:131 | |
| All generative AI use must be acknowledged in the report; AI must not be used to generate content | brief:134 | Plan puts the acknowledgement in the appendix (`s13-report.tex:49`). INFERRED: the appendix counts as "in the report". Tutor's written answer still to come (see Still missing) |
| Appendix: "additional files/info if necessary" | brief:92 | |
| File name uses the group name, e.g. `session-xx-group-1-AssignmentName.pdf` | brief:122 | Plan name: `HCMC_COS30049.1_4_Assignment3_Report.pdf` (`s01-deliverables.tex:15`) |
| Layout, font, spacing must look well organised (rubric) | brief:142 | The brief gives no font or margin values. INFERRED: none are required |

## Outline

Page budgets follow the plan (`s13-report.tex:16-25`). They sum to 7.75 pages, which leaves 0.25 spare.

| Section | Pages |
|---|---|
| 1. Introduction | 0.5 |
| 2. System architecture | 1.25 |
| 3. Front-end implementation | 1.75 |
| 4. Back-end implementation | 2.25 |
| 5. AI model integration | 1.25 |
| 6. Conclusion | 0.75 |
| Total (cover, contents, bibliography, appendix excluded) | 7.75 |

Plan writers (`s13-report.tex`): section 1 and 6 Cam Dan Bui; 2 and 4 Le Quang Anh Hoang; 3 Minh Khang Nguyen; 5 Cao Tri Tran. Confirm before use.

### Cover, contents (not counted)
- Prompts: title; group name and ID; four names and IDs; tutor; video link (unlisted, tested in a private window).
- Evidence: `docs/plan/main.tex:143-146` for the exact project, group, member and tutor details; `docs/report-material/video-shotlist.md`.
- Rubric: Report 1.

### 1. Introduction (0.5 page; INFERRED as needed, see brief:66)
- Prompts:
  - the real-world problem and who uses the tool
  - what the app does, in one line
  - what it does not claim (an indicator of unusual activity only)
  - link to Assignments 1 and 2
- Figures: none.
- Rubric: Report 2 (context).
- Read first: `docs/plan/sections/s04-scope.tex`, `README.md` (opening section), `docs/report-material/decisions.md` (part A).

### 2. System architecture (1.25 pages)
- Prompts:
  - three tiers: front end, back end, frozen A2 model
  - each technology choice with its reason (rubric asks for justification)
  - cover: why FastAPI; cite the plan's decision
  - one request traced across every layer
  - data stores, caching, load-once model
  - where the built system differs from the plan
- Figures: `docs/report-material/figures/architecture.pdf`; `docs/report-material/figures/whatif-flow.pdf`.
- Rubric: Report 2 (diagrams and flowcharts earn marks, brief:143).
- Read first: `docs/report-material/figures/README.md` (section 5, plan versus code), `docs/report-material/decisions.md`, `docs/plan/sections/s05-architecture.tex`, `docs/report-material/design-notes.md` (Back end, Front end).

### 3. Front-end implementation (1.75 pages)
- Prompts:
  - views and journeys, one line each
  - input form and its validation before sending
  - charts: which question each answers; interactivity (zoom, filter, tooltip)
  - how data reaches the back end (Axios), cancellation, error class
  - responsive layout, themes, accessibility
  - real-time behaviour: keystroke to verdict, replay, live lookup
  - bundle budget and lazy loading
- Figures (pick at most 2): `docs/screenshots/05-timeline.png`; `docs/screenshots/30-what-if-flagged.png`. Others (tablet, phone) go to the appendix.
- Rubric: Report 2; supports Visualization 1-4, Usability 1-2, Functionality 2 and 5 via video and code.
- Read first: `docs/report-material/screenshot-index.md`, `docs/report-material/design-notes.md` (Front end, Charts), `docs/report-material/measurements.md` and `docs/report-material/measured/measure.md` (bundle, chart render), `docs/plan/sections/s08-frontend.tex`, `docs/plan/sections/s09-charts.tex`.

### 4. Back-end implementation (2.25 pages)
- Prompts:
  - server set-up: lifespan load, routers, configuration
  - endpoint table: method, path, purpose (E1-E20)
  - four endpoints in full: request, parameters, JSON, example (plan picks E4, E5, E7, E8)
  - one error body and the status codes used
  - cover: why 400 and not 422
  - validation layers; limits
  - HTTP methods used (GET, POST, PUT, DELETE) and REST choices
- Figures/tables (at most 2): the endpoint table built from `docs/report-material/api-reference.md` (summary); `docs/report-material/figures/request-lifecycle.pdf`.
- Rubric: Report 3; Report 2; supports Functionality 3 and 4.
- Read first: `docs/report-material/api-reference.md` (Summary, E4, E5, E7, E8, `ErrorBody`), `docs/report-material/api-reference.tex`, `docs/plan/sections/s06-api.tex`, `docs/plan/sections/s11-errors.tex`, `backend/openapi.json`.
- Check: plan and code differ on E10 wording (`docs/report-material/decisions.md`, part C item 2).

### 5. AI model integration (1.25 pages)
- Prompts:
  - recap of Assignment 2's models and what the score means
  - preprocessing and postprocessing stages
  - modifications for web deployment, each with its test
  - what stays frozen and how that is checked (hashes)
  - measured response times, with conditions
  - which models the web uses; the optional Assistant and what exists
- Figures/tables (at most 2): modifications table from `backend/MODIFICATIONS.md`; response-time table from `docs/report-material/measured/measure.md`.
- Rubric: supports Report 2; Functionality 1 and Visualization 4 (via the measured table).
- Read first: `backend/MODIFICATIONS.md`, `backend/A2_VENDOR.json`, `docs/plan/sections/s07-model.tex`, `docs/report-material/measurements.md`, `docs/report-material/decisions.md` (part C item 4: Assistant status).

### 6. Conclusion (0.75 page)
- Prompts:
  - how the app addresses the problem (brief:90)
  - limits, stated honestly
  - areas for improvement (brief:90)
  - future enhancements (brief:90)
  - what the team learned
- Figures: none.
- Rubric: Report 2 (context); no separate row.
- Read first: `docs/plan/sections/s15-risks.tex`, `docs/report-material/measurements.md` (part 6, not measured), `docs/TEST_LOG.md`.

### Bibliography (not counted)
- Harvard style (brief:91), author-date; the plan's "numbered" (`s13-report.tex:27`) conflicts with it, see Format rules. Plan lists sources to cite (`s13-report.tex:45-47`): React, FastAPI, Plotly.js, Axios, Pydantic, Vite, Nielsen's heuristics, the Esplora API, Assignment 2's method sources.
- Rubric: Report 1.

## Appendix candidates

| Material | Source | Why appendix |
|---|---|---|
| Full API reference, all 20 operations and schemas | `docs/report-material/api-reference.md` or `.tex` | Too long for the pages; the plan asks the tutor to allow this (`s03-decisions.tex:165`) |
| Screenshots at three widths | `docs/report-material/screenshot-index.md`, `docs/screenshots/` | Index lists which file is which |
| Test log summary | `docs/TEST_LOG.md` (MS1, MS2, MS3, clean install) | Counts and gates |
| Usability findings | `docs/usability/findings-template.md` (to be filled) | Sessions not yet run |
| Accessibility checks | `docs/usability/a11y-automated-findings.md`, `docs/usability/accessibility-checklist.md` | |
| Measured performance table | `docs/report-material/measured/measure.md` | |
| Request-lifecycle figure | `docs/report-material/figures/request-lifecycle.pdf` | If not used in section 4 |
| Design decisions list | `docs/report-material/decisions.md` | Part A and B |
| Requirement traceability | `docs/plan/sections/s01-deliverables.tex` (rubric table) | Plan lists it for the appendix (`s13-report.tex:28`) |
| Acknowledgement of AI use | `docs/report-material/ai-acknowledgement-draft.md`, from `docs/AI_USE_LOG.md` | Brief:134; the team must check and complete it |

## Rubric map

The brief's table (brief:138-158) and the summary's (summary:57-73) both have 17 rows, 45 points in total. Row names differ slightly between the two; the brief's names are used here.

| # | Rubric row (pts) | Home |
|---|---|---|
| 1 | Report 1: Formatting and Referencing (1) | Cover, layout, bibliography (report) |
| 2 | Report 2: System Architecture and Implementation (2) | Report sections 2, 3, 4, 5 and figures |
| 3 | Report 3: API Endpoint Documentation (2) | Report section 4 plus appendix API reference |
| 4 | Source Code 1: Execution (2) | README, code; not a report item |
| 5 | Source Code 2: Comments (1) | Code; not a report item |
| 6 | Source Code 3: Code Structure (2) | Code; may be mentioned in section 2 |
| 7 | Functionality 1: AI Model Integration (3) | Video, code; report section 5 explains it |
| 8 | Functionality 2: Frontend/Backend Comms (4) | Video, code; report sections 3 and 4 explain it |
| 9 | Functionality 3: Error Handling and Input Validation (3) | Video, code; report sections 3 and 4 explain it (brief:67) |
| 10 | Functionality 4: Backend API Design (4) | Code, report section 4 and appendix |
| 11 | Functionality 5: Real-time Updates and Responsiveness (4) | Video, code; report section 3 |
| 12 | Visualization 1: Chart Diversity and Relevance (3) | Video, code; report section 3 |
| 13 | Visualization 2: Interactivity (4) | Video, code; report section 3 |
| 14 | Visualization 3: Data Representation Clarity (2) | Video, code; screenshots in section 3 |
| 15 | Visualization 4: Performance and Loading (2) | Video, code; measured table in section 5 or appendix |
| 16 | Usability 1: User Interface (3) | Video, code; screenshots in section 3 |
| 17 | Usability 2: User Experience (3) | Video, code; usability findings in appendix |

Report rows with no home: none (rows 1-3 each have one). Note: the report has no heading for the brief's non-report rows, so the report should state the evidence for rows 7-17 inside sections 3-5; the plan's section split already does this.

## Still missing

| Item | Where and when it comes from |
|---|---|
| Usability session findings | Sessions 25-26 Nov (`TODO.md`, item 2.4); log in `docs/usability/findings-template.md` |
| Manual keyboard and screen-reader pass | 24-26 Nov (`TODO.md`, item 2.3) |
| Windows clean-install result | 29 Nov (`TODO.md`, item 4.4); `README.md` marks Windows as not run |
| Real-phone check | 26 and 29 Nov (`TODO.md`, items 1.6 and 4.5b) |
| Tutor's written answer on AI use | Email to be saved in `docs/brief/` (`TODO.md`, item P2); the acknowledgement quotes it |
| Other members' own AI use | Draft notes the log covers one member only (`docs/report-material/ai-acknowledgement-draft.md`) |
| Team check of the acknowledgement draft | Before it goes in the appendix (`TODO.md`, item 5.3) |
| Final measured table after last front-end change | Rerun `tools/measure.py --build --charts`; current run `docs/report-material/measured/measure.md` |
| Measurements marked "not measured yet" | `docs/report-material/measurements.md`, part 6 (some may be covered by the newer run) |
| Plan-versus-code corrections (E10 wording, Assistant default) | `docs/report-material/decisions.md`, part C |
| Final split of sections between members | `TODO.md`, item P5 |
| Bibliography style: Harvard author-date (brief) or numbered (plan) | Team decision before writing; the rubric's row 1 checks Harvard |
| Tutor's answer on appendix API reference | Plan question 6 (`docs/plan/sections/s03-decisions.tex:165`); no answer recorded in the files read |
| Meeting minutes and contribution form (separate deliverables, not report) | brief:109-113 |
