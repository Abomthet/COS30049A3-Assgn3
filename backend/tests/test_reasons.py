"""Mod-12: the reasons the web shows are A2's, with the one pair of phrases that repeats itself reworded and every BTC
amount in the text written with eight decimals.

The table below lists every phrase `explorer/explain.py` can produce for the four features in both directions, and what
each becomes. Three features already read well and are unchanged; F4's two phrases ("Higher/Lower ratio to the usual
amount than usual") become "Larger/Smaller amount relative to the usual for this direction".
"""
from __future__ import annotations

import json
import re
from decimal import Decimal
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from explorer.explain import headline, reasons_for
from fastapi.testclient import TestClient

from app.services.reasons import REWORDED, reword, reword_comparison

from .conftest import LARGEST, RUNNING_EXAMPLE

FLAGGED_TX = "c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140"
AMOUNT = re.compile(r"(\d+(?:\.\d+)?) BTC")

BANNED = re.compile("|".join(map(re.escape, json.loads(
    (Path(__file__).resolve().parents[1] / "config" / "settings.json").read_text(encoding="utf-8"))["bannedWords"])), re.IGNORECASE)

# (feature, z, A2's phrase, the web's phrase)
PHRASES = [
    ("F1", 1.0, "Larger amount than usual", "Larger amount than usual"),
    ("F1", -1.0, "Smaller amount than usual", "Smaller amount than usual"),
    ("F2", 1.0, "Busier week than usual", "Busier week than usual"),
    ("F2", -1.0, "Quieter week than usual", "Quieter week than usual"),
    ("F3", 1.0, "Longer gap than usual", "Longer gap than usual"),
    ("F3", -1.0, "Shorter gap than usual", "Shorter gap than usual"),
    ("F4", 1.0, "Higher ratio to the usual amount than usual", "Larger amount relative to the usual for this direction"),
    ("F4", -1.0, "Lower ratio to the usual amount than usual", "Smaller amount relative to the usual for this direction"),
]


@pytest.mark.parametrize("feature,z,a2,web", PHRASES)
def test_each_phrase_a2_can_produce_becomes_the_one_listed(feature: str, z: float, a2: str, web: str) -> None:
    assert headline(feature, z) == a2  # the table is A2's: a change in explain.py fails here first
    assert reword(a2) == web


def test_only_the_repeating_pair_is_in_the_mapping() -> None:
    assert set(REWORDED) == {a2 for feature, _, a2, web in PHRASES if feature == "F4"}


def test_the_new_phrases_pass_the_wording_rule() -> None:
    assert all(BANNED.search(web) is None for *_, web in PHRASES)


def test_an_explanation_is_reworded_line_by_line_and_text_without_a_phrase_is_untouched() -> None:
    text = "Flagged by X.\nWhat stands out compared with this address's own history:\n- Lower ratio to the usual amount than usual: 0.4x."
    assert reword(text).endswith("- Smaller amount relative to the usual for this direction: 0.4x.")
    assert reword("Larger amount than usual") == "Larger amount than usual" and reword("") == ""


@pytest.mark.parametrize("a2,web", [
    ("0.05 BTC moved, against a usual 0.00052495 BTC.", "0.05000000 BTC moved, against a usual 0.00052495 BTC."),
    ("0.0011126 BTC moved", "0.00111260 BTC moved"), ("1 BTC", "1.00000000 BTC"), ("1.23456789 BTC", "1.23456789 BTC"),
    ("1250.5 BTC", "1250.50000000 BTC"), ("0.1 BTC and 2 BTC", "0.10000000 BTC and 2.00000000 BTC"),
    ("95.2x the usual amount, against a usual 0.9x.", "95.2x the usual amount, against a usual 0.9x."),
    ("(BTC) and 3 transactions", "(BTC) and 3 transactions"),
])
def test_every_btc_amount_is_written_with_eight_decimals_and_nothing_else_changes(a2: str, web: str) -> None:
    assert reword(a2) == web


