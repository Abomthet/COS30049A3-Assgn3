"""Measures a running back end and the front-end build against the plan's budgets (S-12; plan section 10, "Budgets").

What it measures, on the running example and on the address with the most transactions (found through E3):

  * E1, E3, E11: no per-address inputs. E5 timeline, E6 one page of 50 and of 200 rows, E7 one transaction, E8 what-if,
    E9 curve of 41 and of 61 amounts, E10 CSV export: each as a cold time (the first request of the run), a warm time
    (the median of `--repeats` further requests) and the body size, plain and gzip.
  * The build in frontend/dist: the first screen's JavaScript (the entry script plus the chunks the page preloads,
    each gzipped at level 9), Plotly, the style sheet, and the lazy chunks.
  * With `--charts`: the chart timings of frontend/scripts/chart-timings.mjs in headless Edge or Chrome (first chart
    after opening the page, Plotly's download included; a redraw after new data).

Each figure with a budget is marked PASS or FAIL; the rest are reported without a verdict. The report goes to
`--out` as measure.md and measure.json (date, commit, machine, versions and repeats included), and the exit code is 1
if any budget fails.

Times are wall-clock on one machine over the loopback, so they include Python's HTTP client and bound the server's own
time from above. "Cold" is only cold when the back end was just started: restart it before a run that is to be quoted
(the back end warms its timeline cache at start, so E5's cold time includes a cache hit; plan section 6).

Usage:
  python tools/measure.py [back-end URL, default http://localhost:8000] [--repeats 15] [--build] [--charts]
                          [--out docs/report-material/measured]
"""
from __future__ import annotations

import argparse
import datetime
import gzip
import http.client
import json
import os
import platform
import re
import statistics
import subprocess
import sys
import time
import urllib.parse
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
RUNNING_EXAMPLE = "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz"
WHAT_IF_TIME = "2026-10-20T12:00:00Z"
PREVIEW_PORT = 4173

# Budgets from plan section 10. Sizes are in kB of 1,000 bytes. The first-screen script's budget is the 150 kB of
# docs/HANDOFF.md section 4, tighter than the plan's 250 kB estimate; the body budgets are applied to the plain body.
FIRST_SCREEN_JS_KB = 150
CHART_FIRST_MS = 1500
CHART_REDRAW_MS = 300


@dataclass
class Check:
    """One measured figure and, when the plan sets one, its budget."""

    name: str
    value: float
    unit: str
    budget: float | None = None

    @property
    def verdict(self) -> str:
        """PASS or FAIL against the budget, or "-" when the plan sets none."""
        if self.budget is None:
            return "-"
        return "PASS" if self.value <= self.budget else "FAIL"


@dataclass
class Probe:
    """One request to repeat: the endpoint's label, method, path, JSON body, and its budgets (ms, ms, kB)."""

    label: str
    method: str
    path: str
    body: dict | None = None
    cold_ms: float | None = None
    warm_ms: float | None = None
    plain_kb: float | None = None
    results: dict = field(default_factory=dict)


class Client:
    """A keep-alive HTTP client that times a whole request, body included."""

    def __init__(self, base: str) -> None:
        parts = urllib.parse.urlsplit(base)
        self.host, self.port = parts.hostname, parts.port or 80
        self.connection = http.client.HTTPConnection(self.host, self.port, timeout=60)

    def request(self, method: str, path: str, body: dict | None, compressed: bool) -> tuple[int, bytes, float]:
        """Sends one request; returns the status, the body as sent over the wire, and the elapsed milliseconds."""
        headers = {"Accept-Encoding": "gzip" if compressed else "identity"}
        data = json.dumps(body).encode() if body is not None else None
        if data:
            headers["Content-Type"] = "application/json"
        started = time.perf_counter()
        self.connection.request(method, path, body=data, headers=headers)
        response = self.connection.getresponse()
        payload = response.read()
        elapsed = (time.perf_counter() - started) * 1000
        return response.status, payload, elapsed


def run_probe(client: Client, probe: Probe, repeats: int) -> None:
    """Fills `probe.results` with the cold time, the warm median, and the plain and gzip sizes in bytes."""
    status, payload, cold = client.request(probe.method, probe.path, probe.body, compressed=True)
    if status != 200:
        raise SystemExit(f"{probe.label}: {probe.method} {probe.path} answered {status}")
    warm = [client.request(probe.method, probe.path, probe.body, compressed=True)[2] for _ in range(repeats)]
    _, plain, _ = client.request(probe.method, probe.path, probe.body, compressed=False)
    probe.results = {
        "cold_ms": cold,
        "warm_ms": statistics.median(warm),
        "warm_min_ms": min(warm),
        "warm_max_ms": max(warm),
        "plain_bytes": len(plain),
        "gzip_bytes": len(payload),
    }


