"""Mod-21: every method name a response carries is the short one, E11 adds `longName`, and A2's long names never leave the service."""
from __future__ import annotations

import re
from typing import Any

import pytest
from explorer.explain import METHOD_NAMES, check_wording
from fastapi.testclient import TestClient

from app.core.method_names import LONG_NAMES, SHORT_NAMES, long_name, short_name
from app.services.reasons import reword

from .conftest import LARGEST, RUNNING_EXAMPLE

FLAGGED_TX = "c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140"
SHORT = {"baseline": "Baseline", "isolation_forest": "Isolation Forest", "lof": "Local outlier", "kmeans": "K-Means",
         "dbscan": "DBSCAN", "regression": "Regression", "regression_interval": "Regression range", "fusion": "Fusion",
         "txgpt_method": "TxGPT"}
LONG = {"baseline": "Robust z baseline", "isolation_forest": "Isolation Forest", "lof": "Local Outlier Factor",
        "kmeans": "K-Means distance", "dbscan": "DBSCAN noise", "regression": "Regression residual",
        "regression_interval": "Regression expected range", "fusion": "Score fusion (Regression + Isolation Forest)",
        "txgpt_method": "TxGPT surprisal"}
# What A2 writes that the screen must not show.
OLD_TEXT = re.compile(r"\(A1\)|flag budget|Robust z baseline \(|Local Outlier Factor|K-Means distance|DBSCAN noise|Regression residual"
                      r"|Regression expected range|Score fusion|TxGPT surprisal")


def test_the_tables_are_the_listed_names_for_exactly_the_methods_of_a2() -> None:
    assert SHORT_NAMES == SHORT and LONG_NAMES == LONG and set(SHORT) == set(METHOD_NAMES)
    assert short_name("lof") == "Local outlier" and long_name("lof") == "Local Outlier Factor"
    assert short_name("unknown", "As given") == "As given" and short_name("unknown") == "unknown"
    for name in (*SHORT.values(), *LONG.values()):
        check_wording(name)


def names_in(body: Any, path: str = "") -> list[tuple[str, str]]:
    """Every `name` next to an `id` that is a method id, wherever it is in a response."""
    found: list[tuple[str, str]] = []
    if isinstance(body, dict):
        if body.get("id") in SHORT and isinstance(body.get("name"), str):
            found.append((body["id"], body["name"]))
        for key, value in body.items():
            found += names_in(value, f"{path}.{key}")
    elif isinstance(body, list):
        for item in body:
            found += names_in(item, path)
    return found


def test_the_fusion_card_line_no_longer_speaks_of_a_flag_budget(shared_client: TestClient) -> None:
    """W90, the one line of it that carries the words (the other eight are left as A2's plan wrote them)."""
    fusion = next(m for m in shared_client.get("/api/methods").json()["methods"] if m["id"] == "fusion")
    assert fusion["description"] == "Regression and Isolation Forest combined."


NOTE_4 = {
    "baseline": "How far it strays from this address's usual size, pace and gap. Nothing is trained.",
    "isolation_forest": "How easy it is to set apart from the others.",
    "lof": "How isolated it is compared with its closest neighbours.",
    "kmeans": "How far it sits from the nearest group of similar transactions.",
    "dbscan": "How far it sits from the nearest dense group.",
    "regression": "How far off a prediction of its size and gap was.",
    "regression_interval": "How far it falls outside the range predicted for it.",
    "fusion": "Regression and Isolation Forest combined.",
    "txgpt_method": "How surprising it is to a language model trained on Bitcoin transactions.",
}


def test_the_nine_card_lines_are_notes_4_plain_lines_with_no_internal_words(shared_client: TestClient) -> None:
    """W90: one plain line for each method, and none of A2's working words."""
    methods = shared_client.get("/api/methods").json()["methods"]
    assert {m["id"]: m["description"] for m in methods} == NOTE_4
    internal = re.compile(r"F1|F4|robust|z-score|flag budget|planted|recall|Assignment 2|\(A1\)", re.IGNORECASE)
    assert not [m["id"] for m in methods if internal.search(m["description"])]


def test_e11_has_the_short_name_and_the_long_name_of_each_method(shared_client: TestClient) -> None:
    methods = shared_client.get("/api/methods").json()["methods"]
    assert {m["id"]: (m["name"], m["longName"]) for m in methods} == {i: (SHORT[i], LONG[i]) for i in SHORT}
    assert all(set(m) >= {"id", "name", "longName", "family", "description", "threshold", "scoresNewInput", "evaluation"} for m in methods)


@pytest.mark.parametrize("method", list(SHORT))
def test_every_name_in_e2_e3_e5_e7_is_short_under_every_method(shared_client: TestClient, method: str) -> None:
    for url, params in ((f"/api/addresses", {}), (f"/api/addresses/{RUNNING_EXAMPLE}/timeline", {}),
                        (f"/api/transactions/{FLAGGED_TX}", {"address": RUNNING_EXAMPLE})):
        response = shared_client.get(url, params={**params, "method": method})
        assert response.status_code == 200, (url, method)
        found = names_in(response.json())
        assert found and all(SHORT[i] == n for i, n in found), found
        assert OLD_TEXT.search(response.text) is None, (url, method)


def test_e2_the_snapshot_method_is_named_shortly(shared_client: TestClient) -> None:
    body = shared_client.get("/api/config").json()
    assert body["snapshot"]["method"]["name"] == "Baseline" and OLD_TEXT.search(str(body)) is None


def test_e6_and_e10_carry_no_long_name_or_a1(shared_client: TestClient) -> None:
    for fmt in ("csv", "json"):
        text = shared_client.get(f"/api/addresses/{LARGEST}/export", params={"format": fmt}).text
        assert OLD_TEXT.search(text) is None
    assert OLD_TEXT.search(shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"pageSize": 200}).text) is None


def test_e8_and_e9_name_every_method_shortly(shared_client: TestClient) -> None:
    body = {"direction": "out", "time": "2026-10-20T12:00:00Z"}
    one = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json={**body, "amountBtc": 0.05})
    many = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if/curve", json={**body, "amountsBtc": [0.001, 0.05]})
    for response in (one, many):
        assert response.status_code == 200
        assert OLD_TEXT.search(response.text) is None
    assert one.json()["method"]["name"] == "Baseline"
    assert {m["id"]: m["name"] for m in many.json()["methods"]} == {i: SHORT[i] for i in SHORT if i != "txgpt_method"}


def test_no_response_of_the_api_contains_a1_or_flag_budget(shared_client: TestClient, addresses: list[str]) -> None:
    texts = [shared_client.get("/api/methods").text, shared_client.get("/api/config").text, shared_client.get("/api/addresses").text]
    for address in addresses[:4]:
        texts.append(shared_client.get(f"/api/addresses/{address}/timeline", params={"method": "fusion"}).text)
        texts.append(shared_client.get(f"/api/addresses/{address}/export", params={"format": "csv", "method": "fusion"}).text)
    assert all("(A1)" not in t and "flag budget" not in t for t in texts)


def test_the_assistants_words_get_the_short_names_after_the_guardrail() -> None:
    text = "Robust z baseline (A1) and Score fusion (two methods, one flag budget) and Local Outlier Factor flag it."
    assert reword(text, "in") == "Baseline and Fusion and Local outlier flag it."
    assert reword("Isolation Forest and TxGPT surprisal", "out") == "Isolation Forest and TxGPT"
