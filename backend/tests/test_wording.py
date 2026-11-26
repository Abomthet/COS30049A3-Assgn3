"""T13, plan sections 12.3 and 11.2 (A1 NFR-01): no banned word in any response of E1 to E7, and every flag carries the limitation line.

The words come from settings.json -> bannedWords, read here directly rather than through the application's own check, so
that the test does not trust the code it tests. The match is a case-insensitive substring over the whole body, which
is stricter than the application's own word-start check.
"""
from __future__ import annotations

import json
import re
from collections.abc import Iterator
from pathlib import Path

import pytest
from explorer.predict import Predictor
from fastapi.testclient import TestClient

from app.core.config import Settings

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY, VALID_OUTSIDE_SNAPSHOT

LIMITATION = "Flagged as unusual for this address, not proof of wrongdoing."  # Mod-19, shared/wording.json
SETTINGS = json.loads((Path(__file__).resolve().parents[1] / "config" / "settings.json").read_text(encoding="utf-8"))
BANNED = re.compile("|".join(map(re.escape, SETTINGS["bannedWords"])), re.IGNORECASE)
ONE_PAGE = 200


def bodies_of(client: TestClient, address: str) -> Iterator[tuple[str, str]]:
    """(request, response text) for E4, E5 and E6 of one address, and for E7 of every flagged, every unscored and every tenth transaction."""
    yield f"timeline of {address}", client.get(f"/api/addresses/{address}/timeline").text
    yield f"lookup {address}", client.post("/api/lookup", json={"address": address}).text
    page, rows = 1, []
    while True:
        response = client.get(f"/api/addresses/{address}/transactions", params={"page": page, "pageSize": ONE_PAGE})
        yield f"rows page {page} of {address}", response.text
        rows += response.json()["transactions"]
        if len(rows) >= response.json()["total"]:
            break
        page += 1
    for i, row in enumerate(rows):
        if row["status"] != "not-flagged" or i % 10 == 0:
            yield f"detail {row['txid']}", client.get(f"/api/transactions/{row['txid']}", params={"address": address}).text