def get_json(client: Client, path: str) -> dict:
    """One GET whose body is JSON."""
    status, payload, _ = client.request("GET", path, None, compressed=False)
    if status != 200:
        raise SystemExit(f"GET {path} answered {status}")
    return json.loads(payload)


def pick_transaction(client: Client, address: str) -> str:
    """A flagged transaction of `address` if it has one, else its newest scored one (E7 answers 422 for the rest)."""
    rows = get_json(client, f"/api/addresses/{address}/transactions?pageSize=200")["transactions"]
    scored = [row for row in rows if row["status"] != "not-scored"]
    flagged = [row for row in scored if row["status"] == "flagged"]
    return (flagged or scored)[0]["txid"]


def address_probes(client: Client, address: str, tag: str) -> list[Probe]:
    """The per-address probes (E5 to E10) for one address; `tag` names it in the labels."""
    base = f"/api/addresses/{address}"
    what_if = {"amountBtc": 0.05, "direction": "out", "time": WHAT_IF_TIME}
    curve = {"direction": "out", "time": WHAT_IF_TIME}
    txid = pick_transaction(client, address)
    return [
        Probe(f"E5 timeline, {tag}", "GET", f"{base}/timeline", cold_ms=150, warm_ms=20, plain_kb=60),
        Probe(f"E6 50 rows, {tag}", "GET", f"{base}/transactions?page=1&pageSize=50"),
        Probe(f"E6 200 rows, {tag}", "GET", f"{base}/transactions?page=1&pageSize=200", cold_ms=150, warm_ms=150),
        Probe(f"E7 one transaction, {tag}", "GET", f"/api/transactions/{txid}?address={address}", cold_ms=150, warm_ms=150, plain_kb=6),
        Probe(f"E8 what-if, {tag}", "POST", f"{base}/what-if", what_if, cold_ms=700, warm_ms=700),
        Probe(f"E9 curve of 41, {tag}", "POST", f"{base}/what-if/curve", curve, cold_ms=1500, warm_ms=1500),
        Probe(f"E9 curve of 61, {tag}", "POST", f"{base}/what-if/curve", {**curve, "minBtc": 0.0001, "maxBtc": 1, "points": 61}),
        Probe(f"E10 CSV export, {tag}", "GET", f"{base}/export?format=csv"),
    ]


def probe_checks(probe: Probe) -> list[Check]:
    """The budgeted figures of a finished probe."""
    r = probe.results
    checks = []
    if probe.cold_ms is not None:
        checks.append(Check(f"{probe.label}: cold time", r["cold_ms"], "ms", probe.cold_ms))
    if probe.warm_ms is not None:
        checks.append(Check(f"{probe.label}: warm time (median)", r["warm_ms"], "ms", probe.warm_ms))
    if probe.plain_kb is not None:
        checks.append(Check(f"{probe.label}: plain body", r["plain_bytes"] / 1000, "kB", probe.plain_kb))
    return checks


def gzip9(path: Path) -> int:
    """The size of `path` gzipped at level 9, in bytes (what a static host with maximum compression would send)."""
    return len(gzip.compress(path.read_bytes(), compresslevel=9, mtime=0))


def measure_bundle(dist: Path) -> tuple[dict, list[Check]]:
    """Sizes of the build in `dist`: first-screen JS (entry plus modulepreloaded chunks), Plotly, CSS, lazy chunks."""
    html = (dist / "index.html").read_text("utf-8")
    first = {m.lstrip("/") for m in re.findall(r'<script[^>]+src="([^"]+\.js)"', html)}
    first |= {m.lstrip("/") for m in re.findall(r'<link rel="modulepreload"[^>]+href="([^"]+\.js)"', html)}
    css = [m.lstrip("/") for m in re.findall(r'<link rel="stylesheet"[^>]+href="([^"]+\.css)"', html)]
    scripts = {p.relative_to(dist).as_posix(): p for p in (dist / "assets").glob("*.js")}
    plotly = [name for name in scripts if "plotly" in name.lower() and name not in first and "PlotlyChart" not in name]
    lazy = sorted(name for name in scripts if name not in first and name not in plotly)
    sizes = {name: {"bytes": scripts[name].stat().st_size, "gzip_bytes": gzip9(scripts[name])} for name in sorted(first | set(plotly) | set(lazy))}
    first_gzip = sum(sizes[name]["gzip_bytes"] for name in first)
    bundle = {
        "first_screen_js": {"files": sorted(first), "gzip_bytes": first_gzip,
                            "bytes": sum(sizes[name]["bytes"] for name in first)},
        "plotly": {name: sizes[name] for name in plotly},
        "css": {name: {"bytes": (dist / name).stat().st_size, "gzip_bytes": gzip9(dist / name)} for name in css},
        "lazy": {name: sizes[name] for name in lazy},
    }
    return bundle, [Check("First-screen JavaScript, gzip -9", first_gzip / 1000, "kB", FIRST_SCREEN_JS_KB)]


