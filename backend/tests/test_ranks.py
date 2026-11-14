"""S-02: `ranks` on E7 and E8 equal a direct computation from `Predictor.score_address`; E7 stays under its body budget."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from explorer.predict import Predictor
from fastapi.testclient import TestClient

from app.services.ranks import rank_among

from .conftest import LARGEST, RUNNING_EXAMPLE

# The running example, the largest address (700 transactions) and a third, middling one.
THIRD = "3HTmUj5wFDQZ2TF8SAcngV7EQ88rptx35D"
THREE = [RUNNING_EXAMPLE, LARGEST, THIRD]
BUDGET = 6_000


def direct(result: dict[str, Any], tx: dict[str, Any], method: str) -> float | None:
    """The share of the address's scored transactions whose score is at or below this one's, from A2's own answer."""
    score = tx["scores"][method]
    if score is None:
        return None
    pool = [t["scores"][method] for t in result["transactions"] if t["scored"] and t["scores"][method] is not None]
    return sum(1 for v in pool if v <= score) / len(pool) if pool else None


@pytest.mark.parametrize("address", THREE)
def test_e7_ranks_equal_a_direct_computation_from_score_address(shared_client: TestClient, reference: Callable[[str], dict[str, Any]],
                                                                address: str) -> None:
    result = reference(address)
    scored = [t for t in result["transactions"] if t["scored"]]
    step = max(1, len(scored) // 60)  # every transaction of a small address, a spread of 60 of the largest
    chosen = scored[::step] + [t for t in scored if t["flagged"]][:20]
    for tx in chosen:
        body = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": address}).json()
        assert list(body["ranks"]) == list(body["scores"])
        for method, rank in body["ranks"].items():
            assert rank == direct(result, tx, method), (tx["txid"], method)
            if rank is not None:
                assert 0 < rank <= 1  # the transaction itself is at or below its own score


def test_e7_the_largest_address_has_a_body_under_the_budget_and_a_rank_for_every_method(shared_client: TestClient) -> None:
    rows = shared_client.get(f"/api/addresses/{LARGEST}/transactions", params={"pageSize": 200, "sort": "-score"}).json()
    for row in rows["transactions"][:20]:
        response = shared_client.get(f"/api/transactions/{row['txid']}", params={"address": LARGEST})
        assert len(response.content) < BUDGET, len(response.content)
        assert len(response.json()["ranks"]) == 9


def test_the_highest_score_of_an_address_ranks_one_for_the_method_that_scored_it(shared_client: TestClient,
                                                                                  reference: Callable[[str], dict[str, Any]]) -> None:
    scored = [t for t in reference(LARGEST)["transactions"] if t["scored"]]
    top = max(scored, key=lambda t: t["scores"]["baseline"])
    assert shared_client.get(f"/api/transactions/{top['txid']}", params={"address": LARGEST}).json()["ranks"]["baseline"] == 1.0


def test_e7_ranks_do_not_depend_on_the_deciding_method(shared_client: TestClient, reference: Callable[[str], dict[str, Any]]) -> None:
    tx = next(t for t in reference(RUNNING_EXAMPLE)["transactions"] if t["scored"])
    base = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": RUNNING_EXAMPLE}).json()["ranks"]
    other = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": RUNNING_EXAMPLE, "method": "fusion"}).json()["ranks"]
    assert base == other


@pytest.mark.parametrize("address", THREE)
@pytest.mark.parametrize("direction", ["in", "out"])
def test_e8_ranks_are_against_the_scored_history_before_the_time(shared_client: TestClient, predictor: Predictor,
                                                                 reference: Callable[[str], dict[str, Any]], address: str,
                                                                 direction: str) -> None:
    result = reference(address)
    body = {"amountBtc": 0.7, "direction": direction, "time": "2026-10-23T00:00:00Z"}
    response = shared_client.post(f"/api/addresses/{address}/what-if", json=body)
    assert response.status_code == 200
    answer = response.json()
    history = [t for t in result["transactions"] if t["scored"] and t["time"] < body["time"]]
    assert list(answer["ranks"]) == list(predictor.methods)
    for method, rank in answer["ranks"].items():
        if method in answer["notAvailable"]:
            assert rank is None
            continue
        pool = [t["scores"][method] for t in history if t["scores"][method] is not None]
        assert rank == (sum(1 for v in pool if v <= answer["scores"][method]) / len(pool) if pool else None), method


def test_e8_an_earlier_time_ranks_against_less_history(shared_client: TestClient, reference: Callable[[str], dict[str, Any]]) -> None:
    result = reference(LARGEST)
    middle = [t for t in result["transactions"] if t["scored"]][300]["time"]
    answer = shared_client.post(f"/api/addresses/{LARGEST}/what-if", json={"amountBtc": 0.5, "direction": "out", "time": middle}).json()
    pool = [t["scores"]["baseline"] for t in result["transactions"] if t["scored"] and t["time"] < middle]
    assert answer["ranks"]["baseline"] == sum(1 for v in pool if v <= answer["scores"]["baseline"]) / len(pool)


def test_rank_among_handles_gaps_and_ties() -> None:
    assert rank_among([1.0, 2.0, 2.0, None, float("nan")], 2.0) == 1.0
    assert rank_among([1.0, 2.0, 3.0, 4.0], 2.5) == 0.5
    assert rank_among([1.0], None) is None and rank_among([], 1.0) is None and rank_among([None], 1.0) is None
