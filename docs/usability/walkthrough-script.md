# Usability walkthrough: facilitator's script (T39, M-15)

Two sessions, Wednesday 25 and Thursday 26 November 2026, on the MS2 build. Minh Khang Nguyen facilitates; Cam Dan Bui observes with the observation sheet (`observation-sheet.md`). Participants must not have built the application.

Read the whole script once before a session. Words in **bold** are read aloud as written. Everything else is the facilitator's note.

---

## 1. Set-up checklist

Do this before each session. Tick each line.

- [ ] **Back end running.** In a terminal:
  ```bash
  cd ~/Desktop/COS30049/COS30049A3/backend
  conda activate cos30049-a3
  uvicorn app.main:app --port 8000
  ```
  Wait for the log line `Explorer ready: 28 addresses, 9 methods`.
- [ ] **Back end answers.** In a second terminal, `curl http://localhost:8000/api/health` shows `"status":"ok"`, `"addressCount":28` and `"methodCount":9`.
- [ ] **Front end running.** In a third terminal:
  ```bash
  cd ~/Desktop/COS30049/COS30049A3/frontend
  npm run dev
  ```
  Open <http://localhost:5173>. Do not use `VITE_API_MODE=mock`; the session must run on the real back end.
- [ ] **Connected.** The service-status dot in the header shows the service as available. If it says starting or offline, wait or fix it before the participant arrives.
- [ ] **Browser.** Use the same browser for every session (choice: Google Chrome, which `npm run screenshots` also uses). Use a new private window, the browser at 100 % zoom, a desktop-width window (about 1280 px), light theme. Close other tabs and hide bookmarks.
- [ ] **Rehearsal done.** Run all five tasks yourself once with a timer. Then, for Task 3, open the running example, find one flagged day and one flagged transaction on it, and write their date and transaction ID on the Task 3 card. Do not guess them.
- [ ] **Values checked on this build.** (a) `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz` opens and has flagged days. (b) `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` gives the "not in the snapshot" panel. It is the Bitcoin genesis-block address; the snapshot holds 28 addresses and this one is not among them. (c) The what-if in Task 5 gives a verdict, and the sentence under the curve gives a threshold. Note the threshold you see; the plan's wording reads about 0.023 BTC for a sent amount, but use what the build shows.
- [ ] **Printed.** Consent form (two copies), this script, the observation sheet for the session, and the task cards (Card 3 with the chosen flagged day, Card 4 with the outside-snapshot address).
- [ ] **Recording.** Only if the participant ticks the recording box on the consent form. Test the screen recorder before the participant sits down. Save the file as `session-N-P-initials-date.mov` (for example `session-1-P1-AB-25nov.mov`), never with a full name.
- [ ] **Roles fixed.** Facilitator reads the script and does not help during tasks. Observer records on the sheet and does not speak.
- [ ] **Timer and stopwatch** ready. Start the time when the instruction ends.

---

## 2. Opening (read aloud)

**Welcome.**
"Thank you for coming. We are testing the design of a web application called the Bitcoin Address Activity Explorer. It shows, for one Bitcoin address, its activity day by day, and it lets you look at the transactions behind it. We are testing the design, not you. There are no wrong answers. I won't help you during the tasks, but I'll answer your questions afterwards."

**Consent.**
"Before we start, please read the consent form. It says what we will write down, that you can stop at any time, and that we keep only your first name or initials. Please sign it if you agree to take part. There is a separate tick box for recording your screen. Recording is optional. If you say yes, we delete the recording once we have marked the session."

*Wait until the form is signed. Start the recording only if the box is ticked.*

**Think aloud.**
"As you work, please say out loud what you are looking at, what you expect to happen, and what you are trying to do. You don't need to explain yourself neatly. If you go quiet for a while, I may ask, 'What are you thinking?'"

**Practice (optional, 1 minute).**
"Before the tasks, try this. Click anywhere on the page and tell me what you see."

*Then go to Task 1.*

---

## 3. The five tasks

Tasks 1 to 4 are Assignment 1's four walkthrough tasks, unchanged, on the real snapshot. Task 5 is the fifth task added in the plan (`docs/plan/sections/s08-frontend.tex`, the usability walkthrough section). If time runs short, drop Task 5 and record that it was not run.

**Rules for every task.**
- Set the starting screen in the browser before reading the task. Reload the page so no earlier state remains.
- Read the instruction once, then say nothing else for the first 60 seconds.
- If the participant asks for help, say: "What would you try next?" Do not point at anything. Count a hint as "partly".
- If the participant is stuck for 60 seconds, say: "What are you thinking?" Do not show the answer.
- At the time limit, say: "Let's stop there, thank you." Record the result as it stands.
- The participant may stop any task or the whole session at any time.

### Task 1: open an address's activity

- **Time limit:** 3 minutes.
- **Starting screen:** address selection, `http://localhost:5173/#/` (view V1).
- **Instruction read to the participant:**
  "You are researching the Bitcoin address 1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz. Open its activity, and then tell me which dates it covers."
