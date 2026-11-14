"""T14: E8 and E9 answer each status of plan section 6.2, validate their bodies by the shared vectors, and never store anything."""
from __future__ import annotations

import json
import threading
from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from explorer.predict import PRECOMPUTED_ONLY, Predictor
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.services.reasons import reword

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY, VALID_OUTSIDE_SNAPSHOT, wait_until_ready
from .test_whatif_parity import agree

VECTORS = json.loads((Path(__file__).resolve().parents[2] / "shared" / "whatif_vectors.json").read_text(encoding="utf-8"))
PLAN_TIME = "2026-10-20T12:00:00Z"
BODY = {"amountBtc": 0.05, "direction": "out", "time": PLAN_TIME}
LIMITATION = "Unusual activity requires investigation; it does not indicate wrongdoing."
USABLE = ["baseline", "isolation_forest", "lof", "kmeans", "dbscan", "regression", "regression_interval", "fusion"]


def what_if(client: TestClient, address: str = RUNNING_EXAMPLE, **changes: Any) -> Any:
    return client.post(f"/api/addresses/{address}/what-if", json={**BODY, **changes})


def curve(client: TestClient, address: str = RUNNING_EXAMPLE, **body: Any) -> Any:
    return client.post(f"/api/addresses/{address}/what-if/curve", json={"direction": "out", "time": PLAN_TIME, **body})


# ---------------------------------------------------------------- E8: 200


def test_e8_the_plans_running_example_is_flagged_with_score_5_98(shared_client: TestClient, predictor: Predictor) -> None:
    response = what_if(shared_client)
    assert response.status_code == 200
    body = response.json()
    assert body["txid"] == "what-if" and body["sourceUrl"] is None and body["scored"] is True
    assert body["flagged"] is True and round(body["score"], 2) == 5.98
    assert body["time"] == PLAN_TIME and body["direction"] == "out"
    assert (body["receivedSats"], body["sentSats"], body["netSats"]) == (0, 5_000_000, -5_000_000)
    assert body["notAvailable"] == ["txgpt_method"] and list(body["scores"]) == USABLE == list(body["flags"])
    assert body["note"] == "A hypothetical transaction, compared with the address's real history before that time."
    assert body["limitation"] == LIMITATION and body["explanation"].endswith(LIMITATION)
    size = body["features"][0]
    assert (size["id"], size["role"], round(size["usual"], 6)) == ("F1", "flag", 0.000525)
    # b-json.tex: four models flag it: the baseline, both regression methods and the fusion.
    assert sorted(m for m, flag in body["flags"].items() if flag) == ["baseline", "fusion", "regression", "regression_interval"]
    # It is Assignment 2's own answer, unchanged.
    single = predictor.score_what_if(RUNNING_EXAMPLE, 0.05, "out", PLAN_TIME)
    assert body["scores"] == pytest.approx(single["scores"], rel=1e-12) and body["flags"] == single["flags"]
    assert body["explanation"] == reword(single["explanation"])  # A2's text, with Mod-12's wording


def test_e8_a_usual_sized_transaction_is_not_flagged_and_its_explanation_has_no_limitation_line(shared_client: TestClient) -> None:
    body = what_if(shared_client, amountBtc=0.0005).json()
    assert body["flagged"] is False and LIMITATION not in body["explanation"]
    assert body["limitation"] == LIMITATION  # the field is always there; the explanation adds it on a flag


@pytest.mark.slow
def test_e8_an_incoming_transaction_and_a_time_with_an_offset(shared_client: TestClient) -> None:
    incoming = what_if(shared_client, direction="in").json()
    assert incoming["direction"] == "in" and (incoming["receivedSats"], incoming["sentSats"]) == (5_000_000, 0)
    offset = what_if(shared_client, time="2026-10-20T14:00:00+02:00").json()
    assert offset["time"] == PLAN_TIME  # answered in UTC


@pytest.mark.parametrize("entry", [v for v in VECTORS["amountBtc"] if v["ok"]], ids=lambda v: v["id"])
def test_e8_accepted_amounts_become_whole_satoshis(shared_client: TestClient, entry: dict[str, Any]) -> None:
    body = what_if(shared_client, direction="in", amountBtc=entry["input"], time="2026-10-22T12:00:00Z").json()
    assert body["receivedSats"] == entry["sats"]