def test_the_amounts_in_an_explanation_are_the_numbers_of_its_facts(shared_client: TestClient) -> None:
    """The plan's flagged transaction: A2 wrote 0.0011126 BTC; the screen's facts say 111,260 satoshis."""
    body = shared_client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE}).json()
    size = next(f for f in body["features"] if f["id"] == "F1")
    moved, usual = f"{Decimal(abs(body['netSats'])) / 10**8:.8f}", f"{size['usual']:.8f}"
    assert (moved, usual) == ("0.00111260", "0.00291708")
    assert f"- Smaller amount than usual: {moved} BTC moved, against a usual {usual} BTC." in body["explanation"]
    assert all(re.fullmatch(r"\d+\.\d{8}", a) for a in AMOUNT.findall(body["explanation"]))


@pytest.mark.slow
def test_the_service_passes_on_a2s_explanations_reworded_for_every_address(shared_client: TestClient, addresses: list[str],
                                                                           reference: Callable[[str], dict[str, Any]]) -> None:
    """E6's `mainReason` and E7's `explanation` equal A2's, reworded, for every flagged transaction and a sample of the rest."""
    seen_f4 = 0
    for address in addresses:
        try:
            whole = reference(address)
        except Exception:  # the three short-history addresses have nothing scored
            continue
        rows = {r["txid"]: r for r in shared_client.get(f"/api/addresses/{address}/transactions",
                                                        params={"pageSize": 200}).json()["transactions"]}
        for i, tx in enumerate(whole["transactions"]):
            reasons = reasons_for(tx["features"])[0]
            if tx["scored"] and tx["txid"] in rows and rows[tx["txid"]]["mainReason"] is not None:
                assert rows[tx["txid"]]["mainReason"] == reword(reasons[0]["headline"])
            if tx["flagged"] or i % 25 == 0:
                body = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": address}).json()
                if body.get("status") == "insufficient_history":
                    continue
                assert body["explanation"] == reword(tx["explanation"])
                assert "ratio to the usual amount than usual" not in body["explanation"]
                amounts = AMOUNT.findall(body["explanation"])
                assert all(re.fullmatch(r"\d+\.\d{8}", a) for a in amounts), body["explanation"]
                if "BTC moved" in body["explanation"]:  # the F1 line states the transaction's own amount
                    assert f"{Decimal(abs(body['netSats'])) / 10**8:.8f} BTC moved" in body["explanation"]
                seen_f4 += "relative to the usual for this direction" in body["explanation"]
    assert seen_f4 > 0, "no sampled explanation had an F4 reason, so the check proved nothing"


def test_a_what_if_explanation_is_reworded_too(shared_client: TestClient) -> None:
    body = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if",
                              json={"amountBtc": 0.05, "direction": "out", "time": "2026-10-20T12:00:00Z"}).json()
    assert "ratio to the usual amount than usual" not in body["explanation"]
    assert "0.05000000 BTC moved" in body["explanation"]  # the request's 0.05 BTC, written with eight places
    assert "Smaller amount relative to the usual for this direction" in body["explanation"] or \
        "Larger amount relative to the usual for this direction" in body["explanation"]


def test_the_export_carries_the_reworded_reason(shared_client: TestClient) -> None:
    exported = shared_client.get(f"/api/addresses/{LARGEST}/export", params={"format": "json", "status": "flagged"}).text
    assert "ratio to the usual amount than usual" not in exported


# ---------------------------------------------------------------- Mod-18: the comparison groups

def group(count: int, extended: bool, window: int = 30, min_tx: int = 20) -> dict[str, Any]:
    """A comparison group written the way `Predictor.comparison` writes it (explorer/predict.py)."""
    text = f"{count} earlier transactions: the previous {window} days" + (f", extended back to reach {min_tx}" if extended else "")
    return {"features": ["F2", "F3"], "label": "All earlier transactions", "description": text, "txCount": count,
            "start": "2024-05-16T05:16:19Z", "end": "2024-07-11T03:32:50Z"}


