"""Mod-12, Mod-18, Mod-20, Mod-21: the reasons the web shows are A2's choice, in the web's words.

The table below lists every phrase `explorer/explain.py` can produce for the four features in both directions, and what
each becomes. F1 to F3 already read well and are unchanged; F4's two phrases ("Higher/Lower ratio to the usual amount than
usual") become "Large/Small for a received/sent amount", by the transaction's direction. `reasons` (E7, E8) is A2's
`reasons_for`, with those labels; `explanation` is one line per reason.
"""
from __future__ import annotations

import json
import re
from decimal import Decimal
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from explorer.explain import describe_value, headline, reasons_for
from fastapi.testclient import TestClient

from app.core.config import limitation_line
from app.services.reasons import (NOT_SCORED_TEXT, figure_text, reason_label, reword, reword_comparison, web_explanation,
                                  web_reasons)

from .conftest import LARGEST, RUNNING_EXAMPLE

FLAGGED_TX = "c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140"
AMOUNT = re.compile(r"(\d+(?:\.\d+)?) BTC")

BANNED = re.compile("|".join(map(re.escape, json.loads(
    (Path(__file__).resolve().parents[1] / "config" / "settings.json").read_text(encoding="utf-8"))["bannedWords"])), re.IGNORECASE)

# (feature, z, A2's phrase, direction, the web's phrase)
PHRASES = [
    ("F1", 1.0, "Larger amount than usual", "in", "Larger amount than usual"),
    ("F1", -1.0, "Smaller amount than usual", "out", "Smaller amount than usual"),
    ("F2", 1.0, "Busier week than usual", "in", "Busier week than usual"),
    ("F2", -1.0, "Quieter week than usual", "out", "Quieter week than usual"),
    ("F3", 1.0, "Longer gap than usual", "in", "Longer gap than usual"),
    ("F3", -1.0, "Shorter gap than usual", "out", "Shorter gap than usual"),
    ("F4", 1.0, "Higher ratio to the usual amount than usual", "in", "Large for a received amount"),
    ("F4", -1.0, "Lower ratio to the usual amount than usual", "in", "Small for a received amount"),
    ("F4", 1.0, "Higher ratio to the usual amount than usual", "out", "Large for a sent amount"),
    ("F4", -1.0, "Lower ratio to the usual amount than usual", "out", "Small for a sent amount"),
    # A transaction that received as much as it sent: A2 can score F4 for it (the ratio is 0), and the snapshot has none.
    ("F4", 1.0, "Higher ratio to the usual amount than usual", "none", "Large for its direction"),
    ("F4", -1.0, "Lower ratio to the usual amount than usual", "none", "Small for its direction"),
]


@pytest.mark.parametrize("feature,z,a2,direction,web", PHRASES)
def test_each_phrase_a2_can_produce_becomes_the_one_listed(feature: str, z: float, a2: str, direction: str, web: str) -> None:
    assert headline(feature, z) == a2  # the table is A2's: a change in explain.py fails here first
    assert reword(a2, direction) == web == reason_label(a2, direction)


def test_every_a2_phrase_is_in_the_table_for_every_direction() -> None:
    covered = {(feature, a2, direction) for feature, _, a2, direction, _ in PHRASES}

    assert {(a2, d) for f, a2, d in covered if f == "F4"} == {(headline("F4", z), d) for z in (1.0, -1.0) for d in ("in", "out", "none")}


def test_the_new_phrases_pass_the_wording_rule() -> None:
    assert all(BANNED.search(web) is None for *_, web in PHRASES)


def test_text_is_reworded_line_by_line_and_text_without_a_phrase_is_untouched() -> None:
    text = "Flagged by X.\n- Lower ratio to the usual amount than usual: 0.4x."
    assert reword(text, "out").endswith("- Small for a sent amount: 0.4x.")
    assert reword("Larger amount than usual", "in") == "Larger amount than usual" and reword("", "in") == ""


@pytest.mark.parametrize("a2,web", [
    ("0.05 BTC moved, against a usual 0.00052495 BTC.", "0.05000000 BTC moved, against a usual 0.00052495 BTC."),
    ("0.0011126 BTC moved", "0.00111260 BTC moved"), ("1 BTC", "1.00000000 BTC"), ("1.23456789 BTC", "1.23456789 BTC"),
    ("1250.5 BTC", "1250.50000000 BTC"), ("0.1 BTC and 2 BTC", "0.10000000 BTC and 2.00000000 BTC"),
    ("95.2x the usual amount, against a usual 0.9x.", "95.2x the usual amount, against a usual 0.9x."),
    ("(BTC) and 3 transactions", "(BTC) and 3 transactions"),
])
def test_every_btc_amount_is_written_with_eight_decimals_and_nothing_else_changes(a2: str, web: str) -> None:
    assert reword(a2, "in") == web