@pytest.mark.slow
def test_e8_does_not_depend_on_how_the_amount_is_written(shared_client: TestClient) -> None:
    bodies = [what_if(shared_client, amountBtc=a).json() for a in (0.05, "0.05", "0,05", "0.050000")]
    for body in bodies[1:]:
        assert body["flags"] == bodies[0]["flags"] and body["netSats"] == bodies[0]["netSats"]
        # The regression's last digits can differ between two identical calls (BLAS sums in a thread-dependent order).
        assert body["scores"] == pytest.approx(bodies[0]["scores"], rel=1e-12)


# ---------------------------------------------------------------- E8, E9: 400 by the shared vectors


@pytest.mark.parametrize("field", ["amountBtc", "direction", "time"])
def test_e8_rejects_each_vector_with_its_message(shared_client: TestClient, field: str) -> None:
    for entry in VECTORS[field]:
        if entry["ok"]:
            continue
        response = what_if(shared_client, **{field: entry["input"]})
        assert response.status_code == 400, entry["id"]
        assert response.json()["status"] == "invalid" and response.json()["message"] == "One value needs correcting."
        assert response.json()["fields"] == [{"name": field, "message": entry["message"]}], entry["id"]


def test_e9_rejects_the_same_vectors_in_its_own_fields(shared_client: TestClient) -> None:
    for entry in VECTORS["amountBtc"]:
        if entry["ok"]:
            continue
        response = curve(shared_client, amountsBtc=[entry["input"]])
        assert response.status_code == 400, entry["id"]
        fields = response.json()["fields"]
        assert len(fields) == 1 and fields[0]["name"].startswith("amountsBtc") and fields[0]["message"] == entry["message"], entry["id"]
    for entry in VECTORS["direction"]:
        if not entry["ok"]:
            assert curve(shared_client, direction=entry["input"]).json()["fields"] == [{"name": "direction", "message": entry["message"]}]
    for entry in VECTORS["time"]:
        if not entry["ok"]:
            assert curve(shared_client, time=entry["input"]).json()["fields"] == [{"name": "time", "message": entry["message"]}]


def test_the_vectors_agree_with_the_settings_limits(settings: Settings) -> None:
    limits = settings.web.what_if
    assert Decimal(VECTORS["limits"]["minAmountBtc"]) == Decimal(str(limits.min_amount_btc))
    assert Decimal(VECTORS["limits"]["maxAmountBtc"]) == Decimal(str(limits.max_amount_btc))


def test_e8_names_every_field_at_fault_together(shared_client: TestClient) -> None:
    response = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json={"amountBtc": 0, "direction": "sideways", "time": "tomorrow"})
    assert response.status_code == 400 and response.json()["message"] == "Three values need correcting."
    assert [f["name"] for f in response.json()["fields"]] == ["amountBtc", "direction", "time"]
    limits = what_if(shared_client, amountBtc="0.123456789", time="2040-01-01T00:00:00Z").json()
    assert limits["message"] == "Two values need correcting." and [f["name"] for f in limits["fields"]] == ["amountBtc", "time"]


def test_a_time_more_than_max_gap_years_after_the_last_transaction_is_400(shared_client: TestClient, settings: Settings) -> None:
    assert settings.web.what_if.max_gap_years == 5  # the last transaction is 2026-10-19T14:10:25Z
    assert what_if(shared_client, time="2031-10-19T12:00:00Z").status_code == 200
    response = what_if(shared_client, time="2031-10-21T00:00:00Z")
    assert response.status_code == 400
    assert response.json()["fields"] == [{"name": "time", "message": "At most 5 years after this address's last transaction."}]
    assert curve(shared_client, time="2031-10-21T00:00:00Z", amountsBtc=[1]).status_code == 400


def test_unknown_fields_and_bad_bodies_are_400_or_415(shared_client: TestClient) -> None:
    url = f"/api/addresses/{RUNNING_EXAMPLE}/what-if"
    assert shared_client.post(url, json={**BODY, "colour": "red"}).json()["fields"] == [{"name": "colour", "message": "Not a known field."}]
    assert shared_client.post(url, content="{not json", headers={"Content-Type": "application/json"}).status_code == 400
    assert shared_client.post(url, content="amountBtc=1", headers={"Content-Type": "text/plain"}).status_code == 415
    assert shared_client.post(url, json=[1]).status_code == 400
    assert shared_client.post(url, json={}).json()["message"] == "Three values need correcting."
    assert shared_client.post(url + "/curve", json={}).json()["message"] == "Two values need correcting."


