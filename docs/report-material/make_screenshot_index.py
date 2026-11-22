"""Index every file in docs/screenshots/ from the capture script's shot table.

Run:  ~/miniconda3/envs/cos30049-a3/bin/python docs/report-material/make_screenshot_index.py
Reads frontend/scripts/screenshots.mjs (the shot table: name, query, route, width, full page, mock only,
action) and the PNG headers (pixel size). Writes screenshot-index.md next to this script. The one-line
descriptions are in DESCRIBE below; every file must have one, or the script stops.
"""
from __future__ import annotations

import hashlib
import re
import struct
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SCRIPT = ROOT / "frontend" / "scripts" / "screenshots.mjs"
SHOTS = ROOT / "docs" / "screenshots"

WIDTH_NAME = {"DESKTOP": "desktop", "TABLET": "tablet", "MOBILE": "phone"}

DESCRIBE = {
    "01-select": "V1 address selection, full page: hero with three tiles (28 addresses, 7,966 transactions, 9 models) and the snapshot table.",
    "02-invalid": "V1 with a mistyped address in the box: the checker's message under the field.",
    "03-unsupported": "V1 with an address outside the snapshot: the unsupported answer with examples.",
    "04-loading": "V2 overview while its first request is still waiting (loading state). Mock only.",
    "05-timeline": "V2 overview of the example address, full page: four tiles, 'Transactions per day' chart, '3 days' list and the replay card.",
    "06-insufficient-address": "V2 overview of the short-history address: the history status, no scores.",
    "07-day-nothing-selected": "V3 day view on a flagged day, with no transaction chosen yet.",
    "08-flagged-detail": "V3 flagged transaction, full page (the reason, comparison basis, limitation line, G3 and the nine verdicts, as the TEST_LOG J2 record describes).",
    "09-not-scored-detail": "V3 transaction of the short-history address: facts shown, not scored, reason given.",
    "10-early-transaction-not-scored": "V3 early transaction of the example address: too little earlier history.",
    "11-network-failure": "V2 in the network-failure state, with the retry. Mock only.",
    "12-timeline-tablet": "V2 overview at 820 px.",
    "13-flagged-detail-tablet": "V3 flagged transaction at 820 px.",
    "14-select-mobile": "V1 address selection at 390 px.",
    "15-timeline-mobile": "V2 overview at 390 px.",
    "16-flagged-detail-mobile": "V3 flagged transaction at 390 px (cards, no sideways scroll).",
    "17-flagged-detail-dark": "V3 flagged transaction in the dark theme.",
    "18-select-tablet": "V1 address selection at 820 px.",
    "19-select-desktop-dark": "V1 address selection in the dark theme.",
    "20-transactions": "V2 transactions tab, unfiltered: filter bar, G2, table.",
    "21-transactions-sent-unusual": "Transactions tab filtered to unusual, sent transactions.",
    "22-transactions-invalid-dates": "Transactions tab with a range whose end is before its start: the refusal.",
    "23-transactions-tablet": "Transactions tab at 820 px.",
    "24-transactions-mobile": "Transactions tab at 390 px, viewport only (first screen).",
    "24b-transactions-mobile-full-page": "Transactions tab at 390 px, full page, filtered to unusual transactions.",
    "25-transactions-short-history": "Transactions tab of the short-history address: rows unscored.",
    "26-transactions-dark": "Transactions tab filtered to unusual transactions, dark theme.",
    "27-about": "V7 about and help, desktop: 'What it shows', 'What unusual means' with the flag level, 'How a flag is decided' in three steps, limits, data facts, keyboard.",
    "28-about-mobile": "V7 about and help at 390 px.",
    "29-what-if-empty": "V4 what-if lab with nothing typed.",
    "30-what-if-flagged": "V4 what-if lab, 0.05 BTC out at the example time: flagged, the curve and its crossings.",
    "31-what-if-not-flagged": "V4 what-if lab, 0.0005 BTC: not flagged.",
    "32-what-if-tablet": "V4 what-if lab at 820 px, the example amount.",
    "33-what-if-mobile": "V4 what-if lab at 390 px, the example amount.",
    "34-what-if-invalid-amount": "V4 with 0.123456789 typed: refused in the browser, no request sent.",
    "35-what-if-dark": "V4 what-if lab in the dark theme, the example amount.",
    "36-models": "V5 models and limits, desktop: a card per method.",
    "37-models-tablet": "V5 models and limits at 820 px.",
    "38-models-mobile": "V5 models and limits at 390 px.",
    "39-offline-banner": "V2 with the browser offline: the offline banner.",
    "40-service-starting": "V2 while the service is starting. Mock only.",
    "41-busy-countdown": "V2 while the service is busy (429): the countdown. Mock only.",
    "42-timeout": "V2 after the time limit: the timeout state. Mock only.",
    "43-still-working": "V2 with the slow notice (still working). Mock only.",
    "44-offline-banner-mobile": "Offline banner at 390 px.",
    "45-about-tablet": "V7 about and help at 820 px.",
    "46-timeline-mobile-dark": "V2 overview at 390 px, dark theme.",
    "47-what-if-tablet-dark": "V4 what-if lab at 820 px, dark theme.",
    "48-timeline-other-method": "V2 overview with the regression method deciding (?method=regression).",
    "49-watchlist": "V6 watchlist with two addresses, labels and notes.",
    "50-watchlist-mobile": "V6 watchlist at 390 px.",
    "51-watch-dialog": "V1 with the watch dialog open: label and note typed in.",
    "52-watch-dialog-mobile": "Watch dialog at 390 px.",
    "53-model-verdicts": "V3 flagged transaction, nine verdicts. Byte-identical to 08.",
    "54-model-verdicts-mobile": "V3 flagged transaction at 390 px. Byte-identical to 16.",
    "55-replay": "V2 overview with the replay running at 20 a second, part way through (S-06).",
    "56-replay-mobile": "The replay at 390 px.",
    "57-watchlist-undo": "V6 after removing an entry: the toast with Undo.",
    "58-assistant-prepared": "V3 flagged transaction at 1280 px, first screen only: after pressing 'Ask the Assistant to explain', scrolled to the 'Why it stands out' box, which now holds the prepared answer ('Written by the Assistant. Checked by code before it is shown.'). Light theme.",
    "59-assistant-prepared-mobile": "V3 flagged transaction at 390 px, first screen only: after pressing 'Ask the Assistant to explain', scrolled so the prepared answer in the 'Why it stands out' box fills the screen.",
    "60-selection": "V2 transactions tab at 1280 px, full page, with 124 transactions selected by a box drawn on the chart (60 received, 64 sent, 1 unusual).",
    "61-selection-mobile": "V2 transactions tab at 390 px, full page, with 81 transactions selected from 1 Jul to 22 Oct 2026 (42 received, 39 sent, 1 unusual).",
    "62-scenarios": "V4 what-if lab at 1280 px, full page: three saved scenarios ('Save this scenario') of the example address (0.0005, 0.05 and 0.5 BTC), scenarios 1 and 3 checked for comparison.",
    "63-scenarios-mobile": "V4 what-if lab at 390 px, full page: the same three saved scenarios, with scenarios 1 and 3 checked.",
    "live-01-offer-1280": "V1 address selection at 1280 px for an address outside the snapshot: the notice 'This address isn't in the snapshot' offers 'Fetch its public history' and three snapshot addresses instead; no fetch started. Live lookup.",
    "live-01-offer-390": "V1 address selection at 390 px, the same notice for an address outside the snapshot; the fetch button is below the first screen. Live lookup.",
    "live-02-dialog-1280": "V1 at 1280 px while a live fetch runs: the 'Fetching public history' dialog reads '50 of 500 transactions', with the progress bar and Cancel. Live lookup.",
    "live-02-dialog-390": "V1 at 390 px while a live fetch runs: the same dialog (50 of 500 transactions), with Cancel. Live lookup.",
    "live-03-overview-1280": "V2 overview at 1280 px, full page, of the live-fetched address: the 'Live data' banner (latest 500 of 1,164 transactions, with 'Forget this address'), the four tiles, the day chart, the unusual-days list and the replay card. Live lookup.",
    "live-03-overview-390": "V2 overview at 390 px, full page, of the same live-fetched address: the 'Live data' banner, the tiles, the day chart, the unusual-days list and the replay card. Live lookup.",
}
VIEW_GROUPS = [
    ("V1 address selection", lambda n: n.startswith(("01-", "02-", "03-", "14-", "18-", "19-", "51-", "52-"))),
    ("V2 overview and its replay", lambda n: n.startswith(("05-", "06-", "12-", "15-", "46-", "48-", "55-", "56-"))),
    ("V2 transactions tab", lambda n: n.startswith(("20-", "21-", "22-", "23-", "24", "25-", "26-", "60-", "61-"))),
    ("V3 day and transaction", lambda n: n.startswith(("07-", "08-", "09-", "10-", "13-", "16-", "17-", "53-", "54-", "58-", "59-"))),
    ("V4 what-if lab", lambda n: n.startswith(("29-", "30-", "31-", "32-", "33-", "34-", "35-", "47-", "62-", "63-"))),
    ("V5 models and limits", lambda n: n.startswith(("36-", "37-", "38-"))),
    ("V6 watchlist", lambda n: n.startswith(("49-", "50-", "57-"))),
    ("V7 about and help", lambda n: n.startswith(("27-", "28-", "45-"))),
    ("Live lookup (S-09, shots taken with LIVE=1)", lambda n: n.startswith("live-")),
    ("Service and network states (any view)", lambda n: n.startswith(("04-", "11-", "39-", "40-", "41-", "42-", "43-", "44-"))),
]