# ---------------------------------------------------------------- Mod-20: reasons and the explanation text

def feature(fid: str, value: float | None, usual: float | None, z: float | None, role: str) -> dict[str, Any]:
    return {"id": fid, "name": fid, "description": "", "value": value, "usual": usual, "z": z, "role": role}


def tx_with(features: list[dict[str, Any]], direction: str = "in", flagged: bool = True, **more: Any) -> dict[str, Any]:
    return {"scored": True, "flagged": flagged, "direction": direction, "features": features, **more}


F1_UP = feature("F1", 0.05, 0.00063694, 6.1, "flag")
F2_UP = feature("F2", 3.0, 2.5, 2.4, "contributing")
F3_UP = feature("F3", 144.0, 10.0, 3.0, "contributing")
F4_DOWN = feature("F4", 0.4, 1.4, -5.2, "flag")


@pytest.mark.parametrize("fid,item,line", [
    ("F1", F1_UP, "- Larger amount than usual: 0.05000000 BTC (usual 0.00063694 BTC)"),
    ("F2", F2_UP, "- Busier week than usual: 3 transactions (usual 2.5 transactions)"),
    ("F3", F3_UP, "- Longer gap than usual: 6 days (usual 10 hours)"),
    ("F4", F4_DOWN, "- Small for a received amount: 0.4\u00d7 its usual size"),
])
def test_each_feature_has_its_line_format(fid: str, item: dict[str, Any], line: str) -> None:
    assert web_explanation(tx_with([item], flagged=False)) == line


def test_the_figure_texts_are_a2s_own_with_eight_decimals_and_the_multiplication_sign() -> None:
    assert figure_text("F1", 0.05) == "0.05000000 BTC" and figure_text("F1", 0.00063694, usual=True) == "0.00063694 BTC"
    assert figure_text("F2", 3.0) == "3 transactions" and figure_text("F2", 2.5, usual=True) == "2.5 transactions"
    assert figure_text("F3", 144.0) == "6 days" and figure_text("F3", 10.0, usual=True) == "10 hours"
    assert figure_text("F4", 0.4) == "0.4\u00d7" and figure_text("F4", 1.4, usual=True) == "1.4\u00d7"
    assert figure_text("F4", 0.045) == "0.045\u00d7" and figure_text("F1", None) == "-"
    for fid, value in (("F2", 3.0), ("F3", 144.0), ("F4", 0.4)):
        assert figure_text(fid, value) == describe_value(fid, value).replace("x", "\u00d7")


def test_a_flagged_text_ends_with_the_limitation_line_and_has_no_intro_or_method_line() -> None:
    text = web_explanation(tx_with([F4_DOWN, F1_UP]))
    lines = text.split("\n")
    assert lines[-1] == limitation_line() and len(lines) == 3 and all(line.startswith("- ") for line in lines[:2])
    assert "Flagged by" not in text and "stands out" not in text and "Largest differences" not in text


def test_a_not_flagged_text_has_no_limitation_line() -> None:
    assert limitation_line() not in web_explanation(tx_with([F2_UP], flagged=False))


def test_the_models_reason_line_is_kept_first() -> None:
    text = web_explanation(tx_with([F2_UP], flagged=False, model_reason="the tokens were surprising"))
    assert text.split("\n") == ["The model's reason: the tokens were surprising.", "- Busier week than usual: 3 transactions (usual 2.5 transactions)"]


def test_a_transaction_that_was_not_scored_says_so_in_one_sentence() -> None:
    assert web_explanation({"scored": False}) == NOT_SCORED_TEXT == "Too little earlier history to score this transaction."
    assert web_reasons({"scored": False}) == []


def test_reasons_are_a2s_choice_and_order_with_the_web_labels() -> None:
    features = [F1_UP, F2_UP, F3_UP, F4_DOWN, feature("F2", None, None, None, "no-comparison")]
    ours = web_reasons(tx_with(features, "out"))
    theirs, _ = reasons_for(features)
    assert [(r["feature"], r["level"]) for r in ours] == [(r["id"], r["level"]) for r in theirs]
    assert [r["feature"] for r in ours] == ["F1", "F4", "F3", "F2"]  # strongest |z| first
    assert [r["label"] for r in ours] == ["Larger amount than usual", "Small for a sent amount", "Longer gap than usual", "Busier week than usual"]
    assert ours[0] == {"feature": "F1", "label": "Larger amount than usual", "level": "flag",
                       "valueText": "0.05000000 BTC", "usualText": "0.00063694 BTC"}


def test_when_no_feature_reaches_a_line_the_two_largest_have_level_largest() -> None:
    quiet = [feature("F1", 0.01, 0.01, 0.5, "within-usual"), feature("F2", 1.0, 1.0, 1.5, "within-usual"),
             feature("F3", 5.0, 5.0, -1.0, "within-usual")]
    ours = web_reasons(tx_with(quiet, flagged=False))
    assert [(r["feature"], r["level"]) for r in ours] == [("F2", "largest"), ("F3", "largest")]
    assert web_explanation(tx_with(quiet, flagged=False)).count("\n") == 1  # two lines, no intro