def test_a_malformed_address_is_400_and_an_outside_address_is_404(shared_client: TestClient) -> None:
    bad = what_if(shared_client, "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy")
    assert bad.status_code == 400 and bad.json()["fields"][0]["name"] == "address"
    for response in (what_if(shared_client, VALID_OUTSIDE_SNAPSHOT), curve(shared_client, VALID_OUTSIDE_SNAPSHOT, amountsBtc=[1])):
        assert response.status_code == 404 and response.json()["status"] == "unsupported"
        assert len(response.json()["examples"]) == 3


def test_a_body_over_10_kb_is_413(shared_client: TestClient) -> None:
    response = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json={**BODY, "padding": "x" * 11_000})
    assert response.status_code == 413 and response.json()["status"] == "too_large"


def test_e8_and_e9_are_503_while_the_models_load(make_client: Callable[..., TestClient], predictor: Predictor) -> None:
    release = threading.Event()

    def slow_loader() -> Predictor:
        release.wait(10)
        return predictor

    client = make_client(slow_loader)
    assert what_if(client).status_code == 503 and curve(client, amountsBtc=[1]).status_code == 503
    release.set()
    wait_until_ready(client)
    assert what_if(client).status_code == 200


# ---------------------------------------------------------------- E8, E9: 422


def test_e8_too_early_is_422_with_the_counts_and_the_first_day_that_can_be_scored(shared_client: TestClient) -> None:
    response = what_if(shared_client, time="2024-05-20T12:00:00Z")  # the plan's example: one earlier transaction
    assert response.status_code == 422
    body = response.json()
    assert body["status"] == "insufficient_history"
    assert body["message"] == "At that time this address did not have enough earlier history to compare with."
    assert body["history"]["earlierTx"] == 1 and round(body["history"]["spanDays"], 2) == 4.28
    assert body["history"]["required"] == {"minTx": 10, "minSpanDays": 14}
    assert body["firstScoredDate"] == "2024-07-11" and "transaction" not in body


def test_e8_and_e9_before_the_first_transaction_are_422_with_nothing_earlier(shared_client: TestClient) -> None:
    for response in (what_if(shared_client, time="2020-01-01T00:00:00Z"), curve(shared_client, time="2020-01-01T00:00:00Z", amountsBtc=[1])):
        assert response.status_code == 422
        assert response.json()["history"] == {"earlierTx": 0, "spanDays": 0.0, "required": {"minTx": 10, "minSpanDays": 14}}
        assert response.json()["firstScoredDate"] == "2024-07-11"


def test_e9_too_early_with_some_history_is_422_too(shared_client: TestClient) -> None:
    response = curve(shared_client, time="2024-05-20T12:00:00Z", amountsBtc=[0.01, 0.1])
    assert response.status_code == 422 and response.json()["history"]["earlierTx"] == 1


@pytest.mark.parametrize("address", SHORT_HISTORY)
def test_a_short_history_address_is_422_at_any_time_with_no_first_day(shared_client: TestClient, address: str) -> None:
    for response in (what_if(shared_client, address), curve(shared_client, address, amountsBtc=[0.01])):
        assert response.status_code == 422
        assert response.json()["firstScoredDate"] is None and "firstScoredDate" in response.json()


# ---------------------------------------------------------------- E9


def test_e9_the_plans_example_amounts(shared_client: TestClient) -> None:
    amounts = [0.0001, 0.001, 0.01, 0.05, 0.1, 1, 10]
    response = curve(shared_client, amountsBtc=amounts)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"address", "direction", "time", "usualBtc", "decidingMethod", "amountsBtc", "methods", "notAvailable"}
    assert body["amountsBtc"] == amounts and round(body["usualBtc"], 6) == 0.000525 and body["decidingMethod"] == "baseline"
    assert body["notAvailable"] == ["txgpt_method"] and [m["id"] for m in body["methods"]] == USABLE
    baseline = body["methods"][0]
    assert set(baseline) == {"id", "name", "threshold", "scores", "flags"}
    assert baseline["name"] == "Robust z baseline (A1)" and baseline["threshold"] == 5.0
    assert [round(s, 4) for s in baseline["scores"]] == [2.1398, 0.9493, 3.9077, 5.9755, 6.8661, 9.8245, 12.7829]
    assert baseline["flags"] == [False, False, False, True, True, True, True]
    assert all(len(m["scores"]) == len(m["flags"]) == 7 for m in body["methods"])


