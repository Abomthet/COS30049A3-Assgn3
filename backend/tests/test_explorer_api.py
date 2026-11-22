"""T11, T12: E3 to E7: each success, each filter, sort and page, and every status in their rows of plan section 6.2."""
from __future__ import annotations

import json
import threading
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from explorer.predict import Predictor
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import NUMBER_WORDS

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY, VALID_OUTSIDE_SNAPSHOT

VECTORS = json.loads((Path(__file__).resolve().parents[2] / "shared" / "address_vectors.json").read_text(encoding="utf-8"))
ADDRESS_VECTORS = VECTORS["addresses"]
FLAGGED_TX = "c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140"  # the plan's E7 example
EXAMPLES = ["36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L", "3HTmUj5wFDQZ2TF8SAcngV7EQ88rptx35D", "35ZCxf5uyfc2VN194t8WRzz6RCEN6tQfmY"]


def rows(client: TestClient, address: str = RUNNING_EXAMPLE, **params: Any) -> dict[str, Any]:
    response = client.get(f"/api/addresses/{address}/transactions", params=params)
    assert response.status_code == 200, response.text
    return response.json()  # type: ignore[no-any-return]


def every_row(client: TestClient, address: str, **params: Any) -> list[dict[str, Any]]:
    """All rows of E6 in the order asked for, following the pages of 200."""
    found: list[dict[str, Any]] = []
    page = 1
    while True:
        body = rows(client, address, page=page, pageSize=200, **params)
        found += body["transactions"]
        if len(found) >= body["total"]:
            return found
        page += 1


def assert_invalid(response: Any, *names: str) -> dict[str, Any]:
    """A 400 in the one error body, naming exactly these fields."""
    body = response.json()
    assert response.status_code == 400, body
    assert body["status"] == "invalid" and body["requestId"] == response.headers["x-request-id"]
    assert [f["name"] for f in body.get("fields", [])] == list(names)
    return body  # type: ignore[no-any-return]


# ---------------------------------------------------------------- E3


def test_e3_lists_the_addresses_with_enough_history_first_and_busiest_first(client: TestClient) -> None:
    body = client.get("/api/addresses").json()
    listed = body["addresses"]
    assert body["snapshot"]["addressCount"] == len(listed) == 28 and body["snapshot"]["method"]["id"] == "baseline"
    assert [a["address"] for a in listed[:3]] == EXAMPLES
    scored = [a for a in listed if a["history"] == "sufficient"]
    assert len(scored) == 25 and listed[:25] == scored
    assert [a["txCount"] for a in scored] == sorted((a["txCount"] for a in scored), reverse=True)
    assert {a["address"] for a in listed[25:]} == set(SHORT_HISTORY)
    assert {a["source"] for a in listed} == {"snapshot"}
    assert {a["kind"] for a in listed} == {"p2pkh", "p2sh", "p2wpkh", "p2wsh", "p2tr"}
    running = next(a for a in listed if a["address"] == RUNNING_EXAMPLE)
    assert running == {"address": RUNNING_EXAMPLE, "firstSeen": "2024-05-16T05:16:19Z", "lastSeen": "2026-10-19T14:10:25Z", "txCount": 377,
                       "scoredCount": 367, "flaggedCount": 3, "history": "sufficient", "kind": "p2pkh", "source": "snapshot"}


def test_e3_method_changes_the_flag_counts_and_names_the_method(client: TestClient) -> None:
    body = client.get("/api/addresses", params={"method": "fusion"}).json()
    assert body["snapshot"]["method"]["id"] == "fusion"
    assert next(a for a in body["addresses"] if a["address"] == RUNNING_EXAMPLE)["flaggedCount"] != 3


def test_e3_rejects_an_unknown_method_with_the_parameter_named(client: TestClient) -> None:
    body = assert_invalid(client.get("/api/addresses", params={"method": "magic"}), "method")
    assert body["fields"][0]["message"].startswith("Must be ")