def test_an_extended_group_below_the_minimum_says_it_holds_all_there_are() -> None:
    (out,) = reword_comparison([group(10, True)], 20)
    assert out["description"] == "10 earlier transactions: all there are, as fewer than 20 exist"
    assert {k: v for k, v in out.items() if k != "description"} == {k: v for k, v in group(10, True).items() if k != "description"}
    assert BANNED.search(out["description"]) is None


def test_a_group_of_one_is_singular() -> None:
    (out,) = reword_comparison([group(1, True)], 20)
    assert out["description"] == "1 earlier transaction: all there are, as fewer than 20 exist"


def test_a_group_of_exactly_the_minimum_is_as_a2_wrote_it() -> None:
    assert reword_comparison([group(20, True)], 20) == [group(20, True)]


def test_a_group_that_was_not_extended_is_as_a2_wrote_it_whatever_its_size() -> None:
    assert reword_comparison([group(3, False), group(24, False)], 20) == [group(3, False), group(24, False)]


def test_the_minimum_is_read_from_the_settings_not_written_into_the_rewrite() -> None:
    from explorer.settings import SETTINGS

    minimum = SETTINGS["features"]["comparisonMinTx"]
    window = SETTINGS["features"]["comparisonWindowDays"]
    (out,) = reword_comparison([group(5, True, window, minimum)])
    assert out["description"] == f"5 earlier transactions: all there are, as fewer than {minimum} exist"
    (other,) = reword_comparison([group(5, True, window, 7)], 7)  # a different minimum is used where it is given
    assert other["description"] == "5 earlier transactions: all there are, as fewer than 7 exist"


def test_the_input_is_not_changed() -> None:
    original = group(10, True)
    reword_comparison([original], 20)
    assert original == group(10, True)


def test_e7_of_the_running_examples_flagged_transaction_has_the_new_text_in_both_groups(shared_client: TestClient) -> None:
    """The address's 11th transaction: 10 earlier transactions exist, so neither window could reach 20."""
    body = shared_client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE, "method": "baseline"}).json()
    assert [(c["txCount"], c["description"]) for c in body["comparison"]] == [
        (10, "10 earlier transactions: all there are, as fewer than 20 exist")] * 2


def test_e7_groups_that_reached_the_minimum_keep_a2s_text(shared_client: TestClient, predictor: Any) -> None:
    rows = shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"pageSize": 200}).json()["transactions"]
    seen = set()
    for row in rows:
        if row["score"] is None:
            continue
        for c in shared_client.get(f"/api/transactions/{row['txid']}", params={"address": RUNNING_EXAMPLE, "method": "baseline"}).json()["comparison"]:
            seen.add(c["description"] if c["txCount"] >= 20 else None)
            if c["txCount"] >= 20:
                assert c["description"].startswith(f"{c['txCount']} earlier transactions: the previous 30 days")
            else:
                plural = "" if c["txCount"] == 1 else "s"
                assert c["description"] == f"{c['txCount']} earlier transaction{plural}: all there are, as fewer than 20 exist"
    assert any(d and "extended back to reach 20" in d for d in seen)  # the unchanged kind is exercised


def test_e8_a_what_if_whose_timing_group_holds_11_says_all_there_are(shared_client: TestClient) -> None:
    """From the recorded what-ifs: 0.001 BTC sent at 2024-07-11 12:00 has 11 earlier transactions for the timing group."""
    body = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if",
                              json={"amountBtc": 0.001, "direction": "out", "time": "2024-07-11T12:00:00Z"}).json()
    timing = next(c for c in body["comparison"] if c["features"] == ["F2", "F3"])
    assert (timing["txCount"], timing["description"]) == (11, "11 earlier transactions: all there are, as fewer than 20 exist")
    assert all("extended back to reach" not in c["description"] for c in body["comparison"])
