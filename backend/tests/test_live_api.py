"""S-09: E16 to E20 answer each status of plan section 6.2, fetch through a fake Esplora (no test touches the network), score a
fetched address with the frozen models, keep it in a cache that expires, and leave the Must tier alone."""
from __future__ import annotations

import json
import threading
import time
import urllib.request
from collections.abc import Callable, Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pandas as pd
import pytest
from explorer.esplora import EsploraError
from explorer.predict import PRECOMPUTED_ONLY, Predictor
from explorer.snapshot import trim_tx
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas.live import LiveLookup
from app.services.live_scoring import adapt, score_history, score_transactions
from app.services.store import LiveFetch

from .conftest import RUNNING_EXAMPLE, VALID_OUTSIDE_SNAPSHOT, wait_until_ready
from .live_fakes import ADDRESSES, RECORDED_ADDRESS, FakeEsplora, inflate, recorded
from .test_wording import BANNED

A, B, C = ADDRESSES[:3]
TERMINAL = ("done", "failed", "cancelled")


@pytest.fixture(autouse=True)
def no_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """A test that reaches the real service fails: the lookups below read from the fake."""
    def refuse(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("a live-lookup test tried to use the network")
    monkeypatch.setattr(urllib.request, "urlopen", refuse)


@pytest.fixture
def live_settings(settings: Settings) -> Settings:
    return replace(settings, live_lookup=True)


@pytest.fixture
def fake() -> FakeEsplora:
    return FakeEsplora()


@pytest.fixture
def start(live_settings: Settings, predictor: Predictor, fake: FakeEsplora,
          tmp_path_factory: pytest.TempPathFactory) -> Iterator[Callable[..., TestClient]]:
    """A factory for clients of an application with live lookup on, reading from `fake`; `database` is shared to model a restart."""
    opened: list[TestClient] = []

    def build(database: Path | None = None, app_settings: Settings | None = None) -> TestClient:
        file = database or tmp_path_factory.mktemp("live") / "explorer.db"
        client = TestClient(create_app(app_settings or live_settings, lambda: predictor, False, file, lambda: fake),
                            raise_server_exceptions=False)
        client.__enter__()
        opened.append(client)
        wait_until_ready(client)
        return client

    yield build
    for client in opened:
        client.__exit__(None, None, None)


@pytest.fixture
def client(start: Callable[..., TestClient]) -> TestClient:
    return start()


def lookup(client: TestClient, address: str, **body: Any) -> Any:
    return client.post("/api/live/lookups", json={"address": address, **body})


def finish(client: TestClient, lookup_id: str, seconds: float = 20.0) -> dict[str, Any]:
    """E17 until the lookup ends."""
    deadline = time.monotonic() + seconds
    while True:
        body = client.get(f"/api/live/lookups/{lookup_id}").json()
        if body["status"] in TERMINAL:
            return body
        assert time.monotonic() < deadline, f"the lookup did not finish: {body}"
        time.sleep(0.02)


def fetch(client: TestClient, address: str, **body: Any) -> dict[str, Any]:
    """Start a lookup and wait for it; it must be done."""
    response = lookup(client, address, **body)
    assert response.status_code in (200, 202), response.text
    done = finish(client, response.json()["id"])
    assert done["status"] == "done", done
    return done


def events(client: TestClient, lookup_id: str) -> list[tuple[str, dict[str, Any]]]:
    """E18's events, parsed, until the stream ends; comment lines are skipped."""
    out: list[tuple[str, dict[str, Any]]] = []
    with client.stream("GET", f"/api/live/lookups/{lookup_id}/events") as response:
        assert response.status_code == 200 and response.headers["content-type"].startswith("text/event-stream")
        name = ""
        for line in response.iter_lines():
            if line.startswith("event: "):
                name = line.removeprefix("event: ")
            elif line.startswith("data: "):
                out.append((name, json.loads(line.removeprefix("data: "))))
    return out


# ---------------------------------------------------------------- off by default

def test_everything_answers_403_disabled_when_live_lookup_is_off(settings: Settings, make_client: Callable[..., TestClient]) -> None:
    assert settings.live_lookup is False
    off = make_client()
    for method, path, body in (("POST", "/api/live/lookups", {"address": A}), ("GET", "/api/live/lookups/abc", None),
                               ("GET", "/api/live/lookups/abc/events", None), ("DELETE", "/api/live/lookups/abc", None),
                               ("DELETE", f"/api/addresses/{A}", None)):
        response = off.request(method, path, json=body)
        assert response.status_code == 403, path
        assert response.json()["status"] == "disabled" and response.json()["requestId"]
        assert response.json()["message"] == "Fetching new addresses is turned off. Pick an address from the list."
        assert "EXPLORER_" not in response.text and "hint" not in response.json()
    assert off.get("/api/health").json()["liveLookup"] is False
    missing = off.post("/api/lookup", json={"address": VALID_OUTSIDE_SNAPSHOT})
    assert missing.status_code == 404 and missing.json()["canLookupLive"] is False


def test_disabled_comes_before_a_bad_body(make_client: Callable[..., TestClient]) -> None:
    assert make_client().post("/api/live/lookups", json={"address": 5}).status_code == 403


def test_with_live_lookup_on_the_404_offers_it_and_health_says_so(client: TestClient) -> None:
    assert client.get("/api/health").json()["liveLookup"] is True
    assert client.get("/api/config").json()["capabilities"]["liveLookup"] is True
    body = client.post("/api/lookup", json={"address": A}).json()
    assert body["status"] == "unsupported" and body["canLookupLive"] is True


# ---------------------------------------------------------------- E16, E17

def test_e16_answers_202_with_the_lookup_its_links_and_a_location(client: TestClient, fake: FakeEsplora) -> None:
    response = lookup(client, A)
    assert response.status_code == 202
    body = response.json()
    assert LiveLookup.model_validate(body)
    assert set(body) == {"id", "address", "status", "progress", "maxTx", "startedAt", "finishedAt", "error", "cached", "links"}
    assert (body["address"], body["maxTx"], body["cached"], body["error"]) == (A, 500, False, None)
    assert body["status"] in ("fetching", "scoring", "done") and body["progress"]["total"] == 100
    assert body["links"] == {"status": f"/api/live/lookups/{body['id']}", "events": f"/api/live/lookups/{body['id']}/events"}
    assert response.headers["location"] == body["links"]["status"]
    finish(client, body["id"])


def test_e17_reports_progress_and_the_end(client: TestClient) -> None:
    done = finish(client, lookup(client, A).json()["id"])
    assert done["status"] == "done" and done["finishedAt"] and done["error"] is None
    assert done["progress"] == {"pages": 4, "transactions": 100, "cap": 100, "total": 100}


def test_a_fetched_address_is_asked_only_for_its_own_pages_and_paged_by_the_cursor(client: TestClient, fake: FakeEsplora) -> None:
    fetch(client, A)
    assert fake.requests[0] == f"/address/{A}"
    assert len(fake.history_requests()) == 4
    assert fake.history_requests()[0] == f"/address/{A}/txs/chain"
    assert fake.history_requests()[1] == f"/address/{A}/txs/chain/{fake.histories[A][24]['txid']}"
    assert all(A in path for path in fake.requests)  # only the address leaves this computer


def test_e17_and_e18_and_e19_answer_404_for_an_unknown_lookup(client: TestClient) -> None:
    for method, path in (("GET", "/api/live/lookups/nope"), ("GET", "/api/live/lookups/nope/events"), ("DELETE", "/api/live/lookups/nope")):
        response = client.request(method, path)
        assert response.status_code == 404 and response.json()["status"] == "not_found", path


# ---------------------------------------------------------------- a fetched address answers like a snapshot address

def test_every_endpoint_answers_for_a_fetched_address_with_source_live(client: TestClient) -> None:
    fetch(client, A)
    summary = client.post("/api/lookup", json={"address": A}).json()["summary"]
    assert summary["source"] == "live" and summary["txCount"] == 100 and summary["kind"] == "p2pkh"
    listed = {row["address"]: row for row in client.get("/api/addresses").json()["addresses"]}
    assert len(listed) == 29 and listed[A]["source"] == "live" and listed[RUNNING_EXAMPLE]["source"] == "snapshot"

    timeline = client.get(f"/api/addresses/{A}/timeline").json()
    assert timeline["totals"]["txCount"] == 100 and timeline["history"]["status"] == "sufficient"
    assert timeline["snapshot"]["addressCount"] == 28 and timeline["snapshot"]["method"]["id"] == "baseline"
    live = timeline["live"]
    assert (live["transactions"], live["total"], live["maxTx"], live["truncated"]) == (100, 100, 500, False)
    assert live["fetchedAt"].endswith("Z") and len(live["fetchedAt"]) == 20

    rows = client.get(f"/api/addresses/{A}/transactions", params={"pageSize": 200}).json()
    assert rows["total"] == 100
    scored = [row for row in rows["transactions"] if row["status"] != "not-scored"]
    assert scored and len(scored) == timeline["totals"]["scoredCount"]
    detail = client.get(f"/api/transactions/{scored[0]['txid']}", params={"address": A})
    assert detail.status_code == 200 and detail.json()["source"] == "live"
    assert set(detail.json()["scores"]) == set(client.get("/api/methods").json()["methods"][i]["id"] for i in range(9))
    assert detail.json()["scores"]["txgpt_method"] is None and detail.json()["ranks"]["txgpt_method"] is None

    assert client.get(f"/api/addresses/{A}/export", params={"format": "csv"}).status_code == 200
    export = client.get(f"/api/addresses/{A}/export", params={"format": "json"})
    assert export.json()["snapshotDate"] == live["fetchedAt"][:10] and f"-{live['fetchedAt'][:10]}.json" in export.headers["content-disposition"]


def test_the_other_addresses_are_untouched_by_a_fetch(client: TestClient) -> None:
    before = client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").json()
    fetch(client, A)
    assert client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").json() == before
    assert before["live"] is None


def test_a_what_if_on_a_fetched_address_is_scored_against_its_own_history(client: TestClient, predictor: Predictor) -> None:
    fetch(client, A)
    body = {"amountBtc": 50, "direction": "in", "time": "2026-11-12T12:00:00Z"}
    result = client.post(f"/api/addresses/{A}/what-if", json=body)
    assert result.status_code == 200
    answer = result.json()
    assert answer["notAvailable"] == ["txgpt_method"] and "txgpt_method" not in answer["scores"]
    assert answer["scores"]["baseline"] > 3  # 50 BTC is far above this address's usual amount
    curve = client.post(f"/api/addresses/{A}/what-if/curve", json={"direction": "in", "time": "2026-11-12T12:00:00Z"})
    assert curve.status_code == 200 and curve.json()["usualBtc"] > 0
    point = client.post(f"/api/addresses/{A}/what-if/curve", json={"direction": "in", "time": "2026-11-12T12:00:00Z", "amountsBtc": [50]}).json()
    by_id = {m["id"]: m for m in point["methods"]}
    for name, score in answer["scores"].items():  # the curve and the single call agree, regression's own scale included
        assert abs(by_id[name]["scores"][0] - score) < 1e-9, name


def test_a_what_if_before_the_first_transaction_is_422_as_for_the_snapshot(client: TestClient) -> None:
    fetch(client, A)
    response = client.post(f"/api/addresses/{A}/what-if", json={"amountBtc": 1, "direction": "in", "time": "2000-01-01T00:00:00Z"})
    assert response.status_code == 422 and response.json()["status"] == "insufficient_history"


def test_txgpt_has_no_scores_for_a_fetched_address(client: TestClient) -> None:
    fetch(client, A)
    for path in (f"/api/addresses/{A}/timeline", f"/api/addresses/{A}/transactions", f"/api/addresses/{A}/export"):
        response = client.get(path, params={"method": "txgpt_method"})
        assert response.status_code == 400 and response.json()["fields"][0]["name"] == "method", path
        assert (response.json()["message"], response.json()["hint"]) == ("TxGPT has no scores for a fetched address.", "Choose another model.")
    assert client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline", params={"method": "txgpt_method"}).status_code == 200


def test_the_watchlist_works_for_a_fetched_address_and_forgets_it_with_the_address(client: TestClient) -> None:
    fetch(client, A)
    put = client.put(f"/api/watchlist/{A}", json={"label": "Fetched", "note": "from the chain"})
    assert put.status_code == 201 and put.json()["summary"]["source"] == "live"
    assert [e["address"] for e in client.get("/api/watchlist").json()["entries"]] == [A]
    assert client.delete(f"/api/addresses/{A}").status_code == 204
    assert client.get("/api/watchlist").json() == {"entries": []}
    assert client.delete(f"/api/watchlist/{A}").status_code == 404


def test_an_unlisted_watch_entry_does_not_break_the_list_when_its_fetch_expires(client: TestClient) -> None:
    fetch(client, A)
    client.put(f"/api/watchlist/{A}", json={})
    client.app.state.runtime.live._store._clock = lambda: time.time() + 8 * 86_400  # type: ignore[attr-defined]
    assert client.get("/api/watchlist").json() == {"entries": []}


def test_the_response_bodies_pass_the_wording_rule(client: TestClient) -> None:
    done = fetch(client, A)
    texts = [json.dumps(done), client.get(f"/api/addresses/{A}/timeline").text, client.get(f"/api/addresses/{A}/transactions", params={"pageSize": 200}).text,
             json.dumps(events(client, done["id"]))]
    for text in texts:
        assert BANNED.search(text) is None


# ---------------------------------------------------------------- the cap and the truncated history

def test_max_tx_stops_the_fetch_at_the_cap_and_says_the_history_is_cut(client: TestClient, fake: FakeEsplora) -> None:
    fake.total_reported[A] = 1157  # the address has more than the recording holds, as the real one does
    done = fetch(client, A, maxTx=60)
    assert done["progress"] == {"pages": 3, "transactions": 60, "cap": 60, "total": 1157} and done["maxTx"] == 60
    assert len(fake.history_requests()) == 3
    live = client.get(f"/api/addresses/{A}/timeline").json()["live"]
    assert (live["transactions"], live["total"], live["truncated"]) == (60, 1157, True)
    rows = client.get(f"/api/addresses/{A}/transactions", params={"pageSize": 200, "sort": "time"}).json()["transactions"]
    assert len(rows) == 60 and rows[0]["status"] == "not-scored"  # the oldest fetched have no history behind them


def test_the_fetch_keeps_the_most_recent_transactions(client: TestClient, fake: FakeEsplora) -> None:
    fetch(client, A, maxTx=50)
    newest = {tx["txid"] for tx in fake.histories[A][:50]}
    rows = client.get(f"/api/addresses/{A}/transactions", params={"pageSize": 200}).json()["transactions"]
    assert {row["txid"] for row in rows} == newest


def test_max_tx_is_checked_against_the_settings(client: TestClient) -> None:
    for value in (49, 1001, 0, -5):
        response = lookup(client, A, maxTx=value)
        assert response.status_code == 400 and response.json()["fields"] == [{"name": "maxTx", "message": "Must be between 50 and 1000."}]
    assert lookup(client, A, maxTx="many").status_code == 400
    both = client.post("/api/live/lookups", json={"address": 5, "maxTx": 5000})
    assert both.status_code == 400 and {f["name"] for f in both.json()["fields"]} == {"address", "maxTx"}


def test_a_malformed_address_or_an_unknown_field_is_400(client: TestClient) -> None:
    bad = lookup(client, "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb")
    assert bad.status_code == 400 and bad.json()["message"] == "Check the address for a typo."
    assert client.post("/api/live/lookups", json={"address": A, "extra": 1}).status_code == 400
    assert client.post("/api/live/lookups", content=b"not json", headers={"content-type": "application/json"}).status_code == 400
    assert client.post("/api/live/lookups", json={}).status_code == 400


# ---------------------------------------------------------------- upstream failures

def test_an_address_with_no_confirmed_transactions_is_404_not_found(client: TestClient, fake: FakeEsplora) -> None:
    response = lookup(client, "1111111111111111111114oLvT2")  # a valid address that nobody has used
    assert response.status_code == 404 and response.json()["status"] == "not_found"
    assert response.json()["message"] == "This address has no confirmed transactions yet."
    assert lookup(client, A).status_code == 202  # the failed lookup freed the one place


def test_the_service_answering_with_an_error_is_502(client: TestClient, fake: FakeEsplora) -> None:
    fake.fail_on, fake.error = "/address/", EsploraError(500, "https://example.invalid/secret-path", "internal detail")
    response = lookup(client, A)
    assert response.status_code == 502 and response.json()["status"] == "upstream_error"
    assert "example.invalid" not in response.text and "internal detail" not in response.text
    fake.fail_on = None
    assert lookup(client, A).status_code == 202


def test_the_service_not_answering_is_504(client: TestClient, fake: FakeEsplora) -> None:
    fake.fail_on, fake.error = "/address/", EsploraError(None, "https://example.invalid", "timed out")
    response = lookup(client, A)
    assert response.status_code == 504 and response.json()["status"] == "upstream_timeout"


@pytest.mark.parametrize(("error", "status"), [(EsploraError(503, "u", "d"), "upstream_error"), (EsploraError(None, "u", "d"), "upstream_timeout")])
def test_a_failure_during_the_fetch_ends_the_lookup_as_failed_with_the_error(client: TestClient, fake: FakeEsplora, error: EsploraError,
                                                                           status: str) -> None:
    fake.fail_on, fake.error = f"/address/{A}/txs/chain/", error
    started = lookup(client, A)
    assert started.status_code == 202
    ended = finish(client, started.json()["id"])
    assert ended["status"] == "failed" and ended["error"]["status"] == status and ended["error"]["message"] and ended["error"]["hint"]
    assert ended["progress"]["transactions"] == 25  # the first page arrived
    assert client.post("/api/lookup", json={"address": A}).status_code == 404  # nothing was stored
    names = [name for name, _ in events(client, started.json()["id"])]
    assert names[-1] == "failed"
    fake.fail_on = None
    assert fetch(client, A)["status"] == "done"


def test_a_reply_that_cannot_be_read_ends_the_lookup_as_failed(client: TestClient, fake: FakeEsplora) -> None:
    for tx in fake.histories[A]:
        tx["fee"] = None  # the service's reply changed shape
    ended = finish(client, lookup(client, A).json()["id"])
    assert ended["status"] == "failed" and ended["error"]["status"] == "upstream_error"
    assert (ended["error"]["message"], ended["error"]["hint"]) == ("It sent something we can't read.", "Try again in a minute, or pick a snapshot address.")


# ---------------------------------------------------------------- limits

def test_a_lookup_for_an_address_already_running_is_409_and_another_address_waits_with_429(client: TestClient, fake: FakeEsplora) -> None:
    fake.gate = threading.Event()
    first = lookup(client, A)
    assert first.status_code == 202 and fake.waiting.wait(10)
    same = lookup(client, A)
    assert same.status_code == 409 and same.json()["status"] == "conflict"
    assert (same.json()["message"], same.json()["hint"]) == ("This address is already being fetched.", "Wait, or cancel it.")
    other = lookup(client, B)
    assert other.status_code == 429 and other.json()["status"] == "rate_limited" and int(other.headers["retry-after"]) >= 1
    assert (other.json()["message"], other.json()["hint"]) == ("Another fetch is running.", "Try again in a few seconds.")
    assert client.delete(f"/api/addresses/{A}").status_code == 409  # being fetched
    fake.gate.set()
    assert finish(client, first.json()["id"])["status"] == "done"
    assert lookup(client, B).status_code == 202


def test_six_lookups_an_hour_and_the_seventh_waits_with_retry_after(client: TestClient, fake: FakeEsplora) -> None:
    now = [1_000_000.0]
    client.app.state.runtime.live._clock = lambda: now[0]  # type: ignore[attr-defined]
    client.app.state.runtime.live._store._clock = lambda: now[0]  # type: ignore[attr-defined]
    for i, address in enumerate(ADDRESSES[:6]):
        now[0] += 60
        fetch(client, address, maxTx=50)
    now[0] += 60
    refused = lookup(client, ADDRESSES[6])
    assert refused.status_code == 429 and refused.json()["status"] == "rate_limited"
    first_start = 1_000_060
    assert int(refused.headers["retry-after"]) == first_start + 3600 - int(now[0])
    minutes = -(-int(refused.headers["retry-after"]) // 60)
    assert refused.json()["message"] == "6 fetches an hour are allowed."
    assert refused.json()["hint"] == f"Try again in {minutes} minutes, or pick a snapshot address."
    now[0] = first_start + 3600  # an hour after the first, one place is free
    assert lookup(client, ADDRESSES[6], maxTx=50).status_code == 202


def test_a_fresh_cached_fetch_answers_200_at_once_without_a_request_or_a_place(client: TestClient, fake: FakeEsplora) -> None:
    first = fetch(client, A)
    sent = len(fake.requests)
    again = lookup(client, A)
    assert again.status_code == 200
    body = again.json()
    assert body["status"] == "done" and body["cached"] is True and body["id"] != first["id"] and body["finishedAt"]
    assert len(fake.requests) == sent
    assert [name for name, _ in events(client, body["id"])] == ["done"]
    assert client.get(f"/api/live/lookups/{body['id']}").json()["cached"] is True


def test_a_fetch_older_than_the_cache_days_is_fetched_again(client: TestClient, fake: FakeEsplora) -> None:
    now = [2_000_000.0]
    live = client.app.state.runtime.live
    live._clock = lambda: now[0]
    live._store._clock = lambda: now[0]
    fetch(client, A)
    sent = len(fake.requests)
    now[0] += 6.9 * 86_400
    assert lookup(client, A).status_code == 200 and len(fake.requests) == sent
    now[0] += 0.2 * 86_400
    assert client.post("/api/lookup", json={"address": A}).status_code == 404  # expired: unknown again
    assert fetch(client, A)["cached"] is False and len(fake.requests) > sent


def test_a_cut_fetch_does_not_answer_a_request_for_more(client: TestClient, fake: FakeEsplora) -> None:
    fake.total_reported[A] = 1157
    fetch(client, A, maxTx=50)
    assert lookup(client, A, maxTx=50).status_code == 200  # the same cap: the cache serves it
    sent = len(fake.requests)
    wider = lookup(client, A, maxTx=100)
    assert wider.status_code == 202 and finish(client, wider.json()["id"])["status"] == "done" and len(fake.requests) > sent


# ---------------------------------------------------------------- cancellation

def test_e19_cancels_a_running_lookup_and_nothing_is_kept(client: TestClient, fake: FakeEsplora) -> None:
    fake.gate = threading.Event()
    started = lookup(client, A).json()
    assert fake.waiting.wait(10)
    assert client.delete(f"/api/live/lookups/{started['id']}").status_code == 204
    assert client.get(f"/api/live/lookups/{started['id']}").json()["status"] == "cancelled"
    fake.gate.set()
    time.sleep(0.2)
    ended = client.get(f"/api/live/lookups/{started['id']}").json()
    assert ended["status"] == "cancelled" and ended["finishedAt"]
    assert client.post("/api/lookup", json={"address": A}).status_code == 404
    assert len(fake.history_requests()) == 2  # the fetch stopped at the page it was on
    last = events(client, started["id"])[-1]
    assert last[0] == "status" and last[1]["status"] == "cancelled"
    assert lookup(client, A).status_code == 202  # the place is free again


def test_cancelling_a_finished_lookup_changes_nothing(client: TestClient) -> None:
    done = fetch(client, A)
    assert client.delete(f"/api/live/lookups/{done['id']}").status_code == 204
    assert client.get(f"/api/live/lookups/{done['id']}").json()["status"] == "done"
    assert client.post("/api/lookup", json={"address": A}).status_code == 200


# ---------------------------------------------------------------- E18

def test_e18_streams_status_progress_then_done_each_the_body_of_e17(client: TestClient) -> None:
    started = lookup(client, A).json()
    stream = events(client, started["id"])
    names = [name for name, _ in stream]
    assert names[0] == "status" and names[-1] == "done"
    assert names.count("progress") == 4 and "scoring" in [body["status"] for _, body in stream]
    assert [body["progress"]["pages"] for name, body in stream if name == "progress"] == [1, 2, 3, 4]
    assert [body["progress"]["transactions"] for name, body in stream if name == "progress"] == [25, 50, 75, 100]
    for _, body in stream:
        assert LiveLookup.model_validate(body).id == started["id"]
    assert stream[-1][1] == client.get(f"/api/live/lookups/{started['id']}").json()


def test_a_client_that_connects_after_the_end_is_replayed_everything(client: TestClient) -> None:
    done = fetch(client, A)
    assert [name for name, _ in events(client, done["id"])][-1] == "done"
    assert len(events(client, done["id"])) >= 6


def test_e18_delivers_each_event_as_it_happens_not_when_the_stream_ends(client: TestClient, fake: FakeEsplora) -> None:
    """The ETag middleware holds back a response marked `no-cache` until its body is complete: the stream must not be one."""
    fake.gate = threading.Event()
    started = lookup(client, A).json()
    assert fake.waiting.wait(10)  # the job is stuck at its second page
    names: list[str] = []
    with client.stream("GET", f"/api/live/lookups/{started['id']}/events") as response:
        assert "etag" not in response.headers and response.headers["cache-control"] != "no-cache"
        for line in response.iter_lines():
            if line.startswith("event: "):
                names.append(line.removeprefix("event: "))
            if "progress" in names:
                break
    assert names[:2] == ["status", "progress"] and not fake.gate.is_set()
    fake.gate.set()
    finish(client, started["id"])


def test_e18_sends_a_comment_line_when_nothing_happens(client: TestClient, fake: FakeEsplora) -> None:
    client.app.state.runtime.live.keepalive_seconds = 0.2  # type: ignore[attr-defined]
    fake.gate = threading.Event()
    started = lookup(client, A).json()
    assert fake.waiting.wait(10)
    seen = []
    with client.stream("GET", f"/api/live/lookups/{started['id']}/events") as response:
        for line in response.iter_lines():
            seen.append(line)
            if line.startswith(": keep-alive"):
                break
    assert ": keep-alive" in seen
    fake.gate.set()
    finish(client, started["id"])


def test_e18_ends_with_failed_when_the_fetch_fails(client: TestClient, fake: FakeEsplora) -> None:
    fake.fail_on, fake.error = f"/address/{A}/txs/chain/", EsploraError(500, "u", "d")
    stream = events(client, lookup(client, A).json()["id"])
    assert stream[-1][0] == "failed" and stream[-1][1]["error"]["status"] == "upstream_error"


# ---------------------------------------------------------------- E20 and the cache on disk

def test_e20_forgets_a_fetched_address_and_its_file(start: Callable[..., TestClient], tmp_path: Path) -> None:
    database = tmp_path / "explorer.db"
    client = start(database)
    fetch(client, A)
    file = tmp_path / "live" / f"{A}.json.gz"
    assert file.is_file()
    assert client.delete(f"/api/addresses/{A}").status_code == 204
    assert not file.exists()
    assert client.post("/api/lookup", json={"address": A}).status_code == 404
    assert len(client.get("/api/addresses").json()["addresses"]) == 28
    again = client.delete(f"/api/addresses/{A}")
    assert again.status_code == 404 and again.json()["status"] == "unsupported"


def test_e16_refuses_a_snapshot_address_before_any_request_or_file(start: Callable[..., TestClient], fake: FakeEsplora,
                                                                  tmp_path: Path) -> None:
    client = start(tmp_path / "explorer.db")
    refused = lookup(client, RUNNING_EXAMPLE)
    assert refused.status_code == 409 and refused.json()["status"] == "conflict"
    assert refused.json()["message"] and refused.json()["hint"]
    assert fake.requests == []  # the public service was never asked
    assert list((tmp_path / "live").glob("*.json.gz")) == []
    listed = [row["address"] for row in client.get("/api/addresses").json()["addresses"]]
    assert len(listed) == 28 and len(set(listed)) == 28
    fetch(client, A)  # the refused request did not use the hour's allowance
    assert client.delete(f"/api/addresses/{RUNNING_EXAMPLE}").status_code == 409


def test_the_hourly_allowance_is_not_spent_by_a_snapshot_address(live_settings: Settings, start: Callable[..., TestClient]) -> None:
    limit = live_settings.web.live.lookups_per_hour
    client = start()
    for _ in range(limit + 2):
        assert lookup(client, RUNNING_EXAMPLE).status_code == 409
    assert lookup(client, A).status_code == 202


def test_e20_refuses_a_snapshot_address_and_a_malformed_one(client: TestClient) -> None:
    refused = client.delete(f"/api/addresses/{RUNNING_EXAMPLE}")
    assert refused.status_code == 409 and refused.json()["status"] == "conflict"
    assert refused.json()["message"] == "Snapshot addresses cannot be removed."
    assert client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").status_code == 200
    assert client.delete("/api/addresses/not-an-address").status_code == 400
    assert client.delete(f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}").status_code == 404


def test_a_fetched_address_survives_a_restart_and_scores_the_same(start: Callable[..., TestClient], tmp_path: Path) -> None:
    database = tmp_path / "explorer.db"
    first = start(database)
    fetch(first, A)
    before = first.get(f"/api/addresses/{A}/transactions", params={"pageSize": 200}).json()
    timeline = first.get(f"/api/addresses/{A}/timeline").json()
    first.__exit__(None, None, None)
    second = start(database)
    assert second.get(f"/api/addresses/{A}/transactions", params={"pageSize": 200}).json() == before
    assert second.get(f"/api/addresses/{A}/timeline").json() == timeline
    assert lookup(second, A).status_code == 200  # still fresh


def test_an_expired_or_damaged_cache_file_is_removed_at_start(start: Callable[..., TestClient], tmp_path: Path) -> None:
    live = tmp_path / "live"
    live.mkdir()
    (live / f"{B}.json.gz").write_bytes(b"not gzip")
    client = start(tmp_path / "explorer.db")
    assert not (live / f"{B}.json.gz").exists() and len(client.get("/api/addresses").json()["addresses"]) == 28


def test_a_new_fetch_of_an_address_is_not_served_from_the_older_cache_entry(client: TestClient, fake: FakeEsplora) -> None:
    now = [3_000_000.0]
    live = client.app.state.runtime.live
    live._clock = lambda: now[0]
    live._store._clock = lambda: now[0]
    fake.total_reported[A] = 1157
    fetch(client, A, maxTx=50)
    assert client.get(f"/api/addresses/{A}/timeline").json()["totals"]["txCount"] == 50
    now[0] += 5
    fetch(client, A, maxTx=100)
    assert client.get(f"/api/addresses/{A}/timeline").json()["totals"]["txCount"] == 100


def test_a_short_history_shows_the_insufficient_state_with_its_rows_unscored(client: TestClient, fake: FakeEsplora) -> None:
    fake.histories[B] = fake.histories[B][:5]
    fetch(client, B)
    timeline = client.get(f"/api/addresses/{B}/timeline").json()
    assert timeline["history"]["status"] == "insufficient" and timeline["totals"]["scoredCount"] == 0 and timeline["live"]["truncated"] is False
    rows = client.get(f"/api/addresses/{B}/transactions").json()["transactions"]
    assert len(rows) == 5 and {row["status"] for row in rows} == {"not-scored"}
    assert client.get(f"/api/transactions/{rows[0]['txid']}", params={"address": B}).status_code == 422


# ---------------------------------------------------------------- the scoring itself (Mod-11)

def test_the_recording_round_trips_through_the_services_own_trimming() -> None:
    for tx in recorded():
        assert trim_tx(inflate(tx, RECORDED_ADDRESS), RECORDED_ADDRESS) == tx


def test_a_snapshot_address_pushed_through_the_live_route_scores_as_the_snapshot_does(predictor: Predictor, addresses: list[str]) -> None:
    """The clean table of three snapshot addresses (the long one, a mid-sized one, a short one), scored as a fetched address:
    the same scorable rows, the same periods, flags equal, and scores equal to the saved ones to 1e-9. This holds the live
    pipeline (features as saved, a 70% split, each method frozen, the regression's scale from the address's own fit period)
    to Assignment 2's own result for the same transactions."""
    fetch = LiveFetch("2026-11-12T00:00:00Z", 0, 500, 0, 0, False)
    for address in (RUNNING_EXAMPLE, "36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L", "bc1qx2stewzm2cel6ytwzraxt9z4d9vlh8e5gdnun6"):
        clean = predictor.transactions[predictor.transactions["address"] == address].reset_index(drop=True)
        data = score_transactions(predictor, clean, fetch)
        saved = predictor.scores[predictor.scores["address"] == address].set_index("txid")
        stored = predictor.features[predictor.features["address"] == address].set_index("txid")
        mine = data.scores.set_index("txid")
        assert (data.features["scorable"].to_numpy() == stored.loc[data.features.index, "scorable"].to_numpy()).all()
        assert (data.features["period"].to_numpy() == stored.loc[data.features.index, "period"].to_numpy()).all()
        for name in predictor.methods:
            if name in PRECOMPUTED_ONLY:
                assert mine[f"score_{name}"].isna().all() and not mine[f"flag_{name}"].any()
                continue
            assert (mine[f"flag_{name}"] == saved.loc[mine.index, f"flag_{name}"]).all(), (address, name)
            both = pd.concat([mine[f"score_{name}"], saved.loc[mine.index, f"score_{name}"]], axis=1).dropna()
            assert ((both.iloc[:, 0] - both.iloc[:, 1]).abs() < 1e-9).all(), (address, name)


def test_the_regression_scale_of_a_fetched_address_comes_from_its_own_fit_period(predictor: Predictor) -> None:
    clean = predictor.transactions[predictor.transactions["address"] == RUNNING_EXAMPLE].reset_index(drop=True)
    data = score_transactions(predictor, clean, LiveFetch("x", 0, 500, 0, 0, False))
    saved = predictor.methods["regression"]
    own = data.methods["regression"]  # type: ignore[index]
    elsewhere = replace_scales(saved, {"size": {"another": 1.0}, "gap": {"another": 1.0}})
    adapted = adapt(elsewhere, data.features[data.features["period"] == "fit"])
    assert set(adapted.scales["size"]) == {RUNNING_EXAMPLE} and set(own.scales["gap"]) == {RUNNING_EXAMPLE}  # type: ignore[attr-defined]
    for target in ("size", "gap"):  # the saved models hold the same per-address scale: the rule is the training's own
        assert adapted.scales[target][RUNNING_EXAMPLE] == pytest.approx(saved.scales[target][RUNNING_EXAMPLE], rel=1e-9)  # type: ignore[attr-defined]
        assert own.scales[target][RUNNING_EXAMPLE] == pytest.approx(adapted.scales[target][RUNNING_EXAMPLE], rel=1e-9)  # type: ignore[attr-defined]
        fused = data.methods["fusion"].components["regression"].scales[target][RUNNING_EXAMPLE]  # type: ignore[index, attr-defined]
        assert fused == pytest.approx(own.scales[target][RUNNING_EXAMPLE], rel=1e-9)  # type: ignore[attr-defined]


def replace_scales(method: Any, scales: dict[str, dict[str, float]]) -> Any:
    from explorer.regression import RegressionMethod
    return RegressionMethod(method.models, scales, method.default_scale)


def test_score_history_cleans_amounts_the_way_the_snapshot_does(predictor: Predictor) -> None:
    fetched = LiveFetch("x", 0, 500, 100, 100, False)
    data = score_history(predictor, RECORDED_ADDRESS, recorded(), fetched)
    one = recorded()[0]
    row = data.transactions.set_index("txid").loc[one["txid"]]
    assert row["received_sats"] == sum(o["value"] for o in one["vout"]) and row["sent_sats"] == sum(i["prevout"]["value"] for i in one["vin"])
    assert row["net_sats"] == row["received_sats"] - row["sent_sats"] and (row["n_inputs"], row["n_outputs"]) == (one["n_vin"], one["n_vout"])
    assert data.source == "live" and data.fetched is fetched and len(data.features) == 100


# ---------------------------------------------------------------- the real service (opt-in)

@pytest.mark.slow
@pytest.mark.skipif(not __import__("os").environ.get("LIVE_NETWORK"), reason="set LIVE_NETWORK=1 to read from the real public service")
def test_a_real_lookup_reads_the_public_service(live_settings: Settings, predictor: Predictor, tmp_path: Path,
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.undo()  # the no-network guard is for the other tests
    with TestClient(create_app(live_settings, lambda: predictor, False, tmp_path / "explorer.db")) as client:
        wait_until_ready(client)
        done = fetch(client, RECORDED_ADDRESS, maxTx=50)
        assert done["progress"]["transactions"] == 50
        assert client.get(f"/api/addresses/{RECORDED_ADDRESS}/timeline").json()["live"]["transactions"] == 50
