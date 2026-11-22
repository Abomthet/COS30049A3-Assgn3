"""T13, plan sections 7.5 (Mod-3, Mod-4, Mod-7) and 12.3: E3 to E7 return what `Predictor` returns, for all 28 addresses.

The oracle is Assignment 2's own `score_address` and the saved tables, called directly. The pieces the API serves
(timeline, rows, one transaction) must rebuild the whole result: same counts, flags, scores and reasons.
"""
from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

import pandas as pd
import pytest
from explorer.explain import reasons_for
from explorer.predict import InsufficientHistory, Predictor
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.services.explorer_service import ExplorerService
from app.core.method_names import SHORT_NAMES
from app.services.reasons import reword, reword_comparison, reword_limitation, web_explanation, web_reasons
from app.services.store import SnapshotStore

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY

METHODS = ("baseline", "isolation_forest", "lof", "kmeans", "dbscan", "regression", "regression_interval", "fusion",
           "txgpt_method")
ONE_PAGE = 200
Reference = Callable[[str], dict[str, Any]]
SNAPSHOT = sorted(pd.read_csv(Path(__file__).resolve().parents[1] / "data/processed/esplora/features.csv", usecols=["address"])["address"].unique())
SCORED = [a for a in SNAPSHOT if a not in SHORT_HISTORY]
# The grid over all 25 scored addresses is slow; a quick run (-m "not slow") keeps the running example.
QUICK = (RUNNING_EXAMPLE,)
per_scored_address = pytest.mark.parametrize(
    "address", [pytest.param(a, id=a[:10], marks=() if a in QUICK else pytest.mark.slow) for a in SCORED])


def expected_row(tx: dict[str, Any]) -> dict[str, Any]:
    """The list row Assignment 2's detail implies (plan section 6.4), with its reason worded as Mod-12 words it."""
    scored = tx["scored"]
    reasons = reasons_for(tx["features"])[0] if scored else []
    return {"txid": tx["txid"], "time": tx["time"], "direction": tx["direction"], "netSats": tx["netSats"],
            "status": "not-scored" if not scored else "flagged" if tx["flagged"] else "not-flagged",
            "score": tx["score"] if scored else None, "mainReason": reword(reasons[0]["headline"], tx["direction"]) if reasons else None,
            "mainZ": reasons[0]["z"] if reasons else None, "flaggedBy": sum(tx["flags"].values()) if scored else 0}


def expected_ranks(tx: dict[str, Any], transactions: list[dict[str, Any]]) -> dict[str, float | None]:
    """S-02, worked out the long way: per method, the share of the address's scored transactions at or below this score."""
    ranks: dict[str, float | None] = {}
    for method, score in tx["scores"].items():
        pool = [t["scores"][method] for t in transactions if t["scored"] and t["scores"][method] is not None]
        ranks[method] = None if score is None or not pool else sum(1 for v in pool if v <= score) / len(pool)
    return ranks


def expected_detail(tx: dict[str, Any], transactions: list[dict[str, Any]]) -> dict[str, Any]:
    """Assignment 2's detail as E7 serves it: the same, with the source and the ranks added, the method named shortly (Mod-21),
    `reasons` and the shorter `explanation` built from A2's reasons (Mod-20), the comparison groups worded as Mod-18 and Mod-20 word
    them and the limitation line as Mod-19 words it."""
    return {**tx, "method": {**tx["method"], "name": SHORT_NAMES[tx["method"]["id"]]}, "reasons": web_reasons(tx),
            "explanation": web_explanation(tx), "limitation": reword_limitation(tx["limitation"]),
            "comparison": reword_comparison(tx["comparison"], tx["direction"]), "source": "snapshot", "ranks": expected_ranks(tx, transactions)}


def all_rows(client: TestClient, address: str, **params: Any) -> list[dict[str, Any]]:
    """Every row of E6, following the pages."""
    rows: list[dict[str, Any]] = []
    page = 1
    while True:
        body = client.get(f"/api/addresses/{address}/transactions", params={**params, "page": page, "pageSize": ONE_PAGE}).json()
        rows += body["transactions"]
        if len(rows) >= body["total"]:
            assert len(rows) == body["total"]
            return rows
        page += 1


