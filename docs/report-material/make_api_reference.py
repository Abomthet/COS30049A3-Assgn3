"""Generate the API reference (Markdown and LaTeX) from backend/openapi.json.

Run from anywhere:  ~/miniconda3/envs/cos30049-a3/bin/python docs/report-material/make_api_reference.py
Writes api-reference.md and api-reference.tex next to this script. Nothing is typed by hand:
every table comes from the schema. The E-number of each operation comes from the plan's
endpoint table (docs/plan/sections/s06-api.tex, E1 to E22), keyed by method and path.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SPEC = ROOT / "backend" / "openapi.json"
SETTINGS = ROOT / "backend" / "config" / "settings.json"

# Method and path -> the plan's endpoint number (s06-api.tex).
E_NUMBER = {
    ("get", "/api/health"): "E1",
    ("get", "/api/config"): "E2",
    ("get", "/api/addresses"): "E3",
    ("post", "/api/lookup"): "E4",
    ("get", "/api/addresses/{address}/timeline"): "E5",
    ("get", "/api/addresses/{address}/transactions"): "E6",
    ("get", "/api/transactions/{txid}"): "E7",
    ("post", "/api/addresses/{address}/what-if"): "E8",
    ("post", "/api/addresses/{address}/what-if/curve"): "E9",
    ("get", "/api/addresses/{address}/export"): "E10",
    ("get", "/api/methods"): "E11",
    ("post", "/api/explanations"): "E12",
    ("get", "/api/watchlist"): "E13",
    ("put", "/api/watchlist/{address}"): "E14",
    ("delete", "/api/watchlist/{address}"): "E15",
}
METHOD_ORDER = {"get": 0, "post": 1, "put": 2, "delete": 3}
REF_PREFIX = "#/components/schemas/"


def ref_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def describe(schema: dict, components: dict, depth: int = 0) -> str:
    """A short, readable type for a schema fragment."""
    if depth > 6:
        return "..."
    if "$ref" in schema:
        return ref_name(schema["$ref"])
    if "anyOf" in schema or "oneOf" in schema:
        parts = schema.get("anyOf") or schema.get("oneOf")
        nullable = any(p.get("type") == "null" for p in parts)
        others = [describe(p, components, depth + 1) for p in parts if p.get("type") != "null"]
        text = " or ".join(others) if others else "null"
        return f"{text} (optional, null allowed)" if nullable else text
    if "enum" in schema:
        base = schema.get("type", "value")
        return f"{base}, one of: " + ", ".join(f"`{v}`" for v in schema["enum"])
    typ = schema.get("type")
    if typ == "array":
        return "array of " + describe(schema.get("items", {}), components, depth + 1)
    if typ == "object" and "properties" in schema:
        return "object"
    text = typ or "any"
    extras = []
    if "format" in schema:
        extras.append(schema["format"])
    for key, label in (("gt", "greater than"), ("minimum", "minimum"), ("maximum", "maximum"),
                       ("minLength", "min length"), ("maxLength", "max length")):
        if key in schema:
            extras.append(f"{label} {schema[key]}")
    return text + (f" ({', '.join(extras)})" if extras else "")


def clean(text: str | None) -> str:
    return " ".join((text or "").split())


def md_cell(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ")


def resolve(schema: dict, components: dict) -> dict:
    if "$ref" in schema:
        return components[ref_name(schema["$ref"])]
    return schema


def fields_table(schema_name: str, components: dict) -> list[str]:
    schema = components[schema_name]
    if schema.get("type") != "object" or "properties" not in schema:
        return [f"The body is `{schema_name}`: {describe(schema, components)}.", ""]
    required = set(schema.get("required", []))
    lines = ["| Field | Type | Required | Meaning |", "|---|---|---|---|"]
    for name, prop in schema["properties"].items():
        meaning = clean(prop.get("description") or resolve(prop, components).get("description"))
        if not meaning and "$ref" in prop:
            meaning = f"As `{ref_name(prop['$ref'])}`."
        lines.append(f"| `{name}` | {md_cell(describe(prop, components))} | {'yes' if name in required else 'no'} | {md_cell(meaning)} |")
    lines.append("")
    if schema.get("additionalProperties") is False:
        lines.append("Unknown fields are refused (400).")
        lines.append("")
    return lines


def load() -> tuple[dict, str]:
    raw = SPEC.read_bytes()
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def operations(spec: dict):
    out = []
    for path, item in spec["paths"].items():
        for method, op in item.items():
            out.append((E_NUMBER.get((method, path), "--"), method, path, op))
    out.sort(key=lambda row: (int(row[0][1:]) if row[0] != "--" else 999, METHOD_ORDER.get(row[1], 9)))
    return out


def status_summary(op: dict) -> str:
    return ", ".join(sorted(op.get("responses", {}), key=lambda s: int(s)))


def build_markdown(spec: dict, digest: str) -> str:
    components = spec["components"]["schemas"]
    ops = operations(spec)
    n_paths = len(spec["paths"])
    out = [
        "# API reference: Bitcoin Address Activity Explorer",
        "",
        "Generated by `docs/report-material/make_api_reference.py` from `backend/openapi.json`. Do not edit by hand; "
        "rerun the script after the schema changes.",
        "",
        f"- Source: `backend/openapi.json`, SHA-256 `{digest}`",
        f"- OpenAPI {spec['openapi']}, API version {spec['info']['version']}",
        f"- Operations found: **{len(ops)}** on **{n_paths}** paths (the plan's E1 to E15; E16 to E22 are not built).",
        "- Base path: `/api`. Errors share one body (`ErrorBody`, see the last section). Validation answers 400, not 422.",
        "- `304 Not Modified` is answered where the client sent `If-None-Match` and the ETag still matches.",
        "",
        "## Summary",
        "",
        "| E | Method | Path | Purpose | Status codes |",
        "|---|---|---|---|---|",
    ]
    for e, method, path, op in ops:
        out.append(f"| {e} | {method.upper()} | `{path}` | {md_cell(clean(op.get('summary')))} | {status_summary(op)} |")
    out.append("")

    out += ["## Endpoints", ""]
    for e, method, path, op in ops:
        out += [f"### {e}: {method.upper()} `{path}`", ""]
        out += [f"**Purpose.** {clean(op.get('summary'))}.", ""]
        desc = clean(op.get("description"))
        if desc:
            out += [desc, ""]
        params = op.get("parameters", [])
        if params:
            out += ["**Parameters**", "", "| Name | In | Type | Required | Default | Meaning |", "|---|---|---|---|---|---|"]
            for p in params:
                sch = p.get("schema", {})
                default = sch.get("default", "")
                default = "" if default == "" else f"`{default}`"
                meaning = clean(p.get("description") or sch.get("description"))
                out.append(f"| `{p['name']}` | {p['in']} | {md_cell(describe(sch, components))} | "
                           f"{'yes' if p.get('required') else 'no'} | {default} | {md_cell(meaning)} |")
            out.append("")
        else:
            out += ["**Parameters.** None.", ""]
        body = op.get("requestBody")
        if body:
            content = body.get("content", {})
            for ctype, media in content.items():
                schema = media.get("schema", {})
                out += [f"**Request body** (`{ctype}`, {'required' if body.get('required') else 'optional'}).", ""]
                if "$ref" in schema:
                    out += fields_table(ref_name(schema["$ref"]), components)
                else:
                    out += [f"Body: {describe(schema, components)}.", ""]
        else:
            out += ["**Request body.** None.", ""]
        out += ["**Responses**", "", "| Status | Meaning | Body |", "|---|---|---|"]
        for status in sorted(op.get("responses", {}), key=lambda s: int(s)):
            resp = op["responses"][status]
            media = resp.get("content", {})
            bodies = []
            for ctype, m in media.items():
                s = m.get("schema", {})
                bodies.append(f"`{ref_name(s['$ref'])}`" if "$ref" in s else f"{ctype}")
            body_text = ", ".join(bodies) if bodies else "no body"
            out.append(f"| {status} | {md_cell(clean(resp.get('description')))} | {body_text} |")
        out.append("")

    out += ["## Schemas", "", "Every named schema in `components/schemas`, as the API sends or receives it.", ""]
    for name in sorted(components):
        out += [f"### `{name}`", ""]
        desc = clean(components[name].get("description"))
        if desc:
            out += [desc, ""]
        out += fields_table(name, components)
    return "\n".join(out).rstrip() + "\n"


def tex_escape(text: str) -> str:
    """Escape LaTeX specials; text in backticks becomes \\texttt."""
    parts = text.split("`")
    out = []
    specials = {"\\": r"\textbackslash{}", "&": r"\&", "%": r"\%", "$": r"\$", "#": r"\#", "_": r"\_",
                "{": r"\{", "}": r"\}", "~": r"\textasciitilde{}", "^": r"\textasciicircum{}"}
    for i, part in enumerate(parts):
        escaped = "".join(specials.get(ch, ch) for ch in part)
        out.append(rf"\texttt{{{escaped}}}" if i % 2 == 1 else escaped)
    return "".join(out)


def build_latex(spec: dict, digest: str) -> str:
    ops = operations(spec)
    lines = [
        "% Generated by docs/report-material/make_api_reference.py from backend/openapi.json. Do not edit by hand.",
        f"% Source SHA-256: {digest}",
        r"\begin{longtable}{@{}L{0.9cm}L{1.6cm}L{4.6cm}L{5.0cm}L{2.6cm}@{}}",
        r"\caption{Summary of the API endpoints (E1 to E15), generated from the OpenAPI schema.}\\",
        r"\toprule",
        r"\textbf{E} & \textbf{Method} & \textbf{Path} & \textbf{Purpose} & \textbf{Status codes} \\",
        r"\midrule",
        r"\endfirsthead",
        r"\toprule",
        r"\textbf{E} & \textbf{Method} & \textbf{Path} & \textbf{Purpose} & \textbf{Status codes} \\",
        r"\midrule",
        r"\endhead",
    ]
    for e, method, path, op in ops:
        lines.append(f"{tex_escape(e)} & {method.upper()} & \\texttt{{{tex_escape(path)}}} & "
                     f"{tex_escape(clean(op.get('summary')))} & {tex_escape(status_summary(op))} \\\\")
    lines += [r"\bottomrule", r"\end{longtable}", ""]
    return "\n".join(lines)


def check_wording(texts: list[str]) -> None:
    banned = json.loads(SETTINGS.read_text(encoding="utf-8"))["bannedWords"]
    for text in texts:
        for word in banned:
            if re.search(rf"\b{re.escape(word)}", text, re.IGNORECASE):
                raise SystemExit(f"banned word '{word}' found in generated output; fix the schema text first")


def main() -> None:
    spec, digest = load()
    md = build_markdown(spec, digest)
    tex = build_latex(spec, digest)
    check_wording([md, tex])
    (HERE / "api-reference.md").write_text(md, encoding="utf-8")
    (HERE / "api-reference.tex").write_text(tex, encoding="utf-8")
    print(f"operations: {len(operations(spec))}")
    print(f"paths: {len(spec['paths'])}")
    print(f"schemas: {len(spec['components']['schemas'])}")
    print(f"wrote {HERE / 'api-reference.md'} and {HERE / 'api-reference.tex'}")


if __name__ == "__main__":
    main()
