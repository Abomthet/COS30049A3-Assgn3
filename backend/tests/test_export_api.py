"""T15: E10 lists exactly the rows E6 lists, as a CSV that opens cleanly in a spreadsheet or as JSON, and E11 reads the evaluation tables."""
from __future__ import annotations

import csv
import io
import json
import threading
from pathlib import Path
from typing import Any

import pytest
from explorer.predict import Predictor
from fastapi.testclient import TestClient

from app.schemas.exports import ExportRow
from app.services.export_service import csv_cells, csv_header, guard_formula

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY, VALID_OUTSIDE_SNAPSHOT

LIMITATION = "Unusual activity requires investigation; it does not indicate wrongdoing."
TABLES = Path(__file__).resolve().parents[1] / "reports" / "tables"


def export(client: TestClient, address: str = RUNNING_EXAMPLE, **params: Any) -> Any:
    return client.get(f"/api/addresses/{address}/export", params=params)


def parse(response: Any) -> list[dict[str, str]]:
    return list(csv.DictReader(io.StringIO(response.content.decode("utf-8"), newline="")))


def listed(client: TestClient, address: str, **params: Any) -> list[dict[str, Any]]:
    """E6's rows for the same filters, following its pages."""
    rows: list[dict[str, Any]] = []
    page = 1
    while True:
        body = client.get(f"/api/addresses/{address}/transactions", params={**params, "page": page, "pageSize": 200}).json()
        rows += body["transactions"]
        if len(rows) >= body["total"]:
            return rows
        page += 1


# ---------------------------------------------------------------- E10: the CSV


def test_the_csv_is_a_file_named_from_the_address_and_the_snapshot_date(shared_client: TestClient) -> None:
    response = export(shared_client)
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="1Bbcsfxj-2026-10-22.csv"'
    assert response.headers["content-type"] == "text/csv; charset=utf-8" and response.headers["cache-control"] == "no-cache"
    assert response.headers["etag"] and "x-request-id" in response.headers


def test_the_csv_has_a_header_row_then_one_row_per_transaction_in_the_columns_the_plan_lists(shared_client: TestClient) -> None:
    text = export(shared_client).content.decode("utf-8")
    assert text.startswith("address,txid,time_utc,direction,received_btc,sent_btc,net_btc,scored,flagged,deciding_method,score,")
    assert text.splitlines()[0].split(",") == csv_header() and text.endswith("\r\n")
    assert csv_header()[11:23] == ["size_btc", "size_usual_btc", "size_z", "burst_count", "burst_usual_count", "burst_z", "gap_hours",
                                   "gap_usual_hours", "gap_z", "relative_size_ratio", "relative_size_usual_ratio", "relative_size_z"]
    assert csv_header()[-5:] == ["main_reason", "flagged_by", "source_url", "snapshot_date", "limitation"]
    rows = parse(export(shared_client))
    assert len(rows) == 377 and all(len(r) == len(csv_header()) for r in rows)
    assert all(r["address"] == RUNNING_EXAMPLE and r["snapshot_date"] == "2026-10-22" and r["deciding_method"] == "baseline" for r in rows)


def test_the_csv_is_plain_utf_8_with_no_byte_order_mark_and_survives_a_round_trip(shared_client: TestClient) -> None:
    content = export(shared_client).content
    assert not content.startswith(b"\xef\xbb\xbf") and content.decode("utf-8").encode("utf-8") == content
    assert len(parse(export(shared_client))) == len(content.decode().strip().split("\r\n")) - 1


def test_the_csv_rows_are_what_e6_lists_for_the_same_filters(shared_client: TestClient) -> None:
    for params in ({}, {"status": "flagged"}, {"status": ["flagged", "not-scored"], "sort": "-score"}, {"direction": "out", "sort": "-amount"}, {"sort": "-amount"}, {"sort": "amount"},
                   {"from": "2026-09-01", "to": "2026-09-30", "sort": "-time"}, {"date": "2026-10-19"}, {"method": "regression", "status": "flagged"},
                   {"status": "not-scored"}):
        rows = parse(export(shared_client, **params))
        expected = listed(shared_client, RUNNING_EXAMPLE, **params)
        assert [r["txid"] for r in rows] == [r["txid"] for r in expected], params
        assert [r["flagged"] == "true" for r in rows] == [r["status"] == "flagged" for r in expected]


def test_amounts_are_btc_with_eight_decimals_and_a_negative_number_is_not_text(shared_client: TestClient) -> None:
    rows = parse(export(shared_client, direction="out"))
    row = rows[0]
    assert row["received_btc"] == "0.00000000" and row["sent_btc"].count(".") == 1 and len(row["sent_btc"].split(".")[1]) == 8
    assert row["net_btc"] == "-" + row["sent_btc"] and not row["net_btc"].startswith("'")
    assert float(row["net_btc"]) < 0


