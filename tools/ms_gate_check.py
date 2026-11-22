"""The API half of the milestone gates (MS2, and again at MS4), run against live servers.

Plan section 4.4 ("The minimum viable demonstration"): on all snapshot addresses, with both servers started
from the README. This script checks what can be checked over HTTP, through the front end's origin (Vite's
proxy), as a browser would:

  1. every address opens (E3, E4, E5); every page of its transactions (E6); every flagged transaction and
     a sample of the others (E7); short-history addresses answer as the plan says (E5/E6 200, E7 422);
  2. the what-if returns every model's verdict, and an invalid value is refused by the server (400);
  3. the API uses GET and POST, and /docs and openapi.json list every endpoint;
  4. no banned word in any body, and every flagged transaction carries the limitation line.

The screens (journeys in a browser, charts, layouts) are checked by the front end's tests and the
screenshot script; this script prints a summary and exits 1 if any check fails.

Usage: python tools/ms_gate_check.py [front-end URL, default http://localhost:5173] [back-end URL, default http://localhost:8000]
(The schema and /docs are Uvicorn's own pages, outside the /api prefix that Vite proxies, so they are read from the back end.)
"""
from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5173").rstrip("/")
BACKEND = (sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8000").rstrip("/")
SETTINGS = json.loads((Path(__file__).resolve().parents[1] / "backend" / "config" / "settings.json").read_text("utf-8"))
BANNED = re.compile(r"\b(" + "|".join(map(re.escape, SETTINGS["bannedWords"])) + r")\b", re.IGNORECASE)
# The line the web application shows (Mod-19): shared/wording.json, not A2's settings.json line it replaces.
LIMITATION = json.loads((Path(__file__).resolve().parents[1] / "shared" / "wording.json").read_text("utf-8"))["limitationLine"]
RUNNING_EXAMPLE = "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz"

failures: list[str] = []
bodies_checked = 0


def call(method: str, path: str, body: dict | None = None) -> tuple[int, dict | str]:
    """One request; returns the status and the parsed JSON (or text). Every body is scanned for banned words."""
    global bodies_checked
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(BASE + path, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            status, raw = response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read().decode("utf-8")
    bodies_checked += 1
    if BANNED.search(raw):
        failures.append(f"banned word in {method} {path}: {BANNED.search(raw).group(0)}")
    try:
        return status, json.loads(raw)
    except json.JSONDecodeError:
        return status, raw


def expect(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def main() -> int:
    status, health = call("GET", "/api/health")
    expect(status == 200 and health.get("addressCount") == 28, f"E1 health: {status} {health}")
    status, listing = call("GET", "/api/addresses")
    addresses = listing["addresses"]
    expect(status == 200 and len(addresses) == 28, f"E3: {status}, {len(addresses)} addresses")

    totals = {"addresses": 0, "rows": 0, "flagged": 0, "details": 0, "short": 0}
    for summary in addresses:
        address = summary["address"]
        totals["addresses"] += 1
        status, lookup = call("POST", "/api/lookup", {"address": address})
        expect(status == 200, f"E4 {address}: {status}")
        status, timeline = call("GET", f"/api/addresses/{address}/timeline")
        expect(status == 200, f"E5 {address}: {status}")
        rows, page = [], 1
        while True:
            status, chunk = call("GET", f"/api/addresses/{address}/transactions?page={page}&pageSize=200")
            expect(status == 200, f"E6 {address} page {page}: {status}")
            if status != 200:
                break
            rows += chunk["transactions"]
            if len(rows) >= chunk["total"] or not chunk["transactions"]:
                break
            page += 1
        totals["rows"] += len(rows)
        expect(len(rows) == summary["txCount"], f"E6 {address}: {len(rows)} rows, E3 says {summary['txCount']}")
        scored = [r for r in rows if r["status"] != "not-scored"]
        if not scored:
            totals["short"] += 1
        flagged = [r for r in rows if r["status"] == "flagged"]
        others = [r for r in rows if r["status"] != "flagged"][:: max(1, len(rows) // 5)]
        for row in flagged + others:
            status, detail = call("GET", f"/api/transactions/{row['txid']}?address={address}")
            totals["details"] += 1
            if row["status"] == "not-scored":
                expect(status == 422 and detail.get("status") == "insufficient_history", f"E7 unscored {row['txid']}: {status}")
            else:
                expect(status == 200, f"E7 {row['txid']}: {status}")
            if row["status"] == "flagged" and status == 200:
                totals["flagged"] += 1
                expect(detail.get("limitation") == LIMITATION, f"E7 {row['txid']}: limitation line missing")
                expect(len(detail.get("scores", {})) == 9, f"E7 {row['txid']}: {len(detail.get('scores', {}))} methods")

    status, unsupported = call("POST", "/api/lookup", {"address": "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"})
    expect(status == 404 and len(unsupported.get("examples", [])) == 3, f"E4 outside the snapshot: {status}")
    status, typo = call("POST", "/api/lookup", {"address": RUNNING_EXAMPLE[:-1] + "x"})
    expect(status == 400, f"E4 typo: {status}")

    good = {"amountBtc": 0.05, "direction": "out", "time": "2026-10-20T12:00:00Z"}
    status, what_if = call("POST", f"/api/addresses/{RUNNING_EXAMPLE}/what-if", good)
    expect(status == 200 and what_if.get("flagged") is True and round(what_if.get("score", 0), 2) == 5.98,
           f"E8 running example: {status} flagged={what_if.get('flagged')} score={what_if.get('score')}")
    expect(len(what_if.get("scores", {})) + len(what_if.get("notAvailable", [])) == 9, "E8: not every model answered")
    for bad in ({**good, "amountBtc": 0.123456789}, {**good, "amountBtc": -1}, {**good, "direction": "sideways"}):
        status, refused = call("POST", f"/api/addresses/{RUNNING_EXAMPLE}/what-if", bad)
        expect(status == 400 and refused.get("status") == "invalid", f"E8 refuses {bad}: {status}")
    status, curve = call("POST", f"/api/addresses/{RUNNING_EXAMPLE}/what-if/curve", {"direction": "out", "time": good["time"]})
    expect(status == 200 and len(curve.get("amountsBtc", [])) == 41, f"E9: {status}")
    status, methods = call("GET", "/api/methods")
    expect(status == 200 and len(methods.get("methods", [])) == 9, f"E11: {status}")
    status, export = call("GET", f"/api/addresses/{RUNNING_EXAMPLE}/export?format=csv&status=not-flagged")
    expect(status == 200 and isinstance(export, str) and export.count(LIMITATION) >= 1, f"E10: {status}")

    with urllib.request.urlopen(BACKEND + "/openapi.json", timeout=10) as response:
        schema = json.loads(response.read())
    operations = [(m.upper(), p) for p, ops in schema["paths"].items() for m in ops]
    verbs = {m for m, _ in operations}
    expect(len(operations) >= 11 and {"GET", "POST"} <= verbs, f"openapi: {len(operations)} operations, {sorted(verbs)}")
    with urllib.request.urlopen(BACKEND + "/docs", timeout=10) as response:
        expect(response.status == 200, "/docs does not answer")

    print(f"addresses {totals['addresses']} (short history {totals['short']}), rows {totals['rows']}, "
          f"transaction details {totals['details']} (flagged {totals['flagged']}), bodies scanned {bodies_checked}, "
          f"operations {len(operations)} ({', '.join(sorted(verbs))})")
    for failure in failures:
        print("FAIL", failure)
    print("PASS" if not failures else f"{len(failures)} FAILED")
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