def test_the_explanation_lines_use_the_same_figure_texts_as_reasons() -> None:
    tx = tx_with([F1_UP, F4_DOWN, F2_UP, F3_UP])
    for reason, line in zip(web_reasons(tx), web_explanation(tx).split("\n"), strict=False):
        assert line.startswith(f"- {reason['label']}: {reason['valueText']}")
        assert (reason["feature"] == "F4") == line.endswith("its usual size")
        assert reason["feature"] == "F4" or line.endswith(f"(usual {reason['usualText']})")


def test_e7_has_reasons_and_the_short_explanation(shared_client: TestClient) -> None:
    body = shared_client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE}).json()
    assert body["direction"] == "in"
    assert body["reasons"] == [
        {"feature": "F4", "label": "Small for a received amount", "level": "flag", "valueText": "0.4\u00d7", "usualText": "1.4\u00d7"},
        {"feature": "F1", "label": "Smaller amount than usual", "level": "contributing",
         "valueText": "0.00111260 BTC", "usualText": "0.00291708 BTC"}]
    assert body["explanation"] == ("- Small for a received amount: 0.4\u00d7 its usual size\n"
                                   "- Smaller amount than usual: 0.00111260 BTC (usual 0.00291708 BTC)\n" + limitation_line())


def test_the_amounts_in_an_explanation_are_the_numbers_of_its_facts(shared_client: TestClient) -> None:
    """The plan's flagged transaction: A2 wrote 0.0011126 BTC; the screen's facts say 111,260 satoshis."""
    body = shared_client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE}).json()
    size = next(f for f in body["features"] if f["id"] == "F1")
    moved, usual = f"{Decimal(abs(body['netSats'])) / 10**8:.8f}", f"{size['usual']:.8f}"
    assert (moved, usual) == ("0.00111260", "0.00291708")
    assert f"- Smaller amount than usual: {moved} BTC (usual {usual} BTC)" in body["explanation"]
    assert all(re.fullmatch(r"\d+\.\d{8}", a) for a in AMOUNT.findall(body["explanation"]))


@pytest.mark.slow
def test_the_service_serves_a2s_reasons_in_the_web_words_for_every_address(shared_client: TestClient, addresses: list[str],
                                                                           reference: Callable[[str], dict[str, Any]]) -> None:
    """E6's `mainReason` and E7's `reasons` and `explanation` follow A2's `reasons_for` for every flagged transaction and a sample of the rest."""
    seen_f4 = {"in": 0, "out": 0}
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
                assert rows[tx["txid"]]["mainReason"] == reword(reasons[0]["headline"], tx["direction"])
            if tx["flagged"] or i % 25 == 0:
                body = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": address}).json()
                if body.get("status") == "insufficient_history":
                    continue
                assert [(r["feature"], r["level"]) for r in body["reasons"]] == [(r["id"], r["level"]) for r in reasons]
                assert [r["label"] for r in body["reasons"]] == [reword(r["headline"], tx["direction"]) for r in reasons]
                assert body["explanation"] == web_explanation(tx)
                assert "ratio to the usual amount than usual" not in body["explanation"]
                assert "Flagged by" not in body["explanation"] and "stands out" not in body["explanation"]
                assert len(body["explanation"].split("\n")) == len(reasons) + int(body["flagged"])
                assert all(re.fullmatch(r"\d+\.\d{8}", a) for a in AMOUNT.findall(body["explanation"])), body["explanation"]
                for r in body["reasons"]:
                    if r["feature"] == "F4":
                        assert r["label"].endswith("for a received amount" if body["direction"] == "in" else "for a sent amount")
                        seen_f4[body["direction"]] += 1
    assert all(seen_f4.values()), f"no sampled F4 reason in both directions ({seen_f4}), so the check proved nothing"


def test_a_what_if_has_reasons_and_the_short_explanation_too(shared_client: TestClient) -> None:
    body = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if",
                              json={"amountBtc": 0.05, "direction": "out", "time": "2026-10-20T12:00:00Z"}).json()
    assert body["reasons"] and body["reasons"][0]["level"] in ("flag", "contributing", "largest")
    size = next(r for r in body["reasons"] if r["feature"] == "F1")
    assert size["valueText"] == "0.05000000 BTC"  # the request's 0.05 BTC, written with eight places
    assert f"- {size['label']}: 0.05000000 BTC (usual {size['usualText']})" in body["explanation"]
    assert all(r["label"].endswith("for a sent amount") for r in body["reasons"] if r["feature"] == "F4")
    assert "Flagged by" not in body["explanation"] and "ratio to the usual amount than usual" not in body["explanation"]