def measure_charts(backend: str, repeats: int, main: str, other: str) -> dict:
    """Runs frontend/scripts/chart-timings.mjs against `vite preview` over the build, which this function starts and stops."""
    env = {**os.environ, "EXPLORER_API": backend}
    vite = subprocess.Popen(["node", "node_modules/.bin/vite", "preview", "--port", str(PREVIEW_PORT), "--strictPort"],
                            cwd=FRONTEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                http.client.HTTPConnection("localhost", PREVIEW_PORT, timeout=1).request("GET", "/")
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise SystemExit("vite preview did not start")
        done = subprocess.run(["node", "scripts/chart-timings.mjs", f"http://localhost:{PREVIEW_PORT}", str(repeats), main, other],
                              cwd=FRONTEND, capture_output=True, text=True, check=False)
    finally:
        vite.terminate()
        vite.wait(timeout=10)
    if done.returncode != 0:
        raise SystemExit(f"chart-timings.mjs failed: {done.stderr.strip()}")
    if done.stderr.strip():
        print("chart-timings.mjs repeated a run:\n" + done.stderr.strip(), file=sys.stderr)
    return json.loads(done.stdout)


def chart_checks(charts: dict) -> list[Check]:
    """Budgeted chart figures: the median of each chart's first draw since navigation, and of its redraw."""
    checks = []
    for name, series in charts.items():
        checks.append(Check(f"{name} first chart after opening the page, Plotly included (median)",
                            statistics.median(series["sinceNavigation"]), "ms", CHART_FIRST_MS))
        checks.append(Check(f"{name} redraw after new data (median)", statistics.median(series["redraw"]), "ms", CHART_REDRAW_MS))
    return checks


def command_output(*command: str) -> str:
    """The first line a command prints, or "unknown" if it is missing or fails."""
    try:
        out = subprocess.run(command, capture_output=True, text=True, check=True, cwd=ROOT).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"
    return out.splitlines()[0] if out else "unknown"


def working_tree_dirty() -> bool:
    """Whether `git status --porcelain` lists anything. (Not via command_output: that answers "unknown" for an empty
    output, and a clean tree prints nothing, so every run used to be labelled "uncommitted changes".)"""
    try:
        status = subprocess.run(["git", "status", "--porcelain"], capture_output=True, text=True, check=True, cwd=ROOT)
    except (OSError, subprocess.CalledProcessError):
        return False
    return bool(status.stdout.strip())


def environment(repeats: int, backend: str, health: dict) -> dict:
    """Where and when the run happened, for the report's table."""
    dirty = working_tree_dirty()
    cpu = command_output("sysctl", "-n", "machdep.cpu.brand_string")
    return {
        "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "commit": command_output("git", "rev-parse", "--short", "HEAD") + (" (uncommitted changes)" if dirty else ""),
        "machine": f"{platform.platform()}, {cpu if cpu != 'unknown' else platform.processor() or platform.machine()}, {os.cpu_count()} cores",
        "python": platform.python_version(),
        "node": command_output("node", "--version"),
        "backend": {"url": backend, "version": health.get("version"), "snapshotDate": health.get("snapshotDate"),
                    "uptimeSecondsAtStart": health.get("uptimeSeconds")},
        "repeats": repeats,
    }


def table(header: list[str], rows: list[list[str]]) -> str:
    """A Markdown table."""
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    return "\n".join(lines + ["| " + " | ".join(row) + " |" for row in rows])


def kb(size: int) -> str:
    """Bytes as kB with one decimal."""
    return f"{size / 1000:.1f}"


def render(env: dict, probes: list[Probe], bundle: dict | None, charts: dict | None, checks: list[Check],
           addresses: dict[str, str]) -> str:
    """The Markdown report."""
    out = ["# Measured performance", "",
           f"- Date: {env['date']}", f"- Commit: {env['commit']}", f"- Machine: {env['machine']}",
           f"- Python {env['python']}, Node {env['node']}; back end {env['backend']['version']} (snapshot "
           f"{env['backend']['snapshotDate']}), up for {env['backend']['uptimeSecondsAtStart']:.0f} s when the run began",
           f"- Repeats: {env['repeats']} (warm = median)",
           f"- Running example: `{addresses['running example']}`; largest address (most transactions, from E3): `{addresses['largest']}`",
           "", "## Budgets", "",
           table(["Measure", "Value", "Budget", "Verdict"],
                 [[c.name, f"{c.value:.1f} {c.unit}", f"{c.budget:g} {c.unit}" if c.budget is not None else "-", c.verdict] for c in checks]),
           "", "## Responses", "",
           table(["Endpoint", "Cold ms", "Warm ms (median)", "Warm min-max ms", "Plain kB", "Gzip kB"],
                 [[p.label, f"{p.results['cold_ms']:.1f}", f"{p.results['warm_ms']:.1f}",
                   f"{p.results['warm_min_ms']:.1f}-{p.results['warm_max_ms']:.1f}",
                   kb(p.results["plain_bytes"]), kb(p.results["gzip_bytes"])] for p in probes]),
           "", "A body under 1,000 bytes is not compressed by the server, so its gzip size equals its plain size."]
    if bundle:
        out += ["", "## Build (frontend/dist), sizes in kB", ""]
        first = bundle["first_screen_js"]
        rows = [[f"First screen JS ({len(first['files'])} files)", kb(first["bytes"]), kb(first["gzip_bytes"])]]
        for group, label in (("plotly", "Plotly (lazy)"), ("css", "CSS"), ("lazy", "Lazy chunk")):
            rows += [[f"{label}: {name}", kb(v["bytes"]), kb(v["gzip_bytes"])] for name, v in bundle[group].items()]
        out += [table(["File", "Raw", "Gzip -9"], rows)]
    if charts:
        out += ["", "## Chart timings (headless browser, ms; median of the repeats)", "",
                table(["Chart", "First draw after its data (Plotly's download included)", "From opening the page to the first draw", "Redraw after new data"],
                      [[name, f"{statistics.median(s['firstDraw']):.0f}", f"{statistics.median(s['sinceNavigation']):.0f}",
                        f"{statistics.median(s['redraw']):.0f}"] for name, s in charts.items()])]
    else:
        out += ["", "Chart timings were not taken (run with `--charts`)."]
    return "\n".join(out) + "\n"


def main() -> int:
    """Runs the probes, the bundle and chart measurements, writes the report, and returns 1 if a budget failed."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("backend", nargs="?", default="http://localhost:8000", help="the running back end")
    parser.add_argument("--repeats", type=int, default=15, help="warm requests per probe (default 15)")
    parser.add_argument("--build", action="store_true", help="run `npm run build` in frontend/ first")
    parser.add_argument("--charts", action="store_true", help="also time chart draws in a headless browser")
    parser.add_argument("--out", type=Path, default=ROOT / "docs" / "report-material" / "measured", help="output folder")
    args = parser.parse_args()
    backend = args.backend.rstrip("/")

    if args.build:
        subprocess.run(["npm", "run", "build"], cwd=FRONTEND, check=True)
    dist = FRONTEND / "dist"
    if not (dist / "index.html").exists():
        print("frontend/dist is missing: bundle sizes skipped (use --build)", file=sys.stderr)
    if args.charts and not (dist / "index.html").exists():
        raise SystemExit("--charts needs a build: use --build")

    client = Client(backend)
    health = get_json(client, "/api/health")
    listing = get_json(client, "/api/addresses")["addresses"]
    by_size = sorted(listing, key=lambda a: a["txCount"], reverse=True)
    largest = by_size[0]["address"]
    addresses = {"running example": RUNNING_EXAMPLE, "largest": largest}

    probes = [Probe("E1 health", "GET", "/api/health"), Probe("E3 address list", "GET", "/api/addresses"),
              Probe("E11 methods", "GET", "/api/methods")]
    probes += address_probes(client, RUNNING_EXAMPLE, "running example") + address_probes(client, largest, "largest")
    for probe in probes:
        run_probe(client, probe, args.repeats)

    checks = [c for probe in probes for c in probe_checks(probe)]
    bundle = charts = None
    if (dist / "index.html").exists():
        bundle, bundle_checks = measure_bundle(dist)
        checks += bundle_checks
    if args.charts:
        other = largest if largest != RUNNING_EXAMPLE else by_size[1]["address"]
        charts = measure_charts(backend, args.repeats, RUNNING_EXAMPLE, other)
        checks += chart_checks(charts)

    env = environment(args.repeats, backend, health)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "measure.md").write_text(render(env, probes, bundle, charts, checks, addresses), "utf-8")
    (args.out / "measure.json").write_text(json.dumps({
        "environment": env, "addresses": addresses,
        "responses": {p.label: p.results for p in probes}, "bundle": bundle, "charts": charts,
        "budgets": [{"name": c.name, "value": c.value, "unit": c.unit, "budget": c.budget, "verdict": c.verdict} for c in checks],
    }, indent=2), "utf-8")
    print((args.out / "measure.md").read_text("utf-8"))
    failed = [c for c in checks if c.verdict == "FAIL"]
    print(f"{len(failed)} budget(s) failed" if failed else "All budgets met", f"-> {args.out}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