@per_scored_address
def test_the_timeline_is_the_scored_result_without_its_transactions(shared_client: TestClient, address: str, reference: Reference) -> None:
    whole = reference(address)
    response = shared_client.get(f"/api/addresses/{address}/timeline")
    assert response.status_code == 200
    # A snapshot address has no `live` block (null); everything else is A2's result.
    expected = {**{key: value for key, value in whole.items() if key != "transactions"}, "live": None}
    method = expected["snapshot"]["method"]
    expected["snapshot"] = {**expected["snapshot"], "method": {**method, "name": SHORT_NAMES[method["id"]]}}  # Mod-21
    assert response.json() == expected


@per_scored_address
def test_the_rows_are_the_scored_transactions(shared_client: TestClient, address: str, reference: Reference) -> None:
    whole = reference(address)
    rows = all_rows(shared_client, address)
    assert rows == [expected_row(tx) for tx in whole["transactions"]]
    assert sum(r["status"] == "flagged" for r in rows) == whole["totals"]["flaggedCount"]
    assert sum(r["status"] != "not-scored" for r in rows) == whole["totals"]["scoredCount"]


@per_scored_address
def test_the_rows_of_a_day_are_that_days_counts(shared_client: TestClient, address: str, reference: Reference) -> None:
    whole = reference(address)
    busiest = max(whole["days"], key=lambda d: d["txCount"])
    for day in [busiest] + [d for d in whole["days"] if d["flaggedCount"]]:
        body = shared_client.get(f"/api/addresses/{address}/transactions", params={"date": day["date"], "pageSize": ONE_PAGE}).json()
        assert body["total"] == day["txCount"] and body["date"] == day["date"]
        assert sum(r["status"] == "flagged" for r in body["transactions"]) == day["flaggedCount"]


@per_scored_address
def test_every_transaction_detail_is_a_prediction_detail(predictor: Predictor, settings: Settings, address: str,
                                                         reference: Reference) -> None:
    """Every transaction of the 25 scored addresses, through the service the endpoint calls."""
    whole = reference(address)
    service = ExplorerService(SnapshotStore(predictor), predictor, settings.web.lists)
    for tx in whole["transactions"]:
        if tx["scored"]:
            assert service.detail(address, tx["txid"]).model_dump(by_alias=True) == expected_detail(tx, whole["transactions"])
        else:
            with pytest.raises(InsufficientHistory):
                service.detail(address, tx["txid"])


@per_scored_address
def test_a_sample_of_detail_responses_is_the_prediction_detail(shared_client: TestClient, address: str, reference: Reference) -> None:
    """Over HTTP: every flagged transaction, every unscored one, and every 17th."""
    transactions = reference(address)["transactions"]
    chosen = [tx for i, tx in enumerate(transactions) if tx["flagged"] or not tx["scored"] or i % 17 == 0]
    for tx in chosen:
        response = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": address})
        if tx["scored"]:
            assert response.status_code == 200
            assert response.json() == expected_detail(tx, transactions)
        else:
            assert response.status_code == 422 and response.json()["status"] == "insufficient_history"


@per_scored_address
def test_an_unscored_transaction_answers_422_with_its_facts(shared_client: TestClient, predictor: Predictor, address: str,
                                                            reference: Reference) -> None:
    whole = reference(address)
    unscored = [tx for tx in whole["transactions"] if not tx["scored"]]
    assert unscored, "every scored address has transactions without enough earlier history"
    tx = unscored[-1]
    body = shared_client.get(f"/api/transactions/{tx['txid']}", params={"address": address}).json()
    row = predictor.features[(predictor.features["address"] == address) & (predictor.features["txid"] == tx["txid"])].iloc[0]
    assert body["status"] == "insufficient_history"
    assert body["transaction"] == predictor.core(row)
    assert body["history"] == {"earlierTx": int(row["earlier_count"]), "spanDays": float(row["history_span_days"]),
                               "required": predictor.requirement()}
    assert body["firstScoredDate"] == whole["history"]["firstScoredDate"]


