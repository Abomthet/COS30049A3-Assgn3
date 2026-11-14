"""Collect the 'Design notes for the technical document' bullets from docs/WORKLOG.md.

Run:  ~/miniconda3/envs/cos30049-a3/bin/python docs/report-material/make_design_notes.py
Writes design-notes.md next to this script. Each bullet is copied verbatim from the work log; the
script only sorts it under a topic (TOPIC below, keyed by the bullet's bold title) and records its
source entry. A bullet whose title is missing from TOPIC stops the script.
"""
from __future__ import annotations

import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LOG = ROOT / "docs" / "WORKLOG.md"

TOPIC = {
    # back end
    "Copying with proof": "Tooling",
    "Models load once, in the background": "Back end",
    "One error body, one place": "Back end",
    "One address checker, two tiers": "Back end",
    "Configuration in one place": "Back end",
    "Contract first": "Back end",
    "One scoring, three views": "Back end",
    "An address store behind one interface": "Back end",
    "A bounded, warmed, per-method cache": "Back end",
    "Short-history addresses stay visible": "Back end",
    "Layered validation, always 400": "Back end",
    "Revalidation without state": "Back end",
    "Why one batch is valid": "Back end",
    "One 422 for \"not enough history\"": "Back end",
    "The export is the screen": "Back end",
    "Scoring once per batch": "Back end",
    "One place for A2's wording": "Back end",
    "Two-layer validation, one answer": "Back end",
    "An exact cap under concurrency": "Back end",
    "Ranks without rescoring": "Back end",
    "No file at import": "Back end",
    # front end
    "One client, one error type": "Front end",
    "Cancellation by signal": "Front end",
    "Service status drives recovery": "Front end",
    "Settings: the service first, the bundled file as the floor": "Front end",
    "Fault isolation": "Front end",
    "Preferences": "Front end",
    "One flag line, from the model": "Front end",
    "A transaction can be unscorable on a normal address": "Front end",
    "The URL is the filter state": "Front end",
    "No sideways scrolling anywhere": "Front end",
    "The real-time loop": "Front end",
    "Amounts are strings until the server": "Front end",
    "One panel, one catalogue": "Front end",
    "A slow request says so; a busy service counts down": "Front end",
    "The link decides the method": "Front end",
    # charts
    "One wrapper; a chart is a figure function": "Charts",
    "Plotly is loaded on demand, and failure is a state": "Charts",
    "Theme from CSS tokens": "Charts",
    "Accessibility rebuilt around Plotly": "Charts",
    "The PNG is a deliberate copy": "Charts",
    "Library choice": "Charts",
    "Pages joined for the chart, not for the table": "Charts",
    "Zoom and filters stay in step": "Charts",
    "Status and direction never by colour alone": "Charts",
    "The curve follows the server's flags": "Charts",
    "Why Plotly's widgets are replaced on touch": "Charts",
    "Axis labels fit the room": "Charts",
    "G6 is honest about what it measures": "Charts",
    # testing
    "Fixtures are recorded, not invented": "Testing",
    "Two checkers, one set of vectors": "Testing",
    "Exact where it can be, bounded where it cannot": "Testing",
    "Tolerances are stated, not hidden": "Testing",
    "Waiting for the state, not the first event": "Testing",
    # tooling (build and mock)
    "The mock cannot ship": "Tooling",
}
ORDER = ["Back end", "Front end", "Charts", "Testing", "Tooling"]
BLOCK_START = re.compile(r"design notes", re.IGNORECASE)


def collect() -> list[dict]:
    lines = LOG.read_text(encoding="utf-8").split("\n")
    entry = ""
    found: list[dict] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("## "):
            entry = line[3:].strip()
        if BLOCK_START.search(line) and not line.startswith("- "):
            i += 1
            bullet: list[str] | None = None
            bullets: list[list[str]] = []
            while i < len(lines):
                cur = lines[i]
                if cur.startswith("- "):
                    bullet = [cur]
                    bullets.append(bullet)
                elif cur.startswith("  ") and cur.strip() and bullet is not None:
                    bullet.append(cur)
                elif cur.strip() == "":
                    # a blank line ends a bullet; the block ends at the next non-bullet line
                    bullet = None
                    nxt = lines[i + 1] if i + 1 < len(lines) else ""
                    if not nxt.startswith("- "):
                        break
                else:
                    break
                i += 1
            for b in bullets:
                text = "\n".join(b)
                m = re.match(r"- \*\*(.+?)\*\*", b[0])
                title = m.group(1).rstrip(".").strip() if m else b[0][:60]
                found.append({"entry": entry, "title": title, "text": text})
            continue
        i += 1
    return found


def main() -> None:
    notes = collect()
    missing = [n["title"] for n in notes if n["title"] not in TOPIC]
    if missing:
        raise SystemExit("no topic for: " + "; ".join(missing))
    out = [
        "# Design notes for the technical document",
        "",
        "Collected from `docs/WORKLOG.md` by `docs/report-material/make_design_notes.py`. Each bullet is copied",
        "verbatim from the work log (its wording is not changed). The topic grouping is the script's TOPIC table.",
        f"Bullets found: **{len(notes)}** in {len({n['entry'] for n in notes})} entries of the work log.",
        "",
    ]
    for topic in ORDER:
        group = [n for n in notes if TOPIC[n["title"]] == topic]
        out += [f"## {topic} ({len(group)})", ""]
        for n in group:
            out += [f"<!-- source: {n['entry']} -->", n["text"], ""]
    (HERE / "design-notes.md").write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")
    print(f"bullets: {len(notes)}")
    for topic in ORDER:
        print(f"  {topic}: {sum(1 for n in notes if TOPIC[n['title']] == topic)}")


if __name__ == "__main__":
    main()