def test_every_csv_row_carries_the_limitation_line_and_the_flagged_rows_are_complete(shared_client: TestClient) -> None:
    rows = parse(export(shared_client))
    flagged = [r for r in rows if r["flagged"] == "true"]
    assert len(flagged) == 3
    assert {r["limitation"] for r in rows} == {LIMITATION}  # every row, flagged or not (wording rule)
    first = flagged[0]
    assert first["txid"] == "c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140" and first["flagged_by"] == "baseline"
    assert first["main_reason"] == "Smaller amount relative to the usual for this direction" and round(float(first["score"]), 4) == 5.6071
    assert first["source_url"] == "https://blockstream.info/tx/" + first["txid"]
    assert (first["relative_size_ratio"], first["relative_size_usual_ratio"]) == ("0.38102", "1.38565")


def test_the_methods_that_flag_a_row_are_listed(shared_client: TestClient) -> None:
    rows = parse(export(shared_client, status="flagged", sort="-time", method="fusion"))
    expected = listed(shared_client, RUNNING_EXAMPLE, status="flagged", sort="-time", method="fusion")
    assert [len(r["flagged_by"].split(";")) for r in rows] == [e["flaggedBy"] for e in expected]
    assert all(r["deciding_method"] == "fusion" for r in rows)


def test_an_address_with_too_little_history_exports_its_transactions_unscored(shared_client: TestClient) -> None:
    for address in SHORT_HISTORY:
        rows = parse(export(shared_client, address))
        assert rows and all(r["scored"] == "false" and r["flagged"] == "false" and r["score"] == "" and r["limitation"] == LIMITATION for r in rows)
        assert all(r["size_btc"] == "" and r["main_reason"] == "" and r["source_url"] for r in rows)


def test_the_largest_address_exports_all_700_rows(shared_client: TestClient) -> None:
    assert len(parse(export(shared_client, LARGEST))) == 700 == len(export(shared_client, LARGEST, format="json").json()["transactions"])


# ---------------------------------------------------------------- E10: formulas


@pytest.mark.parametrize("start", ["=", "+", "-", "@", "\t", "\r"])
def test_a_text_cell_that_starts_like_a_formula_gets_a_leading_apostrophe(start: str) -> None:
    assert guard_formula(f"{start}HYPERLINK(\"http://x\")") == f"'{start}HYPERLINK(\"http://x\")"


@pytest.mark.parametrize("text", ["", "Larger amount than usual", "1Bbcsfxj", "a=b", "x-y", "'=already"])
def test_other_text_is_left_alone(text: str) -> None:
    assert guard_formula(text) == text


def test_every_text_cell_of_a_row_is_guarded_and_no_number_is() -> None:
    evil = "=cmd|' /C calc'!A0"
    row = ExportRow.model_validate({
        "address": evil, "txid": "+1", "time": "-2", "direction": "out", "receivedSats": 0, "sentSats": 100, "netSats": -100, "scored": True,
        "flagged": True, "method": "baseline", "score": -1.5, "features": [{"id": "F1", "name": "Size", "value": -1.0, "usual": 1.0, "z": -2.5}],
        "mainReason": "@SUM(A1)", "flaggedBy": ["baseline"], "sourceUrl": "=1+1", "snapshotDate": "2026-10-22", "limitation": "-x"})
    cells = dict(zip(csv_header(), csv_cells(row, "-x")))
    for name in ("address", "txid", "time_utc", "main_reason", "source_url", "limitation"):
        assert cells[name].startswith("'"), name
    assert cells["net_btc"] == "-0.00000100" and cells["score"] == "-1.5" and cells["size_z"] == "-2.5" and cells["size_btc"] == "-1"
    assert cells["scored"] == "true" and not cells["scored"].startswith("'")


# ---------------------------------------------------------------- E10: JSON and the rest


def test_the_json_file_has_the_same_rows_and_states_the_limitation_line_once(shared_client: TestClient) -> None:
    response = export(shared_client, format="json", status="flagged")
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="1Bbcsfxj-2026-10-22.json"'
    assert response.headers["content-type"] == "application/json"
    body = response.json()
    assert body["address"] == RUNNING_EXAMPLE and body["snapshotDate"] == "2026-10-22" and body["method"] == "baseline"
    assert body["limitation"] == LIMITATION and body["count"] == 3 == len(body["transactions"])
    csv_rows = parse(export(shared_client, status="flagged"))
    assert [t["txid"] for t in body["transactions"]] == [r["txid"] for r in csv_rows]
    first = body["transactions"][0]
    assert first["flagged"] is True and first["limitation"] == LIMITATION and first["netSats"] == 111260 and first["flaggedBy"] == ["baseline"]
    assert [f["id"] for f in first["features"]] == ["F1", "F2", "F3", "F4"]
    unflagged = export(shared_client, format="json", status="not-flagged").json()
    assert all(t["limitation"] is None for t in unflagged["transactions"])


def test_a_filter_that_matches_nothing_is_a_file_with_only_the_header(shared_client: TestClient) -> None:
    assert export(shared_client, date="2020-01-01").content.decode().count("\r\n") == 1
    assert export(shared_client, format="json", date="2020-01-01").json()["count"] == 0