# ---------------------------------------------------------------- E4


def test_e4_supported_address_answers_the_plans_body(client: TestClient) -> None:
    response = client.post("/api/lookup", json={"address": RUNNING_EXAMPLE})
    assert response.status_code == 200
    assert response.json() == {"status": "supported", "address": RUNNING_EXAMPLE, "summary": {
        "address": RUNNING_EXAMPLE, "firstSeen": "2024-05-16T05:16:19Z", "lastSeen": "2026-10-19T14:10:25Z", "txCount": 377,
        "scoredCount": 367, "flaggedCount": 3, "history": "sufficient", "kind": "p2pkh", "source": "snapshot"}}


def test_e4_a_short_history_address_is_supported_with_its_history_marked(client: TestClient) -> None:
    body = client.post("/api/lookup", json={"address": SHORT_HISTORY[0]}).json()
    assert body["status"] == "supported" and body["summary"]["history"] == "insufficient"


def test_e4_spaces_around_the_address_are_ignored(client: TestClient) -> None:
    assert client.post("/api/lookup", json={"address": f"  {RUNNING_EXAMPLE} "}).json()["address"] == RUNNING_EXAMPLE


def test_e4_one_changed_character_answers_the_plans_400(client: TestClient) -> None:
    response = client.post("/api/lookup", json={"address": "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy"})
    body = assert_invalid(response, "address")
    assert body["message"] == "Check the address for a typo."
    assert body["hint"] == "Check the value and try again."  # the API's general line; no "start with 1, 3 or bc1" under it any more
    assert body["fields"] == [{"name": "address", "message": "Checksum does not match."}]


def test_e4_a_valid_address_outside_the_snapshot_answers_the_plans_404_with_three_examples(client: TestClient) -> None:
    response = client.post("/api/lookup", json={"address": VALID_OUTSIDE_SNAPSHOT})
    body = response.json()
    assert response.status_code == 404
    assert {k: v for k, v in body.items() if k != "requestId"} == {
        "status": "unsupported", "message": "This address is not one of the 28 in the snapshot.",
        "examples": EXAMPLES, "canLookupLive": False}


@pytest.mark.parametrize("vector", ADDRESS_VECTORS, ids=[v["id"] for v in ADDRESS_VECTORS])
def test_e4_every_shared_vector_gets_its_status_and_never_a_500(client: TestClient, vector: dict[str, Any]) -> None:
    response = client.post("/api/lookup", json={"address": vector["input"]})
    if vector["ok"]:
        assert response.status_code in (200, 404)
    else:
        assert response.status_code == 400
        assert response.json()["message"] == vector["message"]
        assert response.json()["fields"] == [{"name": "address", "message": vector["fieldMessage"]}]


@pytest.mark.parametrize("body", [{"address": 123}, {"address": None}, {}, {"address": RUNNING_EXAMPLE, "extra": 1}, [], "text"],
                         ids=["number", "null", "missing", "unknown-field", "list", "string"])
def test_e4_a_wrong_body_is_a_400_never_a_422_or_500(client: TestClient, body: Any) -> None:
    response = client.post("/api/lookup", json=body)
    assert response.status_code == 400 and response.json()["status"] == "invalid"


def test_e4_the_body_must_be_json(client: TestClient) -> None:
    response = client.post("/api/lookup", content="address=1", headers={"content-type": "text/plain"})
    assert response.status_code == 415 and response.json()["status"] == "invalid"
    broken = client.post("/api/lookup", content="{", headers={"content-type": "application/json"})
    assert broken.status_code == 400 and broken.json()["message"] == "The request body is not valid JSON."


def test_e4_an_address_over_the_configured_length_is_refused(client: TestClient, settings: Settings) -> None:
    limit = settings.web.limits.max_address_chars
    body = assert_invalid(client.post("/api/lookup", json={"address": "1" * (limit + 1)}), "address")
    assert str(limit) in body["message"]


# ---------------------------------------------------------------- E5


