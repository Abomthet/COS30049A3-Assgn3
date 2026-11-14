"""The wording of A2's reason text as the web application shows it (Mod-12).

Assignment 2's template (`explorer/explain.py`) is copied unchanged, and two things in its text read badly on a screen.
This module maps both, in one place, wherever the services pass A2's text on (E6 `mainReason`, E7 and E8 `explanation`,
and so E10):

* **A reason that repeats itself.** A2 names a reason by `headline(feature, z)`. Three of the four features read well in
  both directions ("Larger amount than usual", "Busier week than usual", "Longer gap than usual"). F4's z compares this
  transaction's ratio to the address's usual amount with the address's usual ratio, so A2 says "Higher ratio to the
  usual amount than usual" and "Lower ratio to the usual amount than usual". Those two become a plainer phrase.
* **Amounts with a varying number of decimals.** A2's `format_btc` strips trailing zeros ("0.0011126 BTC"), while the
  screen and the plan show eight places ("0.00111260 BTC"). Every BTC amount in the text is written again with eight.

The reason mapping is keyed by A2's own phrases, read from `headline`, so a change in A2's wording cannot leave a stale
key behind unnoticed: `tests/test_reasons.py` lists every phrase A2 can produce and what each becomes.
"""
from __future__ import annotations

import re
from decimal import Decimal

from explorer.explain import check_wording, headline

# F4 only. "relative to the usual for this direction" is what F4 measures: the amount divided by the address's usual
# amount in the same direction (explain.FEATURE_DESCRIPTIONS["F4"]). A positive z is a larger ratio than usual.
_F4_LARGER = "Larger amount relative to the usual for this direction"
_F4_SMALLER = "Smaller amount relative to the usual for this direction"

REWORDED: dict[str, str] = {headline("F4", 1.0): _F4_LARGER, headline("F4", -1.0): _F4_SMALLER}

for _text in REWORDED.values():
    check_wording(_text)  # the wording rule (A1 NFR-01) holds for the new text as it does for A2's

# A satoshi is a hundred-millionth of a bitcoin, so eight decimals is the smallest unit and no amount loses a digit.
BTC_PLACES = 8
# What `format_btc` writes: digits, optionally a point and digits, a space and "BTC". It never writes a thousands separator.
_BTC_AMOUNT = re.compile(r"(\d+(?:\.\d+)?) BTC\b")


def _eight_places(match: re.Match[str]) -> str:
    """One BTC amount of A2's text, written with eight decimals. Formatted from the decimal text, so no digit is rounded."""
    return f"{Decimal(match.group(1)):.{BTC_PLACES}f} BTC"


def reword(text: str) -> str:
    """`text` with A2's repeating phrases replaced and every BTC amount written with eight decimals.

    Works on a single headline (a row's `mainReason`) and on a whole explanation, where a headline begins a line.
    Text without either is returned as it is.
    """
    for old, new in REWORDED.items():
        text = text.replace(old, new)
    return _BTC_AMOUNT.sub(_eight_places, text)