def test_the_export_carries_the_reworded_reason(shared_client: TestClient) -> None:
    exported = shared_client.get(f"/api/addresses/{LARGEST}/export", params={"format": "json", "status": "flagged"}).text
    assert "ratio to the usual amount than usual" not in exported and "relative to the usual for this direction" not in exported


# ---------------------------------------------------------------- Mod-18 and Mod-20: the comparison groups

def group(count: int, extended: bool, features: tuple[str, ...] = ("F2", "F3"), window: int = 30, min_tx: int = 20) -> dict[str, Any]:
    """A comparison group written the way `Predictor.comparison` writes it (explorer/predict.py)."""
    text = f"{count} earlier transactions: the previous {window} days" + (f", extended back to reach {min_tx}" if extended else "")
    return {"features": list(features), "label": "All earlier transactions" if "F2" in features else
            "Earlier transactions in the same direction", "description": text, "txCount": count,
            "start": "2024-05-16T05:16:19Z", "end": "2024-07-11T03:32:50Z"}


@pytest.mark.parametrize("direction,count,size_text,all_text", [
    ("in", 10, "its last 10 received", "its last 10 transactions"),
    ("out", 20, "its last 20 sent", "its last 20 transactions"),
    ("in", 1, "its last received transaction", "its last transaction"),
    ("out", 1, "its last sent transaction", "its last transaction"),
    ("none", 3, "its last 3 in the same direction", "its last 3 transactions"),
    ("none", 1, "its last transaction in the same direction", "its last transaction"),
])
def test_each_group_reads_its_last_n(direction: str, count: int, size_text: str, all_text: str) -> None:
    size, timing = reword_comparison([group(count, True, ("F1", "F4")), group(count, False)], direction)
    assert (size["description"], timing["description"]) == (size_text, all_text)
    assert BANNED.search(size_text + all_text) is None


def test_label_count_and_dates_keep_their_values_and_the_input_is_not_changed() -> None:
    original = group(10, True, ("F1", "F4"))
    (out,) = reword_comparison([original], "in")
    assert {k: v for k, v in out.items() if k != "description"} == {k: v for k, v in original.items() if k != "description"}
    assert original == group(10, True, ("F1", "F4"))


def test_the_old_phrases_are_gone_whether_or_not_a_window_was_extended() -> None:
    for extended in (True, False):
        for n in (1, 10, 20, 24):
            for item in reword_comparison([group(n, extended), group(n, extended, ("F1", "F4"))], "in"):
                assert "extended back" not in item["description"] and "all there are" not in item["description"]
                assert "previous 30 days" not in item["description"]


def test_e7_of_the_running_examples_flagged_transaction_has_the_new_text_in_both_groups(shared_client: TestClient) -> None:
    """The address's 11th transaction (received): 10 earlier transactions exist, so neither window could reach 20."""
    body = shared_client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE, "method": "baseline"}).json()
    assert [(c["label"], c["txCount"], c["description"]) for c in body["comparison"]] == [
        ("Earlier transactions in the same direction", 10, "its last 10 received"), ("All earlier transactions", 10, "its last 10 transactions")]


def test_e7_every_group_of_the_running_example_reads_its_last_n(shared_client: TestClient) -> None:
    rows = shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"pageSize": 200}).json()["transactions"]
    seen = 0
    for row in rows:
        if row["score"] is None:
            continue
        body = shared_client.get(f"/api/transactions/{row['txid']}", params={"address": RUNNING_EXAMPLE, "method": "baseline"}).json()
        kind = {"in": "received", "out": "sent"}[body["direction"]]
        for c in body["comparison"]:
            n = c["txCount"]
            if "F1" in c["features"]:
                assert c["description"] == (f"its last {kind} transaction" if n == 1 else f"its last {n} {kind}")
            else:
                assert c["description"] == ("its last transaction" if n == 1 else f"its last {n} transactions")
            seen += 1
    assert seen > 20


def test_e8_a_what_if_whose_timing_group_holds_11_reads_its_last_11(shared_client: TestClient) -> None:
    """From the recorded what-ifs: 0.001 BTC sent at 2024-07-11 12:00 has 11 earlier transactions for the timing group."""
    body = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if",
                              json={"amountBtc": 0.001, "direction": "out", "time": "2024-07-11T12:00:00Z"}).json()
    timing = next(c for c in body["comparison"] if c["features"] == ["F2", "F3"])
    assert (timing["txCount"], timing["description"]) == (11, "its last 11 transactions")
    for size in (c for c in body["comparison"] if c["features"] == ["F1", "F4"]):  # none when no earlier transaction was sent
        assert size["description"] == f"its last {size['txCount']} sent"
    assert all("extended back to reach" not in c["description"] for c in body["comparison"])