def parse_script() -> dict[str, dict]:
    table: dict[str, dict] = {}
    for line in SCRIPT.read_text(encoding="utf-8").split("\n"):
        m = re.match(r"\s*\['([^']+)',\s*'([^']*)',", line)
        if not m:
            continue
        name, query = m.group(1), m.group(2)
        width = re.search(r"\b(DESKTOP|TABLET|MOBILE)\b", line)
        flags = re.search(r"\b(DESKTOP|TABLET|MOBILE),\s*(true|false),\s*(true|false)", line)
        table[name] = {
            "query": query,
            "width": WIDTH_NAME[width.group(1)] if width else "?",
            "full_page": flags.group(2) == "true" if flags else None,
            "mock_only": flags.group(3) == "true" if flags else None,
            "route": route_of(line),
            "action": action_of(line),
        }
    return table


def route_of(line: str) -> str:
    if "q(" in line:
        return "V1 selection"
    if "tx(" in line:
        return "V3 transaction"
    if "day(" in line:
        return "V3 day"
    if "txs(" in line:
        return "V2 transactions tab"
    if "lab(" in line:
        return "V4 what-if lab"
    if "tl(" in line:
        return "V2 overview"
    if "'#/models'" in line:
        return "V5 models"
    if "'#/about'" in line:
        return "V7 about"
    if "'#/'" in line:
        return "V1 selection"
    return "?"