@pytest.mark.slow
def test_e9_scores_equal_what_e8_answers_for_each_amount(shared_client: TestClient) -> None:
    amounts = [0.0001, 0.05, 10]
    body = curve(shared_client, amountsBtc=amounts).json()
    for i, amount in enumerate(amounts):
        single = what_if(shared_client, amountBtc=amount).json()
        for method in body["methods"]:
            # Flags exactly; scores within the parity tolerance, because multithreaded BLAS can change the last digits
            # of the regression, fusion and k-means scores between two runs (see test_whatif_parity.SCORE_TOLERANCE).
            assert method["flags"][i] == single["flags"][method["id"]]
            assert agree(method["scores"][i], single["scores"][method["id"]]), (method["id"], amount)


def test_e9_with_nothing_chosen_spaces_41_amounts_from_a_hundredth_to_a_thousand_times_the_usual(shared_client: TestClient,
                                                                                                    settings: Settings) -> None:
    body = curve(shared_client).json()
    amounts, usual = body["amountsBtc"], body["usualBtc"]
    assert len(amounts) == settings.web.what_if.curve_points == 41 and amounts == sorted(amounts)
    assert amounts[0] == pytest.approx(usual / 100, rel=1e-3) and amounts[-1] == pytest.approx(usual * 1000, rel=1e-7)
    ratios = [b / a for a, b in zip(amounts, amounts[1:])]
    assert max(ratios) / min(ratios) < 1.02  # even on a log scale (up to satoshi rounding)
    baseline = body["methods"][0]
    assert baseline["flags"][0] is True and baseline["flags"][-1] is True  # far below and far above the usual amount both stand out
    assert baseline["scores"][20] < baseline["scores"][0] and baseline["scores"][20] < baseline["scores"][-1]
    assert body["time"] == PLAN_TIME and body["direction"] == "out"


def test_e9_a_range_of_points_is_spaced_on_a_log_scale(shared_client: TestClient) -> None:
    body = curve(shared_client, minBtc=0.001, maxBtc="1", points=4).json()
    assert body["amountsBtc"] == [0.001, 0.01, 0.1, 1.0]
    assert all(len(m["scores"]) == 4 for m in body["methods"])


def test_e9_allows_the_largest_curve_and_no_more(shared_client: TestClient, settings: Settings) -> None:
    most = settings.web.what_if.curve_max_points
    assert len(curve(shared_client, minBtc=0.00001, maxBtc=1, points=most).json()["amountsBtc"]) == most
    assert len(curve(shared_client, amountsBtc=[round(0.01 * (i + 1), 2) for i in range(most)]).json()["amountsBtc"]) == most
    too_many = curve(shared_client, minBtc=0.00001, maxBtc=1, points=most + 1)
    assert too_many.status_code == 400 and too_many.json()["fields"] == [{"name": "points", "message": f"Must be at most {most}."}]
    too_long = curve(shared_client, amountsBtc=[0.01] * (most + 1))
    assert too_long.status_code == 400 and too_long.json()["fields"] == [{"name": "amountsBtc", "message": f"Give between 1 and {most} amounts."}]
    assert curve(shared_client, amountsBtc=[]).status_code == 400