def test_e5_the_running_example_matches_the_plans_totals(client: TestClient) -> None:
    body = client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").json()
    assert body["range"] == {"start": "2024-05-16T05:16:19Z", "end": "2026-10-19T14:10:25Z"}
    assert len(body["days"]) == 214 and body["days"][:2] == [{"date": "2024-05-16", "txCount": 1, "flaggedCount": 0},
                                                              {"date": "2024-05-28", "txCount": 1, "flaggedCount": 0}]
    assert body["totals"] == {"txCount": 377, "scoredCount": 367, "flaggedCount": 3, "flaggedDays": 3}
    assert body["history"]["status"] == "sufficient" and body["history"]["firstScoredDate"] == "2024-07-11"
    assert body["history"]["spanDays"] == pytest.approx(886.3709, abs=1e-4)
    assert body["history"]["required"] == {"minTx": 10, "minSpanDays": 14}
    assert body["snapshot"]["method"]["id"] == "baseline"


def test_e5_the_timeline_is_small(client: TestClient) -> None:
    """The plan's budget for the timeline body is 60 kB, uncompressed."""
    for address in (RUNNING_EXAMPLE, LARGEST):
        assert len(client.get(f"/api/addresses/{address}/timeline").content) < 60_000


def test_e5_a_short_history_address_answers_200_unscored(client: TestClient) -> None:
    response = client.get(f"/api/addresses/{SHORT_HISTORY[0]}/timeline")
    assert response.status_code == 200
    body = response.json()
    assert body["history"]["status"] == "insufficient" and body["totals"]["scoredCount"] == 0
    assert body["history"]["firstScoredDate"] is None


def test_e5_the_address_is_normalised_and_checked(client: TestClient) -> None:
    upper = "bc1q7evspfauqve6ll84juuj0anlzrxxpdeq7raqn3".upper()
    assert client.get(f"/api/addresses/{upper}/timeline").json()["address"] == upper.lower()
    assert_invalid(client.get("/api/addresses/1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy/timeline"), "address")
    assert_invalid(client.get("/api/addresses/0x52908400098527886E0F7030069857D2E4169EE7/timeline"), "address")


def test_e5_outside_the_snapshot_is_the_404_with_examples(client: TestClient) -> None:
    response = client.get(f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}/timeline")
    assert response.status_code == 404
    assert response.json()["status"] == "unsupported" and response.json()["examples"] == EXAMPLES


# ---------------------------------------------------------------- E6: filters, sorts, pages


def test_e6_defaults_are_the_first_page_oldest_first(client: TestClient, settings: Settings) -> None:
    body = rows(client)
    assert (body["page"], body["pageSize"], body["total"], body["date"]) == (1, settings.web.lists.page_size, 377, None)
    assert body["address"] == RUNNING_EXAMPLE and len(body["transactions"]) == settings.web.lists.page_size
    times = [r["time"] for r in body["transactions"]]
    assert times == sorted(times)
    assert set(body["transactions"][0]) == {"txid", "time", "direction", "netSats", "status", "score", "mainReason", "mainZ", "flaggedBy"}


def test_e6_the_plans_flagged_row_has_its_reason(client: TestClient) -> None:
    row = rows(client, status="flagged", sort="time")["transactions"][0]
    assert row["txid"] == FLAGGED_TX and row["status"] == "flagged" and row["score"] == pytest.approx(5.6071, abs=1e-4)
    assert row["mainReason"] == "Small for a received amount" and row["flaggedBy"] == 1
    assert row["mainZ"] == pytest.approx(-5.6071, abs=1e-4)


def test_e6_pages_cover_the_list_exactly_once_and_a_page_past_the_end_is_empty(client: TestClient) -> None:
    seen: list[str] = []
    for page in range(1, 5):
        body = rows(client, page=page, pageSize=100)
        seen += [r["txid"] for r in body["transactions"]]
        assert body["total"] == 377 and body["page"] == page and body["pageSize"] == 100
    assert len(seen) == len(set(seen)) == 377
    beyond = rows(client, page=5, pageSize=100)
    assert beyond["transactions"] == [] and beyond["total"] == 377


