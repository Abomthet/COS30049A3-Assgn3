"""The wording of A2's reason text as the web application shows it (Mod-12, Mod-18, Mod-19, Mod-20, Mod-21).

Assignment 2's template (`explorer/explain.py`) is copied unchanged. The web layer builds its own version of what a
transaction's reasons say, in one place, from A2's own choice of reasons (`explain.reasons_for`) and figure texts
(`explain.describe_value`):

* **`web_reasons`** (Mod-20): the structured list of E7 and E8, strongest first: feature, label, level, and the figure
  texts the explanation lines use, so no tier formats these numbers itself.
* **`web_explanation`** (Mod-20): the short text of E7, E8, E10 and the Assistant's template fallback: the model's reason
  line when A2 has one, one line per reason, and on a flagged item the limitation line.
* **Labels**: F1 to F3 read well as A2 writes them. F4's z compares this transaction's ratio to the address's usual ratio,
  so A2 says "Higher ratio to the usual amount than usual"; the web says what it means and in which direction:
  "Large for a received amount", "Small for a sent amount" (`reword`, which needs the transaction's direction).
* **Amounts** have eight decimals ("0.0011126 BTC" becomes "0.00111260 BTC"; a satoshi is the smallest unit).
* **Comparison lines** (`reword_comparison`, Mod-18 and Mod-20): "its last 10 received", "its last 20 transactions".
* **The limitation line** (Mod-19): A2's line becomes the web line from `shared/wording.json` (`reword_limitation`); it runs
  after A2's guardrail has judged an Assistant answer, because the guardrail looks for A2's exact line.

The label mapping is keyed by A2's own phrases, read from `headline`, so a change in A2's wording cannot leave a stale
key behind unnoticed: `tests/test_reasons.py` lists every phrase A2 can produce and what each becomes.
"""
from __future__ import annotations

import re
from collections.abc import Iterable
from decimal import Decimal
from typing import Any

from explorer.explain import METHOD_NAMES, check_wording, describe_value, headline, reasons_for

from ..core.config import A2_LIMITATION_LINE, limitation_line
from ..core.method_names import SHORT_NAMES

# What a transaction that could not be scored says (W64): the one text for the 422 message and for an explanation.
NOT_SCORED_TEXT = "Too little earlier history to score this transaction."

# How a direction reads in F4's label. F4 is the amount divided by the address's usual amount in the same direction
# (explain.FEATURE_DESCRIPTIONS["F4"]). A transaction's direction is "in", "out", or "none" when it received as much as it
# sent (A2's `features.direction`); the snapshot has none of those, but F4 can be scored for one (its ratio is 0 and is
# compared with the address's usual ratio like any other), so "none" has a label too.
_F4_FOR = {"in": "a received amount", "out": "a sent amount"}
_F4_FOR_OTHER = "its direction"
# A positive z is a larger ratio than usual.
_F4_SIZE = {headline("F4", 1.0): "Large", headline("F4", -1.0): "Small"}


def reason_label(a2_headline: str, direction: str) -> str:
    """The label of a reason from A2's headline: F4's two become "Large/Small for a received/sent amount", the rest stay."""
    size = _F4_SIZE.get(a2_headline)
    if size is None:
        return a2_headline
    label = f"{size} for {_F4_FOR.get(direction, _F4_FOR_OTHER)}"
    check_wording(label)  # the wording rule (A1 NFR-01) holds for the new text as it does for A2's
    return label


for _direction in ("in", "out", "none"):
    for _a2 in _F4_SIZE:
        reason_label(_a2, _direction)

# A satoshi is a hundred-millionth of a bitcoin, so eight decimals is the smallest unit and no amount loses a digit.
BTC_PLACES = 8
# What `format_btc` writes: digits, optionally a point and digits, a space and "BTC". It never writes a thousands separator.
_BTC_AMOUNT = re.compile(r"(\d+(?:\.\d+)?) BTC\b")
# A2's long method names that the web shows shorter, longest first so that no name is cut inside a longer one.
_RENAMED = sorted(((METHOD_NAMES[i], SHORT_NAMES[i]) for i in METHOD_NAMES if METHOD_NAMES[i] != SHORT_NAMES[i]),
                  key=lambda pair: -len(pair[0]))


def _eight_places(match: re.Match[str]) -> str:
    """One BTC amount of A2's text, written with eight decimals. Formatted from the decimal text, so no digit is rounded."""
    return f"{Decimal(match.group(1)):.{BTC_PLACES}f} BTC"


