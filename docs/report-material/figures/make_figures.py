"""Writes the report's three architecture figures, each as TikZ (.tex) and as SVG, from one layout description.

    python make_figures.py            writes architecture, whatif-flow and request-lifecycle (.tex and .svg) beside this file
    python make_figures.py --pdf      also compiles each .tex with pdflatex, keeps the .pdf and deletes the other build files

Why a script: the TikZ and the SVG must show the same boxes, words and arrows. Each figure is described once (the
functions `architecture`, `whatif` and `lifecycle` below: boxes in centimetres, lines of text, arrows as points), and
both files are written from that description. Change a figure here and run the script; do not edit one output only.

Text markup inside a line: `code` is monospace, **bold** is bold, a leading "!sm " or "!sc " sets that line's size.
The script refuses to write a figure that contains a word from backend/config/settings.json -> bannedWords, and with
--pdf it measures every line in LaTeX and reports a line that is wider than its box.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field

HERE = pathlib.Path(__file__).resolve().parent
SETTINGS = HERE.parents[2] / "backend" / "config" / "settings.json"
CODE_DATE = "21 Nov 2026"  # the day the boxes were last checked against the code on main
S = 40.0  # px per cm in the SVG
COL = {"ink": "1F2933", "accent": "1D4ED8", "accentsoft": "E8EEFC", "teal": "0F766E", "tealsoft": "E6F4F2",
       "violet": "6D28D9", "violetsoft": "F1EBFD", "grey": "6B7280", "greysoft": "F3F4F6", "warn": "B45309",
       "warnsoft": "FDF1E3", "white": "FFFFFF"}
STYLE = {  # name -> (fill, draw)
    "fe": ("accentsoft", "ink"), "be": ("tealsoft", "ink"), "ml": ("violetsoft", "ink"), "st": ("greysoft", "ink"),
    "er": ("warnsoft", "warn"), "plain": ("white", "ink"), "none": (None, None)}
# font sizes: LaTeX command, pt, SVG px, line pitch cm
SIZES = {"sm": ("\\small", 9.0, 11.4, 0.39), "fn": ("\\footnotesize", 8.0, 10.2, 0.335), "sc": ("\\scriptsize", 7.0, 9.0, 0.29)}
TEX_W = {"r": 0.455, "b": 0.52, "m": 0.525}   # average glyph width in em (Latin Modern)
SVG_W = {"r": 0.50, "b": 0.545, "m": 0.602}   # Helvetica / Menlo
SVG_MONO_SCALE = 0.9

TOKEN = re.compile(r"(\*\*.+?\*\*|`.+?`)")
TEX_MAP = {"\\": r"\textbackslash{}", "{": r"\{", "}": r"\}", "_": r"\_", "&": r"\&", "%": r"\%", "#": r"\#", "$": r"\$",
           "~": r"\textasciitilde{}", "^": r"\textasciicircum{}", "–": "--", "→": r"$\rightarrow$", "←": r"$\leftarrow$",
           "↓": r"$\downarrow$", "↑": r"$\uparrow$", "·": r"$\cdot$", "≥": r"$\geq$", "≤": r"$\leq$", "…": r"\ldots{}",
           "×": r"$\times$", "“": "``", "”": "''", "’": "'", "<": r"\textless{}", ">": r"\textgreater{}", "|": r"\textbar{}"}
TEX_MAP_TT = {**TEX_MAP, "-": "-{}", "…": "...", "<": "<", ">": ">", "|": "|", "\"": r"\textquotedbl{}"}


def segments(line: str):
    """[(kind, text)] with kind r (roman), b (bold), m (mono), bm (bold mono)."""
    out = []
    for part in TOKEN.split(line):
        if not part:
            continue
        if part.startswith("**"):
            inner = part[2:-2]
            for sub in re.split(r"(`.+?`)", inner):
                if sub:
                    out.append(("bm", sub[1:-1]) if sub.startswith("`") else ("b", sub))
        elif part.startswith("`"):
            out.append(("m", part[1:-1]))
        else:
            out.append(("r", part))
    return out


def tex_escape(text: str, tt: bool = False) -> str:
    table = TEX_MAP_TT if tt else TEX_MAP
    return "".join(table.get(ch, ch) for ch in text)


def xml(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def split_size(line: str, default: str):
    m = re.match(r"!(sm|fn|sc) ", line)
    return (m.group(1), line[m.end():]) if m else (default, line)


def tex_line(line: str, default: str) -> str:
    size, body = split_size(line, default)
    parts = []
    for kind, text in segments(body):
        if kind == "r":
            parts.append(tex_escape(text))
        elif kind == "b":
            parts.append(r"\textbf{" + tex_escape(text) + "}")
        elif kind == "m":
            parts.append(r"\texttt{" + tex_escape(text, True) + "}")
        else:
            parts.append(r"\textbf{\texttt{" + tex_escape(text, True) + "}}")
    s = "".join(parts)
    return s if size == default else "{" + SIZES[size][0] + " " + s + "}"


def widths(line: str, default: str):
    """Estimated width in cm in LaTeX and in the SVG."""
    size, body = split_size(line, default)
    pt, px = SIZES[size][1], SIZES[size][2]
    tex = svg = 0.0
    for kind, text in segments(body):
        k = {"r": "r", "b": "b", "m": "m", "bm": "m"}[kind]
        n = len(text)
        tex += n * TEX_W[k] * pt * 0.03515
        svg += n * SVG_W[k] * px * (SVG_MONO_SCALE if k == "m" else 1) / S
    return tex, svg


@dataclass
class Box:
    id: str
    x0: float
    x1: float
    y0: float  # top
    y1: float  # bottom
    style: str = "be"
    lines: list = field(default_factory=list)
    size: str = "fn"
    dashed: bool = False
    valign: str = "center"  # or "top"
    halign: str = "center"  # or "left" / "right"
    comment: str = ""

    @property
    def cx(self): return (self.x0 + self.x1) / 2
    @property
    def cy(self): return (self.y0 + self.y1) / 2
    @property
    def w(self): return self.x1 - self.x0
    @property
    def h(self): return self.y0 - self.y1


@dataclass
class Group:
    id: str
    x0: float
    x1: float
    y0: float
    y1: float
    color: str
    label: str = ""
    label_x: float | None = None  # west anchor of the label; default: the frame's left edge
    dashed: bool = False
    fill: str | None = None


@dataclass
class Arrow:
    pts: list
    kind: str = "arr"  # arr, darr (both heads), dash (dashed), err (amber), line (no head)
    comment: str = ""


@dataclass
class Label:
    x: float
    y: float
    text: str
    anchor: str = "center"  # center, west, east
    size: str = "sc"
    color: str = "ink"
    italic: bool = False


class Figure:
    def __init__(self, name, title, desc):
        self.name, self.title, self.desc = name, title, desc
        self.groups, self.boxes, self.arrows, self.labels = [], [], [], []
        self.by_id = {}

    def box(self, *a, **k):
        b = Box(*a, **k); self.boxes.append(b); self.by_id[b.id] = b; return b
    def group(self, *a, **k):
        g = Group(*a, **k); self.groups.append(g); return g
    def arrow(self, pts, kind="arr", comment=""):
        self.arrows.append(Arrow(pts, kind, comment))
    def label(self, *a, **k):
        self.labels.append(Label(*a, **k))

    # ------------------------------------------------------------ checks
    def check(self):
        problems = []
        for b in self.boxes:
            usable = b.w - 0.24
            for line in b.lines:
                tex, svg = widths(line, b.size)
                if tex > usable or svg > usable:
                    problems.append(f"{self.name}:{b.id}: '{line}' tex {tex:.2f} svg {svg:.2f} > {usable:.2f}")
            need = sum(SIZES[split_size(l, b.size)[0]][3] for l in b.lines) + 0.16
            if need > b.h + 1e-6:
                problems.append(f"{self.name}:{b.id}: {len(b.lines)} lines need {need:.2f} > {b.h:.2f}")
        return problems

    def bounds(self):
        xs, ys = [], []
        for b in self.boxes: xs += [b.x0, b.x1]; ys += [b.y0, b.y1]
        for g in self.groups: xs += [g.x0, g.x1]; ys += [g.y0 + (0.42 if g.label else 0), g.y1]
        for a in self.arrows:
            for x, y in a.pts: xs.append(x); ys.append(y)
        for l in self.labels:
            tex, svg = widths(l.text, l.size); w = max(tex, svg)
            lo, hi = {"center": (l.x - w / 2, l.x + w / 2), "west": (l.x, l.x + w), "east": (l.x - w, l.x)}[l.anchor]
            xs += [lo, hi]; ys += [l.y + 0.17, l.y - 0.17]
        m = 0.3
        return min(xs) - m, max(xs) + m, max(ys) + m, min(ys) - m  # x0, x1, ytop, ybottom

    # ------------------------------------------------------------ TikZ
    def tikz(self, header: str) -> str:
        o = [header.rstrip(), "",
             r"\documentclass{article}",
             r"\usepackage[T1]{fontenc}",
             r"\usepackage{lmodern}",
             r"\usepackage{tikz}",
             r"\usetikzlibrary{arrows.meta, backgrounds}",
             "% The plan's colours (docs/plan/main.tex).",
             *[rf"\definecolor{{{n}}}{{HTML}}{{{COL[n]}}}" for n in
               ("ink", "accent", "accentsoft", "teal", "tealsoft", "violet", "violetsoft", "grey", "greysoft", "warn", "warnsoft")],
             r"\pagestyle{empty}",
             r"\newsavebox{\figbox}",
             r"\newlength{\figborder}\setlength{\figborder}{6pt}",
             r"\begin{document}",
             r"\begin{lrbox}{\figbox}%",
             r"\frenchspacing",
             r"\begin{tikzpicture}[x=1cm, y=1cm, font=\footnotesize, text=ink,",
             r"  box/.style={draw=ink, rounded corners=2pt, align=center, inner sep=3pt, line width=0.5pt},",
             r"  fe/.style={box, fill=accentsoft}, be/.style={box, fill=tealsoft}, ml/.style={box, fill=violetsoft},",
             r"  st/.style={box, fill=greysoft}, er/.style={box, fill=warnsoft, draw=warn}, plain/.style={box, fill=white},",
             r"  txt/.style={align=center, inner sep=0pt},",
             r"  grp/.style={rounded corners=4pt, line width=0.6pt},",
             r"  arr/.style={-{Stealth[length=2.2mm]}, thick, draw=ink},",
             r"  darr/.style={{Stealth[length=2.2mm]}-{Stealth[length=2.2mm]}, thick, draw=ink},",
             r"  opt/.style={arr, dashed},",
             r"  err/.style={arr, draw=warn},",
             r"  bare/.style={thick, draw=ink}]",
             ]
        o.append("  % ---- groups (frames behind everything)")
        for g in self.groups:
            fill = f", fill={g.fill}" if g.fill else ""
            dash = ", dashed" if g.dashed else ""
            o.append(rf"  \draw[grp, draw={g.color}{fill}{dash}] ({g.x0:.2f},{g.y1:.2f}) rectangle ({g.x1:.2f},{g.y0:.2f});")
            if g.label:
                lx = g.x0 if g.label_x is None else g.label_x
                o.append(rf"  \node[anchor=south west, inner sep=1.5pt, text={g.color}, font=\small] at ({lx:.2f},{g.y0:.2f}) {{{tex_line(g.label, 'sm')}}};")
        o.append("  % ---- boxes")
        for b in self.boxes:
            if b.comment:
                o.append(f"  % {b.comment}")
            font = "" if b.size == "fn" else f", font={SIZES[b.size][0]}"
            dash = ", dashed" if b.dashed else ""
            body = r"\\ ".join(tex_line(l, b.size) for l in b.lines)
            if b.style == "none":
                shape = f"txt{font}"
            else:
                shape = f"{b.style}{dash}{font}, minimum width={b.w:.2f}cm, minimum height={b.h:.2f}cm"
            if b.valign == "center" and b.halign == "center":
                o.append(rf"  \node[{shape}] ({b.id}) at ({b.cx:.2f},{b.cy:.2f}) {{{body}}};")
            else:
                if b.style != "none":
                    o.append(rf"  \node[{shape}] ({b.id}) at ({b.cx:.2f},{b.cy:.2f}) {{}};")
                al = {"center": "center", "left": "left", "right": "right"}[b.halign]
                ax = {"center": b.cx, "left": b.x0 + 0.13, "right": b.x1 - 0.13}[b.halign]
                if b.valign == "top":
                    anchor = {"center": "north", "left": "north west", "right": "north east"}[b.halign]
                    ay = b.y0 - 0.1
                else:
                    anchor = {"center": "center", "left": "west", "right": "east"}[b.halign]
                    ay = b.cy
                o.append(rf"  \node[txt, align={al}, anchor={anchor}{font}] at ({ax:.2f},{ay:.2f}) {{{body}}};")
        o.append("  % ---- arrows")
        for a in self.arrows:
            if a.comment:
                o.append(f"  % {a.comment}")
            path = " -- ".join(f"({x:.2f},{y:.2f})" for x, y in a.pts)
            o.append(rf"  \draw[{a.kind}] {path};")
        o.append("  % ---- labels")
        for l in self.labels:
            anchor = {"center": "", "west": ", anchor=west", "east": ", anchor=east"}[l.anchor]
            it = r"\itshape " if l.italic else ""
            color = "" if l.color == "ink" else f", text={l.color}"
            o.append(rf"  \node[txt{anchor}{color}, font={SIZES[l.size][0]}] at ({l.x:.2f},{l.y:.2f}) {{{it}{tex_line(l.text, l.size)}}};")
        o += [r"\end{tikzpicture}%", r"\end{lrbox}",
              "% One page, cropped to the picture plus a 6 pt border (what the standalone class would do).",
              r"\pdfpagewidth=\dimexpr\wd\figbox+2\figborder\relax",
              r"\pdfpageheight=\dimexpr\ht\figbox+\dp\figbox+2\figborder\relax",
              r"\pdfhorigin=\figborder \pdfvorigin=\figborder",
              r"\hoffset=0pt \voffset=0pt",
              r"\shipout\vbox{\box\figbox}",
              r"\end{document}", ""]
        return "\n".join(o)

    # ------------------------------------------------------------ SVG
    def svg(self) -> str:
        x0, x1, yt, yb = self.bounds()
        W, H = (x1 - x0) * S, (yt - yb) * S
        X = lambda x: (x - x0) * S
        Y = lambda y: (yt - y) * S
        sans = "'Helvetica Neue', Helvetica, Arial, 'Liberation Sans', sans-serif"
        mono = "Menlo, Consolas, 'DejaVu Sans Mono', 'Liberation Mono', monospace"
        o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W:.0f} {H:.0f}" width="{W:.0f}" height="{H:.0f}" '
             f'role="img" aria-labelledby="t d" font-family="{sans}">',
             f'<title id="t">{xml(self.title)}</title>', f'<desc id="d">{xml(self.desc)}</desc>',
             "<defs>"]
        for name, color in (("ink", COL["ink"]), ("warn", COL["warn"])):
            o.append(f'<marker id="head-{name}" viewBox="0 0 10 8" markerWidth="8.5" markerHeight="6.8" refX="9.2" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">'
                     f'<path d="M0,0 L10,4 L0,8 L2.6,4 Z" fill="#{color}"/></marker>')
        o += ["</defs>",
              "<!-- A white card, so the figure reads the same on a light and on a dark page. -->",
              f'<rect x="0" y="0" width="{W:.0f}" height="{H:.0f}" rx="8" fill="#FFFFFF"/>']

        def tspans(line, default, px_default):
            size, body = split_size(line, default)
            px = SIZES[size][2]
            out = []
            for kind, text in segments(body):
                attrs = ""
                if kind in ("b", "bm"):
                    attrs += ' font-weight="700"'
                if kind in ("m", "bm"):
                    attrs += f' font-family="{mono}" font-size="{px * SVG_MONO_SCALE:.1f}"'
                elif size != default:
                    attrs += f' font-size="{px:.1f}"'
                out.append(f"<tspan{attrs}>{xml(text)}</tspan>" if attrs else xml(text))
            return "".join(out)

        o.append("<g>")
        for g in self.groups:
            fill = f'#{COL[g.fill]}' if g.fill else "none"
            dash = ' stroke-dasharray="5 3"' if g.dashed else ""
            o.append(f'<rect x="{X(g.x0):.1f}" y="{Y(g.y0):.1f}" width="{(g.x1 - g.x0) * S:.1f}" height="{(g.y0 - g.y1) * S:.1f}" rx="6" fill="{fill}" stroke="#{COL[g.color]}" stroke-width="1.1"{dash}/>')
            if g.label:
                lx = g.x0 if g.label_x is None else g.label_x
                o.append(f'<text x="{X(lx) + 2:.1f}" y="{Y(g.y0) - 6:.1f}" font-size="{SIZES["sm"][2]}" fill="#{COL[g.color]}" xml:space="preserve">{tspans(g.label, "sm", 0)}</text>')
        o.append("</g>\n<g>")
        for b in self.boxes:
            if b.style != "none":
                fill, draw = STYLE[b.style]
                dash = ' stroke-dasharray="5 3"' if b.dashed else ""
                o.append(f'<rect x="{X(b.x0):.1f}" y="{Y(b.y0):.1f}" width="{b.w * S:.1f}" height="{b.h * S:.1f}" rx="3" fill="#{COL[fill]}" stroke="#{COL[draw]}" stroke-width="0.9"{dash}/>')
            if not b.lines:
                continue
            pitches = [SIZES[split_size(l, b.size)[0]][3] * S for l in b.lines]
            total = sum(pitches)
            top = Y(b.y0) + 0.1 * S if b.valign == "top" else Y(b.cy) - total / 2
            ta = {"center": "middle", "left": "start", "right": "end"}[b.halign]
            tx = {"center": X(b.cx), "left": X(b.x0 + 0.13), "right": X(b.x1 - 0.13)}[b.halign]
            px = SIZES[b.size][2]
            o.append(f'<text text-anchor="{ta}" font-size="{px}" fill="#{COL["ink"]}" xml:space="preserve">')
            y = top
            for line, pitch in zip(b.lines, pitches):
                lpx = SIZES[split_size(line, b.size)[0]][2]
                o.append(f'<tspan x="{tx:.1f}" y="{y + pitch / 2 + lpx * 0.35:.1f}">{tspans(line, b.size, px)}</tspan>')
                y += pitch
            o.append("</text>")
        o.append("</g>\n<g fill=\"none\" stroke-linejoin=\"round\">")
        for a in self.arrows:
            color = "warn" if a.kind == "err" else "ink"
            d = "M" + " L".join(f"{X(x):.1f},{Y(y):.1f}" for x, y in a.pts)
            extra = ""
            if a.kind != "bare":
                extra += f' marker-end="url(#head-{color})"'
            if a.kind == "darr":
                extra += f' marker-start="url(#head-{color})"'
            if a.kind == "opt":
                extra += ' stroke-dasharray="5 3"'
            o.append(f'<path d="{d}" stroke="#{COL[color]}" stroke-width="1.4"{extra}/>')
        o.append("</g>\n<g>")
        for l in self.labels:
            ta = {"center": "middle", "west": "start", "east": "end"}[l.anchor]
            px = SIZES[l.size][2]
            it = ' font-style="italic"' if l.italic else ""
            o.append(f'<text x="{X(l.x):.1f}" y="{Y(l.y) + px * 0.35:.1f}" text-anchor="{ta}" font-size="{px}" fill="#{COL[l.color]}"{it} xml:space="preserve">{tspans(l.text, l.size, px)}</text>')
        o.append("</g>\n</svg>\n")
        return "\n".join(o)



# ------------------------------------------------------------ the three figures

HEAD = """% {name}.tex -- {what}
% COS30049 Assignment 3, Bitcoin Address Activity Explorer. Drawn from the code on main ({date}).
% Compiles on its own:  pdflatex {name}.tex   (one cropped page; needs only tikz and lmodern).
% It does not use the standalone class, which a small TeX installation may lack; the last lines of
% this file crop the page to the picture instead. To place it in the report: \\includegraphics{{{name}.pdf}}.
% The boxes, words and arrows are the same as in {name}.svg; README.md lists the source file behind each."""


def architecture() -> Figure:
    f = Figure("architecture", "System architecture of the Bitcoin Address Activity Explorer",
               "Browser (React views, charts, hooks, Axios client), the Vite dev proxy, the FastAPI service (middleware, "
               "routers, services, one error module), Assignment 2's frozen runtime, local files, and the optional parts.")
    # ---------------- browser
    f.group("g_fe", -0.2, 17.2, 0.22, -2.12, "accent", "**Browser** · React + TypeScript app, built by Vite (`frontend/src/`)")
    f.box("client", 0.0, 4.0, 0.0, -1.9, "fe", ["!sm **API client**", "`endpoints.ts`: typed calls", "`http.ts`: one Axios instance", "every failure is one `ApiError`"])
    f.box("hooks", 4.2, 8.2, 0.0, -1.9, "fe", ["!sm **Hooks**", "`useRequest`: cancels, caches", "`useServiceStatus`: polls E1", "`useSettings`: reads E2"])
    f.box("views", 8.4, 13.0, 0.0, -1.9, "fe", ["!sm **Views V1–V8** (hash router)", "V1 select · V2 overview · V3 day", "V4 what-if · V5 models", "V6 watchlist · V7 about · V8 live"])
    f.box("charts", 13.2, 17.0, 0.0, -1.9, "fe", ["!sm **Charts G1–G6**", "wrapper: `PlotlyChart.tsx`", "Plotly fetched on demand", "(`plotlyLoader.ts`)"])
    f.arrow([(8.4, -0.95), (8.2, -0.95)], comment="views -> hooks")
    f.arrow([(4.2, -0.95), (4.0, -0.95)], comment="hooks -> client")
    f.arrow([(13.0, -0.95), (13.2, -0.95)], comment="views -> charts")
    # ---------------- proxy and settings
    f.box("proxy", 0.25, 4.55, -2.9, -4.2, "plain", ["!sm **Vite dev server** :5173", "proxies `/api` to 127.0.0.1:8000:", "one origin (D-A3-11)"])
    f.box("settings", 7.6, 17.0, -2.9, -4.2, "st", ["!sm **`backend/config/settings.json`**: the one settings file", "A2's thresholds, the limitation line, the wording rule, the `web` block", "(what-if limits, `debounceMs`, page sizes, time limits, body limit)"])
    f.arrow([(0.9, -1.9), (0.9, -2.9)], "darr", "client <-> proxy")
    f.label(1.1, -2.52, "same origin: `/api/...`", "west")
    f.arrow([(0.9, -4.2), (0.9, -5.5)], "darr", "proxy <-> RequestContext (outermost middleware)")
    f.label(1.1, -4.55, "HTTP + JSON: GET, POST, PUT, DELETE", "west")
    f.arrow([(12.0, -2.9), (12.0, -2.12)], comment="settings.json -> browser (bundled)")
    f.label(12.2, -2.52, "bundled at build: `lib/settings.ts`", "west")
    f.arrow([(16.2, -4.2), (16.2, -5.3)], comment="settings.json -> FastAPI (core/config.py)")
    f.label(16.0, -4.55, "`core/config.py` reads it at start;", "east")
    f.label(16.0, -4.88, "E2 hands `web` to the browser", "east")
    # ---------------- FastAPI
    f.group("g_be", -0.2, 17.2, -5.3, -13.45, "teal", "**FastAPI on Uvicorn :8000** · `backend/app/main.py`, `create_app()`", label_x=1.15)
    names = [("mw1", "1 · RequestContext", "request ID, one log line"), ("mw2", "2 · CORS", "origins, exposed headers"),
             ("mw3", "3 · BodyLimit", "body over 10 kB: 413"), ("mw4", "4 · GZip", "bodies of 1000 B or more"),
             ("mw5", "5 · ETag", "snapshot GETs: tag, 304")]
    for i, (id_, title, sub) in enumerate(names):
        top = -5.5 - 1.4 * i
        f.box(id_, 0.4, 4.2, top, top - 1.05, "be", [f"**{title}**", sub])
        if i:
            f.arrow([(2.3, top + 0.35), (2.3, top)], comment=f"middleware {i} -> {i + 1}")
    f.label(2.3, -12.5, "**Middleware**, outermost first;", size="sc")
    f.label(2.3, -12.83, "`main.py` adds them in reverse", size="sc")
    f.box("errors", 4.8, 17.0, -5.5, -6.7, "er", [
        "**`core/errors.py`**: the one place that decides a status code and builds the error body",
        "{status, message, hint, fields, requestId}; never a stack trace or an echo of the input",
        "validation: 400 · `Unsupported`: 404 · `InsufficientHistory`: 422 · 413 · 429 · 503 · else 500"])
    f.box("routers", 4.8, 7.5, -7.25, -13.22, "be", [
        "!sm **Routers**", "`api/*.py`", "prefix `/api`;", "one service", "call each", "", "system  E1–E2", "addresses  E3–E6", "transactions  E7",
        "what-if  E8–E9", "exports  E10", "methods  E11", "watchlist  E13–E15", "explanations  E12", "live  E16–E20"])
    f.group("g_sv", 8.1, 17.12, -7.25, -13.22, "teal", "")
    f.label(8.25, -7.48, "**Services** · `services/*.py`: no HTTP inside, they only raise", "west", size="sc")
    cells = [
        ("s_explorer", 0, 0, ["**ExplorerService** E3–E7", "one cache entry per (method,", "address); warmed at start"]),
        ("s_whatif", 0, 1, ["**WhatIfService** E8, E9", "E8: `score_what_if` as it is", "E9: one `build_features` call"]),
        ("s_export", 1, 0, ["**ExportService** E10", "the rows E6 lists, as CSV or", "JSON, from the cached view"]),
        ("s_methods", 1, 1, ["**MethodsService** E11", "nine methods: thresholds and", "A2's test results (two tables)"]),
        ("s_store", 2, 0, ["**SnapshotStore** `store.py`", "the `Predictor`'s three tables,", "split by address once at start"]),
        ("s_system", 2, 1, ["**System + model service**", "E1, E2; the lifespan loads the", "`Predictor` once; 503 until then"]),
        ("s_watch", 3, 0, ["**WatchlistService** E13–E15", "`WatchlistRepo`: one SQLite", "connection behind one lock"]),
        ("s_assist", 3, 1, ["**AssistantService** E12", "prepared answers; lazy load;", "one at a time; A2's guardrail"]),
    ]
    for id_, r, c, lines in cells:
        top = -7.7 - 1.4 * r
        x0 = 8.25 if c == 0 else 12.7
        f.box(id_, x0, x0 + (4.25 if c == 0 else 4.3), top, top - 1.2, "be", lines)
    f.arrow([(4.2, -11.62), (4.8, -11.62)], comment="ETag (innermost) -> routers")
    f.arrow([(7.5, -10.3), (8.1, -10.3)], comment="routers -> services")
    f.arrow([(4.2, -8.82), (4.5, -8.82), (4.5, -6.1), (4.8, -6.1)], "err", "BodyLimit -> core/errors.py (413, handle_api_error)")
    f.label(4.6, -6.98, "413", "west", color="warn")
    f.arrow([(6.15, -7.25), (6.15, -6.7)], "err", "routers raise -> core/errors.py")
    f.label(6.3, -6.98, "raise", "west", color="warn")
    f.arrow([(15.6, -7.25), (15.6, -6.7)], "err", "services raise -> core/errors.py")
    f.label(15.75, -6.98, "raise", "west", color="warn")
    # ---------------- bottom band
    f.arrow([(8.5, -13.22), (8.5, -13.82), (6.62, -13.82), (6.62, -14.53)], comment="services -> A2 runtime")
    f.label(6.45, -13.82, "A2's code, called as it is", "east")
    f.group("g_a2", -0.2, 6.85, -14.53, -17.42, "violet", "**A2's frozen runtime**, vendored with hashes")
    f.box("a_explorer", 0.0, 3.25, -14.73, -15.93, "ml", ["**`explorer/`**", "`Predictor`, features,", "methods, guardrail"])
    f.box("a_lm", 3.4, 6.65, -14.73, -15.93, "ml", ["**`lm/`**", "the Assistant writer's", "modules (PyTorch)"])
    f.box("a_models", 0.0, 3.25, -16.05, -17.25, "ml", ["**`models/`**", "nine saved methods", "(`.joblib`, `.json`)"])
    f.box("a_data", 3.4, 6.65, -16.05, -17.25, "ml", ["**`data/`**, **`reports/`**", "the snapshot's tables,", "A2's test results"])
    f.label(-0.2, -17.72, "Hashes: `A2_VENDOR.json` holds the SHA-256 of 49 files · `tools/vendor_a2.py --check` · A2 commit `aa56a26` (tag v1.0)", "west", size="sc")
    f.label(-0.2, -18.05, "V3 and V4 call E12 through the Assistant panel (S-05); prepared answers need no weights. The live lookup (E16–E20, the V8 dialog) is off by default (`EXPLORER_LIVE_LOOKUP`).", "west", size="sc")
    f.box("esplora", 7.1, 9.9, -14.2, -15.7, "plain", ["**Esplora API**", "live lookup", "**S-09, optional**", "!sc (off by default)"], dashed=True)
    f.arrow([(9.3, -14.2), (9.3, -13.22)], "opt", "live lookup -> services (S-09, optional; off by default)")
    f.label(9.45, -13.82, "S-09, optional", "west")
    f.box("db", 10.1, 12.75, -14.2, -15.3, "st", ["**`var/explorer.db`**", "SQLite: watchlist"])
    f.arrow([(12.0, -13.1), (12.0, -14.2)], comment="WatchlistRepo -> SQLite file")
    f.box("answers", 12.95, 16.45, -14.2, -15.3, "st", ["**`assistant_answers.json`**", "677 prepared answers"])
    f.arrow([(14.2, -13.1), (14.2, -14.2)], comment="AssistantService -> prepared answers")
    f.box("weights", 11.0, 17.0, -15.95, -17.0, "plain", ["**Optional**: Assistant weights (610 MB),", "PyTorch and tokenizers; loaded on first use"], dashed=True)
    f.arrow([(16.75, -13.1), (16.75, -15.95)], "opt", "AssistantService -> weights and torch (optional)")
    # ---------------- legend
    f.arrow([(7.1, -16.1), (7.75, -16.1)]); f.label(7.9, -16.1, "a call on `main`", "west")
    f.arrow([(7.1, -16.5), (7.75, -16.5)], "opt"); f.label(7.9, -16.5, "optional (off by default)", "west")
    f.arrow([(7.1, -16.9), (7.75, -16.9)], "err"); f.label(7.9, -16.9, "an error raised", "west")
    return f


def whatif() -> Figure:
    f = Figure("whatif-flow", "The path of one what-if, from a keystroke to the charts",
               "A keystroke in the what-if lab is checked, debounced and sent as E8 and E9; FastAPI validates in two layers "
               "and answers one 400; E8 uses Assignment 2's score_what_if and E9 one batched feature build; the answers "
               "draw the verdict card and charts G3, G4 and G5.")
    # lane 1
    f.group("l1", -0.2, 17.2, 0.22, -3.0, "accent", "**Browser** · V4, the what-if lab (`views/WhatIfLab.tsx`)")
    xs = [0.0, 4.3, 8.6, 12.9]
    lane1 = [
        ("k1", ["!sm **1  Keystroke**", "the form's rules run at once:", "`checkAmount`, `checkWhen`;", "a bad value shows its", "message, nothing is sent"]),
        ("k2", ["!sm **2  Debounce**", "`useDebouncedValue` waits", "`web.whatIf.debounceMs`", "(250 ms) without a change"]),
        ("k3", ["!sm **3  Cancel the older**", "`useRequest`: a new key", "aborts the request in flight", "(`AbortController`)"]),
        ("k4", ["!sm **4  Send**", "E8 `POST …/what-if`", "E9 `POST …/what-if/curve`", "by Axios, through `/api`"]),
    ]
    for x, (id_, lines) in zip(xs, lane1):
        f.box(id_, x, x + 4.1, 0.0, -1.95, "fe", lines)
    for x in xs[1:]:
        f.arrow([(x - 0.2, -0.97), (x, -0.97)])
    f.label(0.0, -2.3, "Two keys are debounced. E8's is {amountBtc, direction, time}; E9's is {direction, time}, so typing an", "west", size="sc")
    f.label(0.0, -2.63, "amount sends E8 again but not E9. An answer already received for a key is reused for the session.", "west", size="sc")
    f.arrow([(15.0, -1.95), (15.0, -4.0)], comment="4 -> 5")
    f.label(14.8, -3.38, "HTTP + JSON", "east")
    # lane 2
    f.group("l2", -0.2, 17.2, -3.75, -11.15, "teal", "**FastAPI** · `api/whatif.py`, `services/whatif_service.py`")
    f.box("v5", 11.4, 16.6, -4.0, -5.6, "be", ["!sm **5  Layer 1: types (Pydantic)**", "`schemas/whatif.py`: types, unknown", "fields, amount > 0, a zoned time;", "`path_address`: the address checksum"])
    f.box("v6", 11.4, 16.6, -6.1, -7.7, "be", ["!sm **6  Layer 2: the service's rules**", "`WhatIfService._problems`: amount", "range; time within `maxGapYears` of", "the last transaction; curve points"])
    f.box("verr", 11.4, 16.6, -8.4, -10.9, "er", ["!sm **`core/errors.py`: one body**", "A type fault: `handle_validation`", "then runs layer 2 on what parsed", "(`FIELD_RULES`), so one 400 `invalid`", "names every field at fault.", "Too little history: 422 (E8, E9)."])
    f.arrow([(12.6, -5.6), (12.6, -6.1)], comment="5 -> 6")
    f.label(12.75, -5.85, "types pass", "west")
    f.arrow([(16.6, -4.8), (16.9, -4.8), (16.9, -9.2), (16.6, -9.2)], "err", "5 -> errors (type fault)")
    f.arrow([(14.0, -7.7), (14.0, -8.4)], "err", "6 -> errors (rule broken: InvalidRequest)")
    f.label(14.15, -8.05, "a rule broken", "west", color="warn")
    f.label(16.78, -5.85, "a type fault", "east", color="warn")
    # E8
    f.box("e8", 0.0, 5.3, -5.4, -10.9, "be", [])
    f.box("e8t", 0.0, 5.3, -5.4, -6.0, "none", ["!sm **7  E8: `WhatIfService.what_if`**"], valign="top")
    f.box("e8a", 0.2, 5.1, -6.05, -8.3, "ml", ["A2's code, as it is:", "**`Predictor.score_what_if`**", "one hypothetical row after the", "strictly earlier history, one", "`build_features`, then the score", "and flag of the 8 usable methods"])
    f.box("e8b", 0.2, 5.1, -8.45, -10.8, "none", ["Around it, in the service:", "422 if too little history lies", "before the time (Mod-6); `ranks`", "among the address's own stored", "scores; the explanation reworded", "(Mod-12). Nothing is stored."])
    # E9
    f.box("e9", 5.6, 10.9, -5.4, -10.9, "be", [])
    f.box("e9t", 5.6, 10.9, -5.4, -6.0, "none", ["!sm **8  E9: `WhatIfService.curve`**"], valign="top")
    f.box("e9a", 5.8, 10.7, -6.05, -7.25, "plain", ["`hypothetical_frame` (Mod-5):", "N amounts (41 by default) make", "N rows, all at the same second"])
    f.box("e9b", 5.8, 10.7, -7.37, -9.22, "ml", ["A2's `build_features`, **one call**", "for all N. A row is given only", "strictly earlier transactions,", "so no hypothetical row sees", "another: each equals E8's row"])
    f.box("e9c", 5.8, 10.7, -9.34, -10.8, "ml", ["A2's `Method.score` and `flags`,", "once per method: 8 of the 9", "(TxGPT is precomputed only):", "`threshold`, `scores[]`, `flags[]`"])
    f.arrow([(11.4, -6.5), (11.15, -6.5), (11.15, -4.9), (2.65, -4.9), (2.65, -5.4)], comment="6 -> 7 (E8)")
    f.label(6.9, -4.7, "E8: one amount", "center")
    f.arrow([(11.4, -7.3), (10.9, -7.3)], comment="6 -> 8 (E9)")
    f.label(11.15, -7.52, "E9", "center")
    f.arrow([(10.9, -10.1), (11.4, -10.1)], "err", "E8/E9 -> errors (422)")
    f.label(11.15, -9.88, "422", "center", color="warn")
    # lane 3
    f.group("l3", -0.2, 17.2, -12.15, -14.85, "accent", "**Browser** · the answer, same view", label_x=3.2)
    f.box("r8", 0.0, 5.3, -12.4, -14.35, "fe", ["!sm **9  E8: `WhatIfResult`**", "verdict card: flagged or not, score", "against the flag line, the reason;", "G3, the verdict table, **G4** (`ranks`)"])
    f.box("r9", 5.6, 10.9, -12.4, -14.35, "fe", ["!sm **10  E9: `CurveResponse`**", "**G5**: one method's score by amount;", "crossings and shaded stretches", "come from the server's `flags[]`", "(`lib/curve.ts`)"])
    f.box("rerr", 11.4, 16.6, -12.4, -14.35, "fe", ["!sm **One `ApiError`** (`api/http.ts`)", "400: the server's words by the field", "422: “Not enough history at that", "time”, and the first date that works"])
    f.arrow([(2.65, -10.9), (2.65, -12.4)], comment="E8 -> verdict card, G3, G4"); f.label(2.8, -11.45, "200", "west")
    f.arrow([(8.25, -10.9), (8.25, -12.4)], comment="E9 -> G5"); f.label(8.4, -11.45, "200", "west")
    f.arrow([(14.0, -10.9), (14.0, -12.4)], "err", "error body -> ApiError"); f.label(14.15, -11.45, "400 or 422", "west", color="warn")
    f.label(0.0, -14.6, "While a newer answer is on its way, the previous one stays on screen, dimmed and marked “Updating…”.", "west", size="sc")
    return f


def lifecycle() -> Figure:
    f = Figure("request-lifecycle", "One GET through the middleware, the cache and back",
               "A GET for an address's timeline passes five middleware layers to the router and the cached explorer "
               "service; the answer returns with an ETag, or as a 304 when the client's copy is current; any error is "
               "built by core/errors.py and leaves the same way.")
    f.box("browser", 0.0, 13.4, 0.0, -1.1, "fe", ["!sm **Browser**, through the Vite proxy", "`GET /api/addresses/{address}/timeline`; a repeat from the browser's cache carries `If-None-Match`"])
    f.label(0.95, -1.4, "on the way in", "west", italic=True)
    f.label(12.45, -1.4, "on the way out", "east", italic=True)
    strips = [
        ("1 · RequestContext", ["gives the request an identifier"], ["adds `X-Request-ID`;", "writes one log line"]),
        ("2 · CORS", ["no `Origin` through the proxy:", "nothing to do"], ["headers for a page on", "another origin only"]),
        ("3 · BodyLimit", ["a GET has no body: passes", "(a body over 10 kB: 413)"], []),
        ("4 · GZip", [], ["compresses a body of", "1000 B or more"]),
        ("5 · ETag", ["notes `If-None-Match`"], ["tags a 200 marked `no-cache`;", "tag matches: **304**, no body"]),
    ]
    for i, (name, into, out) in enumerate(strips):
        top = -1.65 - 0.95 * i
        f.box(f"m{i + 1}", 0.9, 12.5, top, top - 0.85, "be", [f"**{name}**"])
        if into:
            f.box(f"m{i + 1}in", 0.9, 5.3, top, top - 0.85, "none", into, halign="left")
        if out:
            f.box(f"m{i + 1}out", 8.0, 12.5, top, top - 0.85, "none", out, halign="right")
    f.arrow([(0.45, -1.1), (0.45, -6.75)], comment="request, inwards")
    f.arrow([(12.95, -6.75), (12.95, -1.1)], comment="response, outwards")
    f.box("router", 0.0, 13.4, -6.75, -8.05, "be", [
        "!sm **Router** `api/addresses.py`, with `api/deps.py`",
        "`path_address` checks the address; `get_explorer` answers 503 until the models are loaded;",
        "`snapshot_data` marks the answer `Cache-Control: no-cache`, which is what earns it an `ETag`"])
    f.box("service", 0.0, 8.3, -8.55, -9.85, "be", ["!sm **`ExplorerService.timeline`**", "cache: one entry per (method, address), LRU;", "a hit is answered from memory"])
    f.box("a2", 9.1, 13.4, -8.55, -9.85, "ml", ["!sm **`Predictor.score_address`**", "A2's code, on a miss only;", "the result is cut up and kept"])
    f.arrow([(4.15, -8.05), (4.15, -8.55)], "darr", "router <-> service")
    f.arrow([(8.3, -9.2), (9.1, -9.2)], "darr", "service <-> A2 on a miss")
    f.label(8.7, -8.98, "miss", "center")
    f.box("errors", 14.1, 17.4, -6.75, -9.85, "er", ["!sm **`core/errors.py`**", "any `raise` on the way:", "400 `invalid`,", "404 `unsupported`,", "503 `unavailable`, …", "one body, carrying", "the `requestId`;", "anything else: 500"])
    f.arrow([(13.4, -7.4), (14.1, -7.4)], "err", "router/deps raise"); f.label(13.75, -7.18, "raise", "center", color="warn")
    f.arrow([(13.4, -9.2), (14.1, -9.2)], "err", "service / A2 raise"); f.label(13.75, -8.98, "raise", "center", color="warn")
    f.arrow([(15.75, -6.75), (15.75, -5.87), (12.95, -5.87)], "err", "error body joins the way out")
    f.label(15.9, -5.12, "the error body leaves", "center", color="warn")
    f.label(15.9, -5.45, "through the same layers", "center", color="warn")
    return f


WHAT = {"architecture": "the system as built: browser, dev proxy, FastAPI service, Assignment 2's runtime, files, optional parts",
        "whatif-flow": "the path of one what-if (E8 and E9), from a keystroke to the charts",
        "request-lifecycle": "one GET through the middleware to the cache and back (ETag, 304), and the error path"}


def measure(figures: list[Figure]) -> list[str]:
    """The lines LaTeX sets wider than the box they sit in (exact widths, from one pdflatex run)."""
    items = [(f.name, b.id, line, b.size, b.w - 0.24) for f in figures for b in f.boxes for line in b.lines if line]
    tex = [r"\documentclass{article}\usepackage[T1]{fontenc}\usepackage{lmodern}\begin{document}"]
    tex += ["\\setbox0\\hbox{" + SIZES[size][0] + " " + tex_line(line, size) + "}\\typeout{W:" + str(i) + ":\\the\\wd0}"
            for i, (_, _, line, size, _) in enumerate(items)]
    tex.append(r"\end{document}")
    with tempfile.TemporaryDirectory() as tmp:
        (pathlib.Path(tmp) / "m.tex").write_text("\n".join(tex), encoding="utf-8")
        out = subprocess.run(["pdflatex", "-interaction=nonstopmode", "m.tex"], cwd=tmp, capture_output=True, text=True).stdout
    got = {int(m.group(1)): float(m.group(2)) * 0.03515 for m in re.finditer(r"W:(\d+):([\d.]+)pt", out)}
    return [f"{fig}:{box}: {got[i]:.2f} cm in {room:.2f} cm: {line}" for i, (fig, box, line, _, room) in enumerate(items)
            if i in got and got[i] > room]


def main() -> int:
    banned = json.loads(SETTINGS.read_text(encoding="utf-8"))["bannedWords"]
    figures = [architecture(), whatif(), lifecycle()]
    for f in figures:
        tex = f.tikz(HEAD.format(name=f.name, what=WHAT[f.name], date=CODE_DATE))
        svg = f.svg()
        for word in banned:
            if re.search(word, tex + svg, re.IGNORECASE):
                print(f"{f.name}: contains a word the wording rule bans; nothing written")
                return 1
        (HERE / f"{f.name}.tex").write_text(tex, encoding="utf-8")
        (HERE / f"{f.name}.svg").write_text(svg, encoding="utf-8")
        print(f"wrote {f.name}.tex and {f.name}.svg")
    if "--pdf" not in sys.argv:
        return 0
    failed = 0
    for line in measure(figures):
        print("too wide:", line)
        failed = 1
    for f in figures:
        run = subprocess.run(["pdflatex", "-interaction=nonstopmode", "-halt-on-error", f"{f.name}.tex"], cwd=HERE,
                             capture_output=True, text=True)
        notes = [l for l in run.stdout.splitlines() if l.startswith("!") or "Warning" in l or "Overfull" in l]
        print(f"{f.name}.pdf: pdflatex exit {run.returncode}" + ("" if not notes else "; " + " | ".join(notes)))
        failed |= run.returncode != 0
        for ext in (".aux", ".log"):
            (HERE / f"{f.name}{ext}").unlink(missing_ok=True)
    return failed


if __name__ == "__main__":
    sys.exit(main())