@pytest.mark.parametrize("sort", ["time", "-time", "amount", "-amount", "score", "-score"])
def test_e6_sorts(client: TestClient, sort: str) -> None:
    everything = every_row(client, LARGEST, sort=sort)
    key = {"time": "time", "amount": "size", "score": "score"}[sort.lstrip("-")]
    values = [abs(r["netSats"]) if key == "size" else r[key] for r in everything if key == "size" or r[key] is not None]
    assert values == sorted(values, reverse=sort.startswith("-"))


def test_e6_amount_orders_by_size_whichever_way_the_coins_moved_and_ties_stay_oldest_first(client: TestClient) -> None:
    """`-amount` is largest first: a large sent transaction comes before a small received one, and equal sizes keep their time order."""
    for sort in ("amount", "-amount"):
        rows_ = every_row(client, LARGEST, sort=sort)
        sizes = [abs(r["netSats"]) for r in rows_]
        assert sizes == sorted(sizes, reverse=sort == "-amount")
        directions = {r["direction"] for r in rows_[:20]}
        assert directions != {"in"} and directions != {"out"}, "the first rows mix both directions, so the order is not by sign"
        for first, second in zip(rows_, rows_[1:]):
            if abs(first["netSats"]) == abs(second["netSats"]):
                assert first["time"] <= second["time"]
    largest_first = every_row(client, LARGEST, sort="-amount")
    assert abs(largest_first[0]["netSats"]) == max(abs(r["netSats"]) for r in largest_first)


def test_e6_unscored_rows_go_last_when_sorting_by_score_in_either_direction(client: TestClient) -> None:
    for sort in ("score", "-score"):
        statuses = [r["status"] for r in every_row(client, LARGEST, sort=sort)]
        scored = statuses.count("flagged") + statuses.count("not-flagged")
        assert scored == 683 and set(statuses[scored:]) == {"not-scored"} and len(statuses) == 700


def test_e6_the_top_score_is_the_most_unusual(client: TestClient) -> None:
    top = rows(client, address=LARGEST, sort="-score", pageSize=1)["transactions"][0]
    assert top["status"] == "flagged"
    assert top["score"] == max(r["score"] for r in every_row(client, LARGEST) if r["score"] is not None)


def test_e6_one_day_a_range_and_the_inclusive_ends(client: TestClient) -> None:
    day = rows(client, date="2024-07-11")
    assert day["date"] == "2024-07-11" and day["total"] > 0 and {r["time"][:10] for r in day["transactions"]} == {"2024-07-11"}
    window = rows(client, **{"from": "2024-05-16", "to": "2024-05-28"})
    assert window["date"] is None and {r["time"][:10] for r in window["transactions"]} == {"2024-05-16", "2024-05-28"}
    assert rows(client, **{"from": "2026-10-19"})["total"] == rows(client, date="2026-10-19")["total"]
    assert rows(client, to="2024-05-16")["total"] == rows(client, date="2024-05-16")["total"]


def test_e6_status_and_direction_filters_combine_and_may_repeat(client: TestClient) -> None:
    either = rows(client, status=["flagged", "not-scored"], pageSize=200)
    assert {r["status"] for r in either["transactions"]} == {"flagged", "not-scored"} and either["total"] == 3 + 10
    incoming = rows(client, direction="in", pageSize=200)["transactions"]
    assert {r["direction"] for r in incoming} == {"in"} and all(r["netSats"] > 0 for r in incoming)
    both = rows(client, direction=["in", "out"], status="not-flagged")
    assert both["total"] == 377 - 3 - 10
    assert rows(client, direction="none")["transactions"] == []


def test_e6_a_filter_that_matches_nothing_is_a_200_with_an_empty_list(client: TestClient) -> None:
    body = rows(client, date="1999-01-01")
    assert body["transactions"] == [] and body["total"] == 0 and body["date"] == "1999-01-01"