- **Success:** the participant reaches the address overview (V2) and says the date range it covers. This is acceptance criterion AC-01 (journey J1 in the plan).
- **Partly:** reaches the overview but cannot say the dates without help, or needs a hint to get there.
- **No:** does not reach the overview within the time limit.

### Task 2: find a day with unusual activity and open it

- **Time limit:** 4 minutes.
- **Starting screen:** the running example's overview, `http://localhost:5173/#/address/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz` (view V2, Overview tab).
- **Instruction read to the participant:**
  "Find a day when something unusual happened, and open it."
- **Success:** the participant opens a day that has unusual transactions, from the daily chart or from the list "Days with unusual transactions", and reaches that day's view (V3).
- **Partly:** opens a day with no unusual transactions first, then corrects; or needs a hint.
- **No:** does not open a flagged day within the time limit.

### Task 3: the transaction that stands out, and what the marker means

- **Time limit:** 4 minutes.
- **Starting screen:** the flagged day chosen in the rehearsal, `http://localhost:5173/#/address/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz/day/[DATE]` (view V3), with `[DATE]` replaced by the day written on Card 3.
- **Instruction read to the participant:**
  "Find the transaction on this day that stands out. In your own words, what does the marker tell you?"
- **Success:** the participant opens the flagged transaction and describes the flag as different from this address's usual activity, or as worth a closer look. They do not describe it as wrongdoing. This is the success test of the plan (NFR-01, condition 4; the plan's "worth a closer look" wording).
- **Partly:** opens the right transaction but describes the flag vaguely ("it's red", "it's a warning"), or needs a hint.
- **No:** does not open a flagged transaction, or describes the flag as wrongdoing.
- **Probes allowed after the answer:** "Tell me more about that." "What would you do next?" Write down the participant's words exactly.

### Task 4: look up an address outside the snapshot

- **Time limit:** 4 minutes.
- **Starting screen:** address selection with the box empty, `http://localhost:5173/#/` (view V1).
- **Instruction read to the participant:**
  "Look up this address: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa. What happens, and what would you do next?" (Hand over Card 4 with the address written on it.)
- **Success:** the participant understands that the address is not covered by the snapshot (the app explains the coverage and gives three example addresses), and then either picks one of the suggested addresses or clears the box and tries another. This is acceptance criterion AC-02 (journey J3).
- **Partly:** understands the message but does not say what they would do next, or needs a hint.
- **No:** thinks the app is broken or that the address is invalid and stops there. Record this as a finding in its own right.
- **Note:** if the team builds S-09 (live lookup, which is approved) the panel may also offer "Fetch this address's public history". Record that the participant saw it and what they made of it. If S-09 is not in the build, the panel does not offer it; do not mention it.

### Task 5: how large a payment would have to be to stand out (added in the plan)

- **Time limit:** 5 minutes.
- **Starting screen:** the what-if lab for the running example, `http://localhost:5173/#/address/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz/what-if` (view V4).
- **Instruction read to the participant:**
  "Here is the what-if lab. First, enter a payment of 0.05 BTC sent from this address at 12:00 UTC on 20 October 2026, and tell me what the app says. Then find out how large a sent payment at that time would have to be to stand out on this address."
- **Success:** the participant enters the values and reads the verdict, and then finds the amount above which a sent payment would be flagged, either in the sentence under the curve or on chart G5, and says it in their own words.
- **Partly:** enters the values and reads the verdict, but cannot find the threshold without a hint.
- **No:** cannot enter the values, or cannot find the threshold within the time limit.
- **Note:** the amount in your answer should match the threshold you noted during set-up. The app's note at the top of the lab says a what-if is hypothetical: "Nothing is sent to the Bitcoin network and nothing is stored." Do not add to this.

---

## 4. Closing (read aloud)

Ask these in order. Write the answers in the participant's words.

1. "Overall, how easy or hard was it to use the app?"
2. "What, if anything, did you find confusing?"
3. "Was there anything you expected the app to do that it did not?"
4. "If you could change one thing first, what would it be?"
5. "Is there anything else you would like to tell us?"

**Thank you.**
"Thank you. Your answers help us improve the app. We will write up the results without names. If we recorded your screen, we delete the recording once we have marked this session. You can ask us to remove your notes at any time; contact [facilitator's contact, to be filled in]."

*Stop the recording. Save the observation sheet. Do not discuss the session with the participant or with other participants before the next session.*

---

## 5. Choices made where the plan is silent

- Time limits (3, 4, 4, 4 and 5 minutes) are the pack's choice, set from the rehearsal rule that each task should take a few minutes.
- The think-aloud, closing questions, and the "What would you try next?" hint rule are the pack's wording.
- The browser (Chrome), the window size, and the private window are the pack's choice, so every session is the same.
- The 60-second wait before a prompt is the pack's choice.