def action_of(line: str) -> str:
    for key, label in (("typeAmount(", "amount typed"), ("watchTwo", "two addresses watched"),
                       ("watchRemoved", "entry removed, undo toast"), ("watchDialog", "watch dialog open"),
                       ("replay20", "replay at 20 a second"), ("goOffline", "browser set offline")):
        if key in line:
            return label
    return ""


def png_size(path: Path) -> tuple[int, int]:
    head = path.read_bytes()[:24]
    return struct.unpack(">II", head[16:24])


def main() -> None:
    table = parse_script()
    files = sorted(SHOTS.glob("*.png"))
    names = [f.stem for f in files]
    missing_desc = [n for n in names if n not in DESCRIBE]
    missing_script = [n for n in names if n not in table]
    if missing_desc or missing_script:
        raise SystemExit(f"no description: {missing_desc}; not in the capture script: {missing_script}")
    digests: dict[str, list[str]] = {}
    rows: dict[str, list[str]] = {}
    for f in files:
        digests.setdefault(hashlib.sha256(f.read_bytes()).hexdigest(), []).append(f.name)
    out = [
        "# Screenshot index",
        "",
        "Generated by `docs/report-material/make_screenshot_index.py` from `frontend/scripts/screenshots.mjs` and the PNG headers. "
        "Descriptions are written from the capture script's own shot table, not from a look at each image; "
        "check a picture before it goes in the report.",
        "",
        f"Files: **{len(files)}** PNG in `docs/screenshots/` (the script lists {len(table)} shots, plus 24b).",
        "Width is the viewport in CSS pixels (the script uses device scale 1, so pixels equal CSS pixels). "
        "Theme is light unless the shot's query says `theme=dark`. Mock-only shots need `VITE_API_MODE=mock`.",
        "",
    ]
    for label, pred in VIEW_GROUPS:
        group = [n for n in names if pred(n)]
        if not group:
            continue
        out += [f"## {label}", "", "| File | Screen | Width (px) | Device | Theme | Height (px) | Mock only | Description |",
                "|---|---|---|---|---|---|---|---|"]
        for n in group:
            entry = table[n]
            w, h = png_size(SHOTS / f"{n}.png")
            theme = "dark" if "theme=dark" in entry["query"] else "light"
            mock = "yes" if entry["mock_only"] else "no"
            out.append(f"| `{n}.png` | {entry['route']} | {w} | {entry['width']} | {theme} | {h} | {mock} | {DESCRIBE[n]} |")
        out.append("")
    dupes = [v for v in digests.values() if len(v) > 1]
    out += ["## Byte-identical pairs", ""]
    if dupes:
        for group in dupes:
            out.append("- " + ", ".join(f"`{g}`" for g in group) + ": the same bytes; use one in the report.")
    else:
        out.append("None.")
    out.append("")
    (HERE / "screenshot-index.md").write_text("\n".join(out), encoding="utf-8")
    print(f"files: {len(files)}; duplicate groups: {len(dupes)}")


if __name__ == "__main__":
    main()