def test_e6_short_history_rows_are_unscored(client: TestClient) -> None:
    body = rows(client, address=SHORT_HISTORY[0], status="not-scored")
    assert body["total"] == 8 and {r["mainReason"] for r in body["transactions"]} == {None}
    assert rows(client, address=SHORT_HISTORY[0], status="flagged")["total"] == 0


def test_e6_a_page_of_200_rows_stays_small(client: TestClient) -> None:
    assert len(client.get(f"/api/addresses/{LARGEST}/transactions", params={"pageSize": 200}).content) < 60_000


def test_e6_outside_the_snapshot_is_the_404_with_examples(client: TestClient) -> None:
    response = client.get(f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}/transactions")
    assert response.status_code == 404 and response.json()["examples"] == EXAMPLES


# ---------------------------------------------------------------- E6: the validation rules (plan section 11.2)


@pytest.mark.parametrize("params,names", [
    ({"date": "2026-02-30"}, ["date"]), ({"date": "20261020"}, ["date"]), ({"date": "2026-1-5"}, ["date"]),
    ({"date": "tomorrow"}, ["date"]), ({"date": ""}, ["date"]), ({"date": "٢٠٢٦-١٠-٢٠"}, ["date"]),
    ({"from": "2026-13-01"}, ["from"]), ({"to": "x"}, ["to"]), ({"from": "bad", "to": "worse"}, ["from", "to"]),
    ({"status": "flaged"}, ["status"]), ({"status": ["flagged", "bad"]}, ["status"]), ({"direction": "up"}, ["direction"]),
    ({"direction": ["in", "sideways"]}, ["direction"]), ({"sort": "date"}, ["sort"]), ({"sort": "--time"}, ["sort"]),
    ({"method": "magic"}, ["method"]), ({"page": 0}, ["page"]), ({"page": -1}, ["page"]), ({"page": "one"}, ["page"]),
    ({"page": 1.5}, ["page"]), ({"pageSize": 0}, ["pageSize"]), ({"pageSize": "many"}, ["pageSize"]),
    ({"pageSize": 201}, ["pageSize"]), ({"pageSize": 10_000}, ["pageSize"]), ({"colour": "red"}, ["colour"]),
    ({"page": 0, "pageSize": 0, "sort": "x"}, ["sort", "page", "pageSize"]),
])
def test_e6_a_bad_parameter_is_a_400_that_names_it(client: TestClient, params: dict[str, Any], names: list[str]) -> None:
    body = assert_invalid(client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params=params), *names)
    assert body["message"] == f"{NUMBER_WORDS[len(names)]} {'value needs' if len(names) == 1 else 'values need'} correcting."
    assert all(f["message"] for f in body["fields"])


def test_e6_a_400_names_the_type_fault_and_the_page_size_limit_together(client: TestClient) -> None:
    """Pydantic stops at `status`; the page-size rule is the service's, and still names `pageSize` in the same answer."""
    body = assert_invalid(client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions?pageSize=999&status=bogus"), "status", "pageSize")
    assert body["message"] == "Two values need correcting."
    assert body["fields"][1]["message"] == "Must be at most 200."


def test_e6_a_400_adds_the_services_rules_for_every_field_that_passed_its_type(client: TestClient) -> None:
    url = f"/api/addresses/{RUNNING_EXAMPLE}/transactions"
    assert_invalid(client.get(url, params={"page": 0, "date": "2026-02-30", "pageSize": 999, "sort": "x"}), "sort", "page", "date", "pageSize")
    # A page size that is not a number has nothing to judge against the limit: only the type fault is named.
    assert_invalid(client.get(url, params={"pageSize": "many", "status": "bogus"}), "status", "pageSize")
    # The day rules that need two valid fields run when the other fields are the faulty ones.
    assert_invalid(client.get(url, params={"date": "2026-01-01", "from": "2026-01-01", "sort": "x"}), "sort", "date", "from")


def test_e6_a_date_with_a_range_names_both_fields(client: TestClient) -> None:
    for extra in ({"from": "2026-01-01"}, {"to": "2026-01-02"}, {"from": "2026-01-01", "to": "2026-01-02"}):
        body = assert_invalid(client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"date": "2026-01-01", **extra}),
                              "date", *extra)
        assert body["message"] == "Use either one date or a range of days, not both."