@pytest.mark.slow
def test_no_response_of_e1_to_e7_over_all_28_addresses_has_a_banned_word(shared_client: TestClient, addresses: list[str]) -> None:
    texts: list[tuple[str, str]] = [("health", shared_client.get("/api/health").text), ("config", shared_client.get("/api/config").text),
                                    ("list", shared_client.get("/api/addresses").text)]
    for address in addresses:
        texts += list(bodies_of(shared_client, address))
    texts += [("unsupported lookup", shared_client.post("/api/lookup", json={"address": VALID_OUTSIDE_SNAPSHOT}).text),
              ("unsupported timeline", shared_client.get(f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}/timeline").text),
              ("bad address", shared_client.post("/api/lookup", json={"address": "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy"}).text),
              ("bad query", shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions?status=x&from=2026-02-30").text),
              ("unknown transaction", shared_client.get(f"/api/transactions/{'0' * 64}", params={"address": RUNNING_EXAMPLE}).text)]
    assert len(texts) > 1000
    found = [(request, match.group(0)) for request, text in texts if (match := BANNED.search(text))]
    assert found == []


def test_the_three_short_history_addresses_use_the_plans_422_wording(shared_client: TestClient) -> None:
    for address in SHORT_HISTORY:
        txid = shared_client.get(f"/api/addresses/{address}/transactions").json()["transactions"][0]["txid"]
        body = shared_client.get(f"/api/transactions/{txid}", params={"address": address}).json()
        assert body["status"] == "insufficient_history"
        assert body["message"] == "Too little earlier history to score this transaction."
        assert BANNED.search(json.dumps(body)) is None


@pytest.mark.slow
def test_every_flagged_transaction_carries_the_limitation_line(shared_client: TestClient, addresses: list[str], settings: Settings,
                                                               predictor: Predictor) -> None:
    line = LIMITATION
    assert settings.limitation_line == line
    flagged = 0
    for address in addresses:
        rows = shared_client.get(f"/api/addresses/{address}/transactions", params={"status": "flagged", "pageSize": ONE_PAGE}).json()
        total = rows["total"]
        assert len(rows["transactions"]) == min(total, ONE_PAGE) and total <= ONE_PAGE
        for row in rows["transactions"]:
            detail = shared_client.get(f"/api/transactions/{row['txid']}", params={"address": address}).json()
            assert detail["flagged"] is True
            assert detail["limitation"] == line
            assert detail["explanation"].endswith(line)
            flagged += 1
    assert flagged == predictor.scores["flag_baseline"].sum()


@pytest.mark.parametrize("method", ["isolation_forest", "lof", "kmeans", "dbscan", "regression", "regression_interval", "fusion",
                                    "txgpt_method"])
def test_a_flag_of_any_method_carries_the_limitation_line(shared_client: TestClient, method: str) -> None:
    rows = shared_client.get(f"/api/addresses/{LARGEST}/transactions", params={"status": "flagged", "method": method}).json()
    assert rows["transactions"], f"{method} flags something at the largest address"
    for row in rows["transactions"]:
        detail = shared_client.get(f"/api/transactions/{row['txid']}", params={"address": LARGEST, "method": method}).json()
        assert detail["explanation"].endswith(LIMITATION)


@pytest.mark.slow
def test_no_response_of_e8_to_e11_has_a_banned_word_and_every_flagged_what_if_carries_the_limitation_line(
        shared_client: TestClient, addresses: list[str]) -> None:
    """A grid of what-ifs over all 28 addresses (E8 and E9, both directions, a tiny and a huge amount; the short-history
    addresses answer 422), every export of every address in both formats, E11, and the error bodies of E8 to E10."""
    texts: list[tuple[str, str]] = [("methods", shared_client.get("/api/methods").text)]
    line, flagged = LIMITATION, 0
    for address in addresses:
        for direction in ("in", "out"):
            body = {"direction": direction, "time": "2026-10-23T00:00:00Z"}
            curve = shared_client.post(f"/api/addresses/{address}/what-if/curve", json={**body, "amountsBtc": [0.0001, 1, 50]})
            texts.append((f"curve {direction} {address}", curve.text))
            single = shared_client.post(f"/api/addresses/{address}/what-if", json={**body, "amountBtc": 50})
            texts.append((f"what-if {direction} {address}", single.text))
            assert curve.status_code == single.status_code == (422 if address in SHORT_HISTORY else 200)
            if single.status_code == 200:
                result = single.json()
                assert result["limitation"] == line
                if result["flagged"]:
                    flagged += 1
                    assert result["explanation"].endswith(line)
        for suffix in ("csv", "json"):
            texts.append((f"export {suffix} {address}", shared_client.get(f"/api/addresses/{address}/export", params={"format": suffix}).text))
    texts += [("what-if 400", shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json={"amountBtc": 0, "direction": "x", "time": "y"}).text),
              ("what-if too far", shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json={"amountBtc": 1, "direction": "in", "time": "2060-01-01T00:00:00Z"}).text),
              ("what-if 422", shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json={"amountBtc": 1, "direction": "in", "time": "2024-05-20T00:00:00Z"}).text),
              ("what-if 404", shared_client.post(f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}/what-if", json={"amountBtc": 1, "direction": "in", "time": "2026-10-23T00:00:00Z"}).text),
              ("curve default", shared_client.post(f"/api/addresses/{LARGEST}/what-if/curve", json={"direction": "out", "time": "2026-10-23T00:00:00Z"}).text),
              ("curve 400", shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if/curve", json={"direction": "out", "time": "2026-10-23T00:00:00Z", "minBtc": 2, "maxBtc": 1, "points": 99}).text),
              ("export 400", shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/export?format=xml&from=2026-02-30").text)]
    assert flagged > 10
    found = [(request, match.group(0)) for request, text in texts if (match := BANNED.search(text))]
    assert found == []