def reword(text: str, direction: str) -> str:
    """`text` with A2's F4 phrases replaced, the methods named shortly and every BTC amount written with eight decimals.

    Works on a single headline (a row's `mainReason`) and on the text of an Assistant answer, where a headline begins a
    line. `direction` is the transaction's ("in", "out" or "none"): F4's label says which. Text without any of these is
    returned as it is.
    """
    for a2 in _F4_SIZE:
        text = text.replace(a2, reason_label(a2, direction))
    for long, short in _RENAMED:
        text = text.replace(long, short)
    return _BTC_AMOUNT.sub(_eight_places, reword_limitation(text))


def reword_limitation(text: str) -> str:
    """`text` with A2's limitation line replaced by the web line (Mod-19); text without A2's line is returned as it is."""
    return text.replace(A2_LIMITATION_LINE, limitation_line())


def figure_text(feature: str, value: float | None, usual: bool = False) -> str:
    """A feature's value as the screen writes it: A2's own text, with BTC to eight decimals and F4's ratio with "×".

    Args:
        feature: "F1" to "F4".
        value: The feature's value in the units of E7 (BTC, a count, hours, a ratio); None gives A2's "-".
        usual: True for the address's usual value (A2 writes F2's usual with one decimal).
    """
    text = describe_value(feature, value, usual)
    if feature == "F1":
        return _BTC_AMOUNT.sub(_eight_places, text)
    if feature == "F4" and text.endswith("x"):
        return f"{text[:-1]}\u00d7"
    return text


def web_reasons(tx: dict[str, Any]) -> list[dict[str, Any]]:
    """E7 and E8's `reasons` for a scored transaction (a detail as `Predictor.detail` gives it), strongest first.

    The choice and the order are A2's `reasons_for`: the features at or above the contributing level, else the two largest
    differences (level "largest"). The labels depend on the transaction's direction; the figure texts are `figure_text`'s.
    """
    if not tx.get("scored", True):
        return []
    by_id = {f["id"]: f for f in tx["features"]}
    chosen, _ = reasons_for(tx["features"])
    return [{"feature": r["id"], "label": reason_label(r["headline"], tx["direction"]), "level": r["level"],
             "valueText": figure_text(r["id"], by_id[r["id"]]["value"]),
             "usualText": figure_text(r["id"], by_id[r["id"]]["usual"], usual=True)} for r in chosen]


def _reason_line(reason: dict[str, Any]) -> str:
    """One line of the explanation: the label, then the figures (F4 states the ratio; its usual one is left out)."""
    if reason["feature"] == "F4":
        return f"- {reason['label']}: {reason['valueText']} its usual size"
    return f"- {reason['label']}: {reason['valueText']} (usual {reason['usualText']})"


def web_explanation(tx: dict[str, Any], reasons: list[dict[str, Any]] | None = None) -> str:
    """The text of E7, E8, E10's reasons and the Assistant's fallback: shorter than A2's template (Mod-20).

    No "Flagged by ..." line and no introduction; A2's "The model's reason: ..." line when a method gives one; one line per
    reason; on a flagged item the limitation line. A transaction that was not scored says so in one sentence.
    """
    if not tx.get("scored", True):
        return NOT_SCORED_TEXT
    lines = []
    if tx.get("model_reason"):
        lines.append(f"The model's reason: {tx['model_reason']}.")
    lines += [_reason_line(r) for r in (web_reasons(tx) if reasons is None else reasons)]
    if tx["flagged"]:
        lines.append(limitation_line())
    text = "\n".join(lines)
    check_wording(text)
    return text


def reword_comparison(basis: Iterable[dict[str, Any]], direction: str) -> list[dict[str, Any]]:
    """The comparison groups of E7 and E8 with each `description` written as "its last 10 received" (Mod-18, Mod-20).

    A2 writes "10 earlier transactions: the previous 30 days, extended back to reach 20", which says how the window was
    chosen and, for a short history, contradicts itself. The web says only what was compared with: the group of the size
    features (A2's F1 and F4 window) holds earlier transactions in the transaction's direction, "its last 10 received" or
    "its last 10 sent"; the group of the timing features holds all earlier transactions, "its last 20 transactions". One
    transaction reads "its last received transaction", "its last sent transaction" or "its last transaction". `label`,
    `txCount`, `start` and `end` are as A2 wrote them. For the direction "none" the size group reads "its last 10 in the
    same direction".
    """
    out = []
    for group in basis:
        n = group["txCount"]
        if "F1" in group["features"]:  # the size window: the same direction
            kind = {"in": "received", "out": "sent"}.get(direction)
            text = (f"its last {kind} transaction" if n == 1 else f"its last {n} {kind}") if kind else (
                "its last transaction in the same direction" if n == 1 else f"its last {n} in the same direction")
        else:
            text = "its last transaction" if n == 1 else f"its last {n} transactions"
        check_wording(text)
        out.append({**group, "description": text})
    return out