def test_e6_from_after_to_names_both_fields(client: TestClient) -> None:
    body = assert_invalid(client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"from": "2026-02-01", "to": "2026-01-01"}),
                          "from", "to")
    assert body["message"] == "From can't be after To."
    assert body["hint"] == "Swap the two dates, or change one."
    assert body["fields"] == [{"name": "from", "message": "From can't be after To."}, {"name": "to", "message": "To can't be before From."}]
    assert rows(client, **{"from": "2026-01-01", "to": "2026-01-01"})["total"] >= 0  # the same day is a range of one


def test_e6_the_page_size_limits_come_from_settings(make_client: Callable[..., TestClient], settings: Settings) -> None:
    small = replace(settings, web=settings.web.model_copy(update={"lists": settings.web.lists.model_copy(update={"page_size": 3, "max_page_size": 5})}))
    client = make_client(app_settings=small)
    body = rows(client)
    assert body["pageSize"] == 3 and len(body["transactions"]) == 3
    assert rows(client, pageSize=5)["pageSize"] == 5
    error = assert_invalid(client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"pageSize": 6}), "pageSize")
    assert error["fields"][0]["message"] == "Must be at most 5."


def test_e6_the_largest_page_size_in_settings_is_accepted(client: TestClient, settings: Settings) -> None:
    assert rows(client, pageSize=settings.web.lists.max_page_size)["pageSize"] == settings.web.lists.max_page_size


def test_e6_the_address_is_checked_before_the_query(client: TestClient) -> None:
    assert_invalid(client.get("/api/addresses/not-an-address/transactions", params={"page": 0}), "address")


# ---------------------------------------------------------------- E7


def test_e7_the_plans_example_transaction(client: TestClient) -> None:
    response = client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE})
    body = response.json()
    assert response.status_code == 200
    assert (body["txid"], body["address"], body["time"], body["blockHeight"], body["direction"]) == (
        FLAGGED_TX, RUNNING_EXAMPLE, "2024-07-11T03:32:50Z", 851629, "in")
    assert (body["receivedSats"], body["sentSats"], body["netSats"]) == (111260, 0, 111260)
    assert body["sourceUrl"] == f"https://blockstream.info/tx/{FLAGGED_TX}"
    assert body["scored"] is True and body["flagged"] is True and body["score"] == pytest.approx(5.6071, abs=1e-4)
    assert [(f["id"], f["role"]) for f in body["features"]] == [("F1", "contributing"), ("F2", "within-usual"),
                                                               ("F3", "within-usual"), ("F4", "flag")]
    assert body["features"][3]["z"] == pytest.approx(-5.6071, abs=1e-4)
    assert [c["features"] for c in body["comparison"]] == [["F1", "F4"], ["F2", "F3"]]
    assert body["limitation"] == "Worth investigating, not proof of wrongdoing."
    assert body["flags"]["baseline"] is True and not any(v for k, v in body["flags"].items() if k != "baseline")
    assert set(body["scores"]) == set(body["flags"]) and len(body["scores"]) == 9
    assert body["explanation"].startswith("- Small for a received amount: 0.4\u00d7 its usual size\n") and body["source"] == "snapshot"
    assert [(r["feature"], r["level"]) for r in body["reasons"]] == [("F4", "flag"), ("F1", "contributing")]
    assert body["method"]["id"] == "baseline"


def test_e7_one_transactions_body_is_under_the_budget(client: TestClient) -> None:
    assert len(client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE}).content) < 6_000