@pytest.mark.parametrize("short", SHORT_HISTORY, ids=[a[:10] for a in SHORT_HISTORY])
def test_a_short_history_address_is_listed_unscored_and_every_transaction_answers_422(shared_client: TestClient,
                                                                                      predictor: Predictor, short: str) -> None:
    rows_of_address = predictor.features[predictor.features["address"] == short].sort_values(["block_time_utc", "txid"])
    with pytest.raises(InsufficientHistory) as raised:
        predictor.score_address(short)
    timeline = shared_client.get(f"/api/addresses/{short}/timeline")
    assert timeline.status_code == 200
    body = timeline.json()
    assert body["history"] == {"status": "insufficient", "txCount": len(rows_of_address),
                               "spanDays": float(rows_of_address["history_span_days"].max()),
                               "required": raised.value.body["history"]["required"], "firstScoredDate": None}
    assert body["totals"] == {"txCount": len(rows_of_address), "scoredCount": 0, "flaggedCount": 0, "flaggedDays": 0}
    assert sum(d["txCount"] for d in body["days"]) == len(rows_of_address)
    assert [d["date"] for d in body["days"]] == sorted(d["date"] for d in body["days"])
    rows = all_rows(shared_client, short)
    assert [r["txid"] for r in rows] == list(rows_of_address["txid"])
    assert {r["status"] for r in rows} == {"not-scored"} and {r["score"] for r in rows} == {None}
    for row in rows_of_address.itertuples():
        response = shared_client.get(f"/api/transactions/{row.txid}", params={"address": short})
        assert response.status_code == 422
        assert response.json()["history"]["earlierTx"] == row.earlier_count
        assert response.json()["transaction"]["txid"] == row.txid


@pytest.mark.parametrize("method", METHODS)
def test_each_methods_flags_equal_scores_csv(shared_client: TestClient, predictor: Predictor, method: str,
                                             addresses: list[str]) -> None:
    """E3 for every address; E5, E6 and E7 for the running example, the largest address and one bc1 address."""
    flags = predictor.scores.groupby("address")[f"flag_{method}"].sum()
    listed = shared_client.get("/api/addresses", params={"method": method}).json()
    assert {a["address"]: a["flaggedCount"] for a in listed["addresses"]} == {a: int(flags[a]) for a in addresses}
    assert listed["snapshot"]["method"]["id"] == method
    for address in (RUNNING_EXAMPLE, LARGEST, "bc1q7evspfauqve6ll84juuj0anlzrxxpdeq7raqn3"):
        table = predictor.scores[predictor.scores["address"] == address].set_index("txid")
        timeline = shared_client.get(f"/api/addresses/{address}/timeline", params={"method": method}).json()
        assert timeline["totals"]["flaggedCount"] == int(flags[address]) == sum(d["flaggedCount"] for d in timeline["days"])
        flagged = all_rows(shared_client, address, method=method, status="flagged")
        assert {r["txid"] for r in flagged} == set(table.index[table[f"flag_{method}"]])
        assert all(r["score"] == pytest.approx(table.at[r["txid"], f"score_{method}"]) for r in flagged)
        for row in flagged[:5]:
            detail = shared_client.get(f"/api/transactions/{row['txid']}", params={"address": address, "method": method}).json()
            assert detail["flagged"] is True and detail["method"]["id"] == method
            assert detail["flags"] == {m: bool(table.at[row["txid"], f"flag_{m}"]) for m in METHODS}
            assert detail["scores"][method] == pytest.approx(table.at[row["txid"], f"score_{method}"])
            assert detail["method"]["name"] == SHORT_NAMES[method]
            assert detail["reasons"] and detail["explanation"].endswith(detail["limitation"]) and "Flagged by" not in detail["explanation"]


@pytest.mark.slow
def test_the_summaries_of_the_list_equal_the_timelines(shared_client: TestClient, addresses: list[str], reference: Reference) -> None:
    listed = {a["address"]: a for a in shared_client.get("/api/addresses").json()["addresses"]}
    assert set(listed) == set(addresses)
    for address in addresses:
        summary = listed[address]
        if address in SHORT_HISTORY:
            assert summary["history"] == "insufficient" and summary["scoredCount"] == summary["flaggedCount"] == 0
            continue
        whole = reference(address)
        assert (summary["txCount"], summary["scoredCount"], summary["flaggedCount"], summary["history"]) == (
            whole["totals"]["txCount"], whole["totals"]["scoredCount"], whole["totals"]["flaggedCount"], "sufficient")
        assert (summary["firstSeen"], summary["lastSeen"]) == (whole["range"]["start"], whole["range"]["end"])
