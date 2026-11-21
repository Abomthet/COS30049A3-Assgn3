# Measured performance

- Date: 2026-11-21T09:55:14+07:00
- Commit: 2339d66
- Machine: macOS-26.6.2-arm64-arm-64bit, Apple M5, 10 cores
- Python 3.11.18, Node v24.22.2; back end 0.1.0 (snapshot 2026-10-22), up for 241 s when the run began
- Repeats: 15 (warm = median)
- Running example: `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz`; largest address (most transactions, from E3): `36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L`

## Budgets

| Measure | Value | Budget | Verdict |
|---|---|---|---|
| E5 timeline, running example: cold time | 1.3 ms | 150 ms | PASS |
| E5 timeline, running example: warm time (median) | 1.2 ms | 20 ms | PASS |
| E5 timeline, running example: plain body | 11.6 kB | 60 kB | PASS |
| E6 200 rows, running example: cold time | 2.7 ms | 150 ms | PASS |
| E6 200 rows, running example: warm time (median) | 2.6 ms | 150 ms | PASS |
| E7 one transaction, running example: cold time | 1.4 ms | 150 ms | PASS |
| E7 one transaction, running example: warm time (median) | 1.2 ms | 150 ms | PASS |
| E7 one transaction, running example: plain body | 3.0 kB | 6 kB | PASS |
| E8 what-if, running example: cold time | 318.2 ms | 700 ms | PASS |
| E8 what-if, running example: warm time (median) | 278.3 ms | 700 ms | PASS |
| E9 curve of 41, running example: cold time | 201.7 ms | 1500 ms | PASS |
| E9 curve of 41, running example: warm time (median) | 205.2 ms | 1500 ms | PASS |
| E5 timeline, largest: cold time | 1.5 ms | 150 ms | PASS |
| E5 timeline, largest: warm time (median) | 1.3 ms | 20 ms | PASS |
| E5 timeline, largest: plain body | 18.5 kB | 60 kB | PASS |
| E6 200 rows, largest: cold time | 2.7 ms | 150 ms | PASS |
| E6 200 rows, largest: warm time (median) | 2.5 ms | 150 ms | PASS |
| E7 one transaction, largest: cold time | 1.4 ms | 150 ms | PASS |
| E7 one transaction, largest: warm time (median) | 1.2 ms | 150 ms | PASS |
| E7 one transaction, largest: plain body | 2.9 kB | 6 kB | PASS |
| E8 what-if, largest: cold time | 334.6 ms | 700 ms | PASS |
| E8 what-if, largest: warm time (median) | 345.4 ms | 700 ms | PASS |
| E9 curve of 41, largest: cold time | 336.0 ms | 1500 ms | PASS |
| E9 curve of 41, largest: warm time (median) | 347.4 ms | 1500 ms | PASS |
| First-screen JavaScript, gzip -9 | 148.0 kB | 150 kB | PASS |
| G1 first chart after opening the page, Plotly included (median) | 336.0 ms | 1500 ms | PASS |
| G1 redraw after new data (median) | 73.5 ms | 300 ms | PASS |
| G2 first chart after opening the page, Plotly included (median) | 367.3 ms | 1500 ms | PASS |
| G2 redraw after new data (median) | 55.3 ms | 300 ms | PASS |
| G5 first chart after opening the page, Plotly included (median) | 541.5 ms | 1500 ms | PASS |
| G5 redraw after new data (median) | 35.3 ms | 300 ms | PASS |

## Responses

| Endpoint | Cold ms | Warm ms (median) | Warm min-max ms | Plain kB | Gzip kB |
|---|---|---|---|---|---|
| E1 health | 0.8 | 0.6 | 0.6-0.7 | 0.2 | 0.2 |
| E3 address list | 2.8 | 2.7 | 2.5-3.0 | 6.8 | 2.0 |
| E11 methods | 1.1 | 0.9 | 0.8-1.0 | 5.5 | 1.9 |
| E5 timeline, running example | 1.3 | 1.2 | 1.1-1.3 | 11.6 | 1.2 |
| E6 50 rows, running example | 1.4 | 1.3 | 1.2-1.4 | 13.1 | 3.6 |
| E6 200 rows, running example | 2.7 | 2.6 | 2.4-2.9 | 53.4 | 13.4 |
| E7 one transaction, running example | 1.4 | 1.2 | 1.1-1.4 | 3.0 | 1.3 |
| E8 what-if, running example | 318.2 | 278.3 | 272.4-326.1 | 2.9 | 1.3 |
| E9 curve of 41, running example | 201.7 | 205.2 | 200.4-250.0 | 9.4 | 3.7 |
| E9 curve of 61, running example | 168.4 | 165.0 | 161.7-168.2 | 13.5 | 5.0 |
| E10 CSV export, running example | 18.2 | 17.8 | 17.4-62.2 | 187.0 | 39.4 |
| E5 timeline, largest | 1.5 | 1.3 | 1.2-1.4 | 18.5 | 1.5 |
| E6 50 rows, largest | 1.5 | 1.3 | 1.2-1.4 | 12.6 | 3.3 |
| E6 200 rows, largest | 2.7 | 2.5 | 2.4-2.7 | 52.3 | 13.0 |
| E7 one transaction, largest | 1.4 | 1.2 | 1.1-1.4 | 2.9 | 1.3 |
| E8 what-if, largest | 334.6 | 345.4 | 339.9-395.7 | 2.9 | 1.3 |
| E9 curve of 41, largest | 336.0 | 347.4 | 332.3-399.5 | 9.3 | 3.6 |
| E9 curve of 61, largest | 239.1 | 239.6 | 235.6-289.9 | 13.4 | 5.2 |
| E10 CSV export, largest | 32.3 | 32.2 | 31.9-78.0 | 344.8 | 69.0 |

A body under 1,000 bytes is not compressed by the server, so its gzip size equals its plain size.

## Build (frontend/dist), sizes in kB

| File | Raw | Gzip -9 |
|---|---|---|
| First screen JS (9 files) | 451.1 | 148.0 |
| Plotly (lazy): assets/plotly-cartesian.min-8g1kOclB.js | 1446.2 | 470.3 |
| CSS: assets/index-BH7HbTl5.css | 36.8 | 7.8 |
| Lazy chunk: assets/AssistantPanel-VvfW97-c.js | 2.9 | 1.3 |
| Lazy chunk: assets/Dialog-CiWonLnd.js | 1.5 | 0.7 |
| Lazy chunk: assets/G4ModelVerdicts-DnAHT21t.js | 3.9 | 1.9 |
| Lazy chunk: assets/LiveBanner-DgI0NJHb.js | 1.5 | 0.8 |
| Lazy chunk: assets/LiveLookupDialog-CnfNADNW.js | 3.3 | 1.6 |
| Lazy chunk: assets/ReplayStage-D4uVdYFI.js | 5.7 | 2.1 |
| Lazy chunk: assets/ScenarioPanel-1jeFAU71.js | 5.5 | 2.1 |
| Lazy chunk: assets/SelectionBar-DzkbRik4.js | 2.3 | 1.0 |
| Lazy chunk: assets/WatchDialog-Dy7e-_BI.js | 3.2 | 1.5 |
| Lazy chunk: assets/WatchlistScreen-DeFzNq9U.js | 3.4 | 1.4 |

## Chart timings (headless browser, ms; median of the repeats)

| Chart | First draw after its data (Plotly's download included) | From opening the page to the first draw | Redraw after new data |
|---|---|---|---|
| G1 | 232 | 336 | 74 |
| G2 | 211 | 367 | 55 |
| G5 | 191 | 542 | 35 |