def test_e9_body_shape_rules(shared_client: TestClient) -> None:
    both = curve(shared_client, amountsBtc=[1], minBtc=1, maxBtc=2, points=3)
    assert both.status_code == 400 and "not both" in json.dumps(both.json())
    partial = curve(shared_client, minBtc=1)
    assert partial.status_code == 400 and "together" in json.dumps(partial.json())
    backwards = curve(shared_client, minBtc=2, maxBtc=1, points=3)
    assert backwards.json()["fields"] == [{"name": "maxBtc", "message": "Must be greater than minBtc."}]
    assert curve(shared_client, minBtc=1, maxBtc=2, points=1).json()["fields"][0]["name"] == "points"
    # The schema's rules (greater than 0) and the service's range rules are reported in one answer.
    assert [f["name"] for f in curve(shared_client, amountsBtc=[0.01, 0, 0.02, -1]).json()["fields"]] == ["amountsBtc.1", "amountsBtc.3"]
    assert [f["name"] for f in curve(shared_client, amountsBtc=[0.01, "0.123456789", 0.02, 1e-9]).json()["fields"]] == ["amountsBtc.1", "amountsBtc.3"]


def test_e9_a_400_names_the_amount_that_fails_the_schema_and_the_one_that_fails_the_range(shared_client: TestClient) -> None:
    """Pydantic names the 0 (not greater than 0); the range rule names 1e-9 (under a satoshi) in the same answer."""
    body = curve(shared_client, amountsBtc=[0.01, 0, 0.02, 1e-9]).json()
    assert [f["name"] for f in body["fields"]] == ["amountsBtc.1", "amountsBtc.3"]
    assert body["message"] == "Two values need correcting."
    assert body["fields"][0]["message"] == "Must be greater than 0."
    assert body["fields"][1]["message"].startswith("Must be at least")


def test_a_400_judges_every_value_that_passed_its_type_whichever_other_field_failed(shared_client: TestClient) -> None:
    too_far = "2040-01-01T00:00:00Z"
    # E8: the amount fails the schema, the time fails a rule that needs the address.
    assert [f["name"] for f in what_if(shared_client, amountBtc=0, time=too_far).json()["fields"]] == ["amountBtc", "time"]
    # E8: the direction fails its type; the amount and the time are still judged.
    assert [f["name"] for f in what_if(shared_client, amountBtc="1e-9", direction="up", time=too_far).json()["fields"]] == [
        "direction", "amountBtc", "time"]
    # E9: a failed `points` leaves the amounts and the time to be judged.
    body = curve(shared_client, amountsBtc=[0, 1e-9], points="many", time=too_far).json()
    assert [f["name"] for f in body["fields"]] == ["amountsBtc.0", "points", "amountsBtc.1", "time"]
    # E9: a range whose minimum fails the schema still has its point count judged.
    assert [f["name"] for f in curve(shared_client, minBtc=0, maxBtc=1, points=10_000).json()["fields"]] == ["minBtc", "points"]
    # An address outside the snapshot has no last transaction: the time is not judged, the 404 waits for a correct body.
    outside = shared_client.post(f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}/what-if", json={**BODY, "amountBtc": 0, "time": too_far})
    assert outside.status_code == 400 and [f["name"] for f in outside.json()["fields"]] == ["amountBtc"]


def test_e9_default_curve_needs_an_earlier_transaction_in_the_direction(shared_client: TestClient) -> None:
    """At the moment the running example first becomes scorable it has only received: no usual outgoing amount to centre on."""
    time = "2024-07-11T03:32:50Z"
    response = curve(shared_client, time=time)
    assert response.status_code == 400
    assert response.json()["fields"] == [{"name": "direction", "message": "No earlier transactions in this direction at that time."}]
    explicit = curve(shared_client, time=time, amountsBtc=[0.001, 0.01])
    assert explicit.status_code == 200 and explicit.json()["usualBtc"] is None


def test_e9_on_the_largest_address_and_in_the_other_direction(shared_client: TestClient) -> None:
    for direction in ("in", "out"):
        body = curve(shared_client, LARGEST, direction=direction, time="2026-10-23T00:00:00Z").json()
        assert len(body["amountsBtc"]) == 41 and body["usualBtc"] > 0 and body["direction"] == direction


def test_the_models_that_cannot_score_new_input_are_named_in_both_answers(shared_client: TestClient, predictor: Predictor) -> None:
    assert sorted(PRECOMPUTED_ONLY & set(predictor.methods)) == what_if(shared_client).json()["notAvailable"] == curve(shared_client, amountsBtc=[1]).json()["notAvailable"]


def test_a_what_if_stores_nothing(shared_client: TestClient) -> None:
    before = shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").text
    what_if(shared_client)
    curve(shared_client)
    assert shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").text == before