def test_e7_the_transaction_id_may_be_upper_case(client: TestClient) -> None:
    response = client.get(f"/api/transactions/{FLAGGED_TX.upper()}", params={"address": RUNNING_EXAMPLE})
    assert response.status_code == 200 and response.json()["txid"] == FLAGGED_TX


def test_e7_method_decides_the_flag_and_the_wording(client: TestClient) -> None:
    body = client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE, "method": "fusion"}).json()
    assert body["method"]["id"] == "fusion" and body["flagged"] is False
    assert body["method"]["name"] == "Fusion" and "Not flagged by" not in body["explanation"] and not body["explanation"].startswith("What stands out")
    assert body["reasons"] and body["explanation"].count("\n") == len(body["reasons"]) - 1  # one line per reason, no limitation line


@pytest.mark.parametrize("txid", ["abc", "g" * 64, "0" * 63, "0" * 65, " ", "0x" + "0" * 62], ids=["short", "not-hex", "63", "65", "blank", "0x"])
def test_e7_a_malformed_transaction_id_is_a_400_that_names_it(client: TestClient, txid: str) -> None:
    assert_invalid(client.get(f"/api/transactions/{txid}", params={"address": RUNNING_EXAMPLE}), "txid")


def test_e7_a_missing_or_malformed_address_is_a_400_that_names_it(client: TestClient) -> None:
    body = assert_invalid(client.get(f"/api/transactions/{FLAGGED_TX}"), "address")
    assert body["fields"][0]["message"] == "This field is required."
    assert_invalid(client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy"}), "address")
    assert_invalid(client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": ""}), "address")


def test_e7_an_unknown_method_is_a_400(client: TestClient) -> None:
    assert_invalid(client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE, "method": "magic"}), "method")


def test_e7_an_address_outside_the_snapshot_is_404_unsupported(client: TestClient) -> None:
    response = client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": VALID_OUTSIDE_SNAPSHOT})
    assert response.status_code == 404 and response.json()["status"] == "unsupported" and response.json()["examples"] == EXAMPLES


def test_e7_a_transaction_that_is_not_that_addresses_is_404_not_found(client: TestClient) -> None:
    for txid, address in (("0" * 64, RUNNING_EXAMPLE), (FLAGGED_TX, LARGEST)):
        response = client.get(f"/api/transactions/{txid}", params={"address": address})
        assert response.status_code == 404 and response.json()["status"] == "not_found"
        assert (response.json()["message"], response.json()["hint"]) == ("This transaction isn't in the snapshot for this address.", "Pick one from the list.")
        assert "examples" not in response.json()


def test_e7_a_transaction_with_too_little_history_is_422_with_its_facts(client: TestClient) -> None:
    first = rows(client, sort="time", pageSize=1)["transactions"][0]
    response = client.get(f"/api/transactions/{first['txid']}", params={"address": RUNNING_EXAMPLE})
    body = response.json()
    assert response.status_code == 422 and body["status"] == "insufficient_history"
    assert body["transaction"]["txid"] == first["txid"] and body["transaction"]["address"] == RUNNING_EXAMPLE
    assert body["history"] == {"earlierTx": 0, "spanDays": 0.0, "required": {"minTx": 10, "minSpanDays": 14}}
    assert body["firstScoredDate"] == "2024-07-11"


# ---------------------------------------------------------------- the service is not ready


def test_e3_to_e7_answer_503_while_the_models_load(make_client: Callable[..., TestClient], predictor: Predictor) -> None:
    release = threading.Event()

    def slow_loader() -> Predictor:
        release.wait(10)
        return predictor

    client = make_client(slow_loader)
    try:
        for response in (client.get("/api/addresses"), client.post("/api/lookup", json={"address": RUNNING_EXAMPLE}),
                         client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline"),
                         client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions"),
                         client.get(f"/api/transactions/{FLAGGED_TX}", params={"address": RUNNING_EXAMPLE})):
            assert response.status_code == 503 and response.json()["status"] == "unavailable"
    finally:
        release.set()
