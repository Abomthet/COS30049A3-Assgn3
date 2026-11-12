# Measured performance

- Date: 2026-11-13T02:21:39+07:00
- Commit: 0f69f02 (uncommitted changes)
- Machine: macOS-26.6.2-arm64-arm-64bit, Apple M5, 10 cores
- Python 3.11.18, Node v24.22.2; back end 0.1.0 (snapshot 2026-10-22), up for 5 s when the run began
- Repeats: 15 (warm = median)
- Running example: `1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz`; largest address (most transactions, from E3): `36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L`

## Budgets

| Measure | Value | Budget | Verdict |
|---|---|---|---|
| E5 timeline, running example: cold time | 1.9 ms | 150 ms | PASS |
| E5 timeline, running example: warm time (median) | 1.5 ms | 20 ms | PASS |
| E5 timeline, running example: plain body | 11.6 kB | 60 kB | PASS |
| E6 200 rows, running example: cold time | 2.8 ms | 150 ms | PASS |
| E6 200 rows, running example: warm time (median) | 2.9 ms | 150 ms | PASS |
| E7 one transaction, running example: cold time | 2.7 ms | 150 ms | PASS |
| E7 one transaction, running example: warm time (median) | 1.5 ms | 150 ms | PASS |
| E7 one transaction, running example: plain body | 3.0 kB | 6 kB | PASS |
| E8 what-if, running example: cold time | 327.0 ms | 700 ms | PASS |
| E8 what-if, running example: warm time (median) | 274.3 ms | 700 ms | PASS |
| E9 curve of 41, running example: cold time | 214.3 ms | 1500 ms | PASS |
| E9 curve of 41, running example: warm time (median) | 210.0 ms | 1500 ms | PASS |
| E5 timeline, largest: cold time | 1.6 ms | 150 ms | PASS |
| E5 timeline, largest: warm time (median) | 1.3 ms | 20 ms | PASS |
| E5 timeline, largest: plain body | 18.4 kB | 60 kB | PASS |
| E6 200 rows, largest: cold time | 2.8 ms | 150 ms | PASS |
| E6 200 rows, largest: warm time (median) | 2.6 ms | 150 ms | PASS |
| E7 one transaction, largest: cold time | 1.4 ms | 150 ms | PASS |
| E7 one transaction, largest: warm time (median) | 1.2 ms | 150 ms | PASS |
| E7 one transaction, largest: plain body | 2.9 kB | 6 kB | PASS |
| E8 what-if, largest: cold time | 331.5 ms | 700 ms | PASS |
| E8 what-if, largest: warm time (median) | 372.3 ms | 700 ms | PASS |
| E9 curve of 41, largest: cold time | 340.5 ms | 1500 ms | PASS |
| E9 curve of 41, largest: warm time (median) | 435.7 ms | 1500 ms | PASS |
| First-screen JavaScript, gzip -9 | 145.3 kB | 150 kB | PASS |
| G1 first chart after opening the page, Plotly included (median) | 332.8 ms | 1500 ms | PASS |
| G1 redraw after new data (median) | 72.5 ms | 300 ms | PASS |
| G2 first chart after opening the page, Plotly included (median) | 370.1 ms | 1500 ms | PASS |
| G2 redraw after new data (median) | 43.7 ms | 300 ms | PASS |
| G5 first chart after opening the page, Plotly included (median) | 933.7 ms | 1500 ms | PASS |
| G5 redraw after new data (median) | 35.0 ms | 300 ms | PASS |

## Responses

| Endpoint | Cold ms | Warm ms (median) | Warm min-max ms | Plain kB | Gzip kB |
|---|---|---|---|---|---|
| E1 health | 1.0 | 0.8 | 0.6-1.0 | 0.2 | 0.2 |
| E3 address list | 3.2 | 2.9 | 2.7-3.4 | 6.8 | 2.0 |
| E11 methods | 9.2 | 1.0 | 0.9-1.1 | 5.5 | 1.9 |
| E5 timeline, running example | 1.9 | 1.5 | 1.2-1.9 | 11.6 | 1.2 |
| E6 50 rows, running example | 1.8 | 1.3 | 1.2-1.8 | 13.1 | 3.6 |
| E6 200 rows, running example | 2.8 | 2.9 | 2.6-4.3 | 53.4 | 13.4 |
| E7 one transaction, running example | 2.7 | 1.5 | 1.3-2.0 | 3.0 | 1.3 |
| E8 what-if, running example | 327.0 | 274.3 | 257.6-318.3 | 2.9 | 1.3 |
| E9 curve of 41, running example | 214.3 | 210.0 | 185.0-384.0 | 9.4 | 3.7 |
| E9 curve of 61, running example | 302.3 | 290.2 | 170.2-316.8 | 13.5 | 5.0 |
| E10 CSV export, running example | 20.4 | 17.7 | 17.2-59.3 | 187.0 | 39.4 |
| E5 timeline, largest | 1.6 | 1.3 | 1.2-1.5 | 18.4 | 1.5 |
| E6 50 rows, largest | 1.6 | 1.4 | 1.3-1.5 | 12.6 | 3.3 |
| E6 200 rows, largest | 2.8 | 2.6 | 2.5-2.9 | 52.3 | 13.0 |
| E7 one transaction, largest | 1.4 | 1.2 | 1.1-1.3 | 2.9 | 1.3 |
| E8 what-if, largest | 331.5 | 372.3 | 355.9-435.4 | 2.9 | 1.3 |
| E9 curve of 41, largest | 340.5 | 435.7 | 347.1-709.6 | 9.3 | 3.6 |
| E9 curve of 61, largest | 496.1 | 376.1 | 313.1-418.8 | 13.4 | 5.2 |
| E10 CSV export, largest | 33.6 | 33.0 | 32.4-79.7 | 344.8 | 69.0 |

A body under 1,000 bytes is not compressed by the server, so its gzip size equals its plain size.

## Build (frontend/dist), sizes in kB

| File | Raw | Gzip -9 |
|---|---|---|
| First screen JS (5 files) | 443.7 | 145.3 |
| Plotly (lazy): assets/plotly-cartesian.min-8g1kOclB.js | 1446.2 | 470.3 |
| CSS: assets/index-aA2w8Pn8.css | 34.9 | 7.4 |
| Lazy chunk: assets/G4ModelVerdicts-I4In5eSV.js | 3.8 | 1.8 |
| Lazy chunk: assets/ReplayStage-B8UIbgB1.js | 5.6 | 2.1 |
| Lazy chunk: assets/WatchDialog-CIaIo3VI.js | 4.4 | 1.9 |
| Lazy chunk: assets/WatchlistScreen-Bf80Bc9X.js | 3.3 | 1.3 |

## Chart timings (headless browser, ms; median of the repeats)

| Chart | First draw after its data (Plotly's download included) | From opening the page to the first draw | Redraw after new data |
|---|---|---|---|
| G1 | 231 | 333 | 72 |
| G2 | 210 | 370 | 44 |
| G5 | 190 | 934 | 35 |