def test_e10_rejects_bad_queries_with_the_field_named(shared_client: TestClient) -> None:
    assert export(shared_client, format="xml").json()["fields"] == [{"name": "format", "message": 'Must be "csv" or "json".'}]
    assert export(shared_client, status="done").status_code == 400
    assert export(shared_client, **{"from": "2026-02-30"}).json()["fields"] == [{"name": "from", "message": "Use a day such as 2026-10-20."}]
    both = export(shared_client, date="2026-10-19", **{"from": "2026-10-01"})
    assert both.status_code == 400 and both.json()["message"] == "Use either one date or a range of days, not both."
    assert export(shared_client, sort="size").status_code == 400
    assert export(shared_client, method="magic").status_code == 400
    assert export(shared_client, colour="red").json()["fields"] == [{"name": "colour", "message": "Not a known field."}]
    assert export(shared_client, "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy").status_code == 400


def test_e10_unknown_address_is_404(shared_client: TestClient) -> None:
    response = export(shared_client, VALID_OUTSIDE_SNAPSHOT)
    assert response.status_code == 404 and response.json()["status"] == "unsupported"


def test_e10_answers_304_to_a_matching_etag(shared_client: TestClient) -> None:
    first = export(shared_client)
    again = shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/export", headers={"If-None-Match": first.headers["etag"]})
    assert again.status_code == 304 and again.content == b""


def test_e10_and_e11_are_503_while_loading(make_client: Any, predictor: Predictor) -> None:
    release = threading.Event()

    def slow() -> Predictor:
        release.wait(10)
        return predictor

    client = make_client(slow)
    assert export(client).status_code == 503 and client.get("/api/methods").status_code == 503
    release.set()


# ---------------------------------------------------------------- E11


def read(name: str) -> dict[str, dict[str, str]]:
    with (TABLES / name).open(encoding="utf-8", newline="") as file:
        return {r["method"]: r for r in csv.DictReader(file)}


def test_e11_lists_the_nine_methods_with_thresholds_from_the_loaded_models(shared_client: TestClient, predictor: Predictor) -> None:
    response = shared_client.get("/api/methods")
    assert response.status_code == 200 and response.headers["etag"]
    body = response.json()
    assert body["defaultMethod"] == "baseline" and [m["id"] for m in body["methods"]] == list(predictor.methods) and len(body["methods"]) == 9
    for method in body["methods"]:
        assert method["threshold"] == float(predictor.methods[method["id"]].threshold)
        assert method["scoresNewInput"] is (method["id"] != "txgpt_method")
        assert method["description"].endswith(".") and method["name"]
    assert {m["family"] for m in body["methods"]} == {"statistics", "outlier detection", "clustering", "regression", "combination", "language model"}
    assert [m["threshold"] for m in body["methods"]][:2] == [5.0, pytest.approx(0.589, abs=1e-3)]


def test_e11_evaluation_numbers_are_the_tables_numbers(shared_client: TestClient) -> None:
    significance, selection = read("eval_significance.csv"), read("eval_selection.csv")
    for method in shared_client.get("/api/methods").json()["methods"]:
        row, chosen, evaluation = significance[method["id"]], selection[method["id"]], method["evaluation"]
        assert evaluation["meanRecall"] == {"value": float(row["mean_recall"]), "ciLow": float(row["mean_recall_ci_low"]),
                                            "ciHigh": float(row["mean_recall_ci_high"])}
        for ours, theirs in (("spike", "recall_spike"), ("burst", "recall_burst_tx"), ("dormant", "recall_dormant")):
            assert evaluation["recallByPattern"][ours] == {"value": float(row[theirs]), "ciLow": float(row[f"{theirs}_ci_low"]),
                                                           "ciHigh": float(row[f"{theirs}_ci_high"])}
        assert evaluation["flagRate"] == float(chosen["flag_rate"])
        assert 0 <= evaluation["meanRecall"]["ciLow"] <= evaluation["meanRecall"]["value"] <= evaluation["meanRecall"]["ciHigh"] <= 1


def test_e11_answers_304_to_a_matching_etag(shared_client: TestClient) -> None:
    first = shared_client.get("/api/methods")
    assert shared_client.get("/api/methods", headers={"If-None-Match": first.headers["etag"]}).status_code == 304


def test_e11_text_has_no_banned_word(shared_client: TestClient) -> None:
    banned = json.loads((Path(__file__).resolve().parents[1] / "config" / "settings.json").read_text(encoding="utf-8"))["bannedWords"]
    text = shared_client.get("/api/methods").text.lower()
    assert [w for w in banned if w in text] == []


def test_every_csv_row_carries_the_limitation_line_even_with_no_flag(shared_client: TestClient) -> None:
    """The wording rule: every export states the limitation, also a filtered CSV with no flagged row."""
    response = shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/export", params={"format": "csv", "status": "not-flagged"})
    assert response.status_code == 200
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows and not any(row["flagged"] == "true" for row in rows)
    assert {row["limitation"] for row in rows} == {LIMITATION}
