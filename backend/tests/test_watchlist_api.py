"""S-04: E13 to E15 answer each status of plan section 6.2, keep the limits of settings.json, survive a restart and stay consistent
under concurrent requests."""
from __future__ import annotations

import re
import sqlite3
import threading
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.services.watchlist_repo import WatchlistFull, WatchlistRepo

from .conftest import LARGEST, RUNNING_EXAMPLE, VALID_OUTSIDE_SNAPSHOT
from .test_wording import BANNED

MAKE = Callable[..., TestClient]
THIRD = "3HTmUj5wFDQZ2TF8SAcngV7EQ88rptx35D"
TIME = re.compile(r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$")


def put(client: TestClient, address: str = RUNNING_EXAMPLE, **body: Any) -> Any:
    return client.put(f"/api/watchlist/{address}", json=body)


def small_list(settings: Settings, max_entries: int) -> Settings:
    return replace(settings, web=settings.web.model_copy(update={"watchlist": settings.web.watchlist.model_copy(update={"max_entries": max_entries})}))


# ---------------------------------------------------------------- E13, E14

def test_e13_an_empty_list_is_200_with_no_entries(client: TestClient) -> None:
    response = client.get("/api/watchlist")
    assert response.status_code == 200 and response.json() == {"entries": []}
    assert "etag" not in response.headers


def test_e14_a_new_entry_is_201_with_its_summary_and_e13_lists_it(client: TestClient) -> None:
    response = put(client, label="Running example", note="Seen in the plan.")
    assert response.status_code == 201
    entry = response.json()
    assert set(entry) == {"address", "label", "note", "addedAt", "updatedAt", "summary"}
    assert (entry["address"], entry["label"], entry["note"]) == (RUNNING_EXAMPLE, "Running example", "Seen in the plan.")
    assert TIME.match(entry["addedAt"]) and entry["updatedAt"] == entry["addedAt"]
    assert entry["summary"] == client.post("/api/lookup", json={"address": RUNNING_EXAMPLE}).json()["summary"]
    assert client.get("/api/watchlist").json() == {"entries": [entry]}


def test_e14_a_replaced_entry_is_200_and_keeps_when_it_was_added(client: TestClient) -> None:
    first = put(client, label="One", note="a").json()
    second = put(client, label="Two", note="b")
    assert second.status_code == 200
    body = second.json()
    assert (body["label"], body["note"], body["addedAt"]) == ("Two", "b", first["addedAt"]) and body["updatedAt"] >= first["updatedAt"]
    assert len(client.get("/api/watchlist").json()["entries"]) == 1


def test_e14_label_and_note_are_optional_and_default_to_empty(client: TestClient) -> None:
    body = put(client).json()
    assert (body["label"], body["note"]) == ("", "")


def test_e14_the_label_and_the_note_may_be_exactly_at_their_limits(client: TestClient, settings: Settings) -> None:
    limits = settings.web.watchlist
    response = put(client, label="é" * limits.max_label_chars, note="n" * limits.max_note_chars)
    assert response.status_code == 201 and len(response.json()["label"]) == limits.max_label_chars


def test_e13_lists_the_most_recently_added_first(client: TestClient) -> None:
    for address in (RUNNING_EXAMPLE, LARGEST, THIRD):
        assert put(client, address).status_code == 201
    entries = client.get("/api/watchlist").json()["entries"]
    assert sorted((e["addedAt"] for e in entries), reverse=True) == [e["addedAt"] for e in entries]
    assert {e["address"] for e in entries} == {RUNNING_EXAMPLE, LARGEST, THIRD}


def test_e14_the_address_is_stored_as_given_by_the_checker(client: TestClient) -> None:
    upper = "BC1QX2STEWZM2CEL6YTWZRAXT9Z4D9VLH8E5GDNUN6"  # a valid address in upper case: the checker normalises it
    assert put(client, upper).json()["address"] == "bc1qx2stewzm2cel6ytwzraxt9z4d9vlh8e5gdnun6"


# ---------------------------------------------------------------- E14: errors

def test_e14_an_address_that_cannot_be_opened_is_404_unsupported(client: TestClient) -> None:
    response = put(client, VALID_OUTSIDE_SNAPSHOT, label="x")
    body = response.json()
    assert response.status_code == 404 and body["status"] == "unsupported" and len(body["examples"]) == 3
    assert client.get("/api/watchlist").json() == {"entries": []}


def test_e14_a_malformed_address_is_400(client: TestClient) -> None:
    response = put(client, "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy")
    assert response.status_code == 400 and response.json()["status"] == "invalid"


def test_e14_a_label_and_note_over_their_limits_are_a_400_naming_both(client: TestClient, settings: Settings) -> None:
    limits = settings.web.watchlist
    response = put(client, label="x" * (limits.max_label_chars + 1), note="y" * (limits.max_note_chars + 1))
    body = response.json()
    assert response.status_code == 400 and body["status"] == "invalid" and body["message"] == "Two values need correcting."
    assert body["fields"] == [{"name": "label", "message": f"Must be at most {limits.max_label_chars} characters."},
                              {"name": "note", "message": f"Must be at most {limits.max_note_chars} characters."}]
    assert client.get("/api/watchlist").json() == {"entries": []}


def test_e14_a_wrong_type_and_a_limit_are_named_together(client: TestClient, settings: Settings) -> None:
    """Pydantic stops at the type of `label`; the service's limit on `note` is applied to what did parse."""
    response = put(client, label=5, note="y" * (settings.web.watchlist.max_note_chars + 1))
    names = [f["name"] for f in response.json()["fields"]]
    assert response.status_code == 400 and names == ["label", "note"]


@pytest.mark.parametrize("body", [{"label": None}, {"note": 3}, {"label": ["a"]}, {"colour": "red"}])
def test_e14_a_wrong_type_or_an_unknown_field_is_a_400_with_fields(client: TestClient, body: dict[str, Any]) -> None:
    response = put(client, **body)
    assert response.status_code == 400 and response.json()["fields"] and response.json()["status"] == "invalid"


def test_e14_a_body_that_is_not_json_is_a_400_or_415(client: TestClient) -> None:
    assert client.put(f"/api/watchlist/{RUNNING_EXAMPLE}", content="{oops", headers={"Content-Type": "application/json"}).status_code == 400
    assert client.put(f"/api/watchlist/{RUNNING_EXAMPLE}", content="label=x").status_code == 415


def test_e14_a_full_list_is_409_conflict_for_a_new_entry_but_a_replacement_still_works(make_client: MAKE, settings: Settings) -> None:
    client = make_client(app_settings=small_list(settings, 2))
    assert put(client, RUNNING_EXAMPLE).status_code == 201 and put(client, LARGEST).status_code == 201
    full = put(client, THIRD, label="three")
    assert full.status_code == 409 and full.json()["status"] == "conflict" and "full" in full.json()["message"]
    assert put(client, LARGEST, label="renamed").status_code == 200
    assert len(client.get("/api/watchlist").json()["entries"]) == 2
    assert client.delete(f"/api/watchlist/{LARGEST}").status_code == 204
    assert put(client, THIRD).status_code == 201


def test_e14_the_default_limit_is_200_from_settings(settings: Settings) -> None:
    assert (settings.web.watchlist.max_entries, settings.web.watchlist.max_label_chars, settings.web.watchlist.max_note_chars) == (200, 40, 500)


def test_e14_a_body_over_the_size_limit_is_413(client: TestClient, settings: Settings) -> None:
    response = client.put(f"/api/watchlist/{RUNNING_EXAMPLE}", json={"note": "x" * (settings.web.limits.max_body_bytes + 1)})
    assert response.status_code == 413 and response.json()["status"] == "too_large"


# ---------------------------------------------------------------- E15

def test_e15_removes_an_entry_with_204_and_no_body(client: TestClient) -> None:
    put(client, label="x")
    response = client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}")
    assert response.status_code == 204 and response.content == b""
    assert client.get("/api/watchlist").json() == {"entries": []}


def test_e15_an_address_not_on_the_list_is_404_not_found(client: TestClient) -> None:
    for address in (RUNNING_EXAMPLE, VALID_OUTSIDE_SNAPSHOT):
        response = client.delete(f"/api/watchlist/{address}")
        assert response.status_code == 404 and response.json()["status"] == "not_found"
    assert client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}").status_code == 404


def test_e15_a_malformed_address_is_400(client: TestClient) -> None:
    assert client.delete("/api/watchlist/not-an-address").status_code == 400


def test_a_second_delete_after_the_first_is_404(client: TestClient) -> None:
    put(client)
    assert client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}").status_code == 204
    assert client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}").status_code == 404


def test_the_routes_refuse_the_other_methods(client: TestClient) -> None:
    assert client.post("/api/watchlist", json={}).status_code == 405
    assert client.get(f"/api/watchlist/{RUNNING_EXAMPLE}").status_code == 405


# ---------------------------------------------------------------- the file, the threads, the start

def test_entries_survive_a_restart(make_client: MAKE, tmp_path: Path) -> None:
    file = tmp_path / "var" / "explorer.db"  # the folder does not exist yet: the service creates it
    first = make_client(database=file)
    put(first, label="kept", note="still here")
    assert file.exists()
    second = make_client(database=file)
    assert [e["label"] for e in second.get("/api/watchlist").json()["entries"]] == ["kept"]


def test_the_service_starts_while_the_models_load_and_answers_503_until_ready(make_client: MAKE, predictor: Any) -> None:
    started, release = threading.Event(), threading.Event()

    def slow() -> Any:
        started.set()
        release.wait(10)
        return predictor

    client = make_client(loader=slow)
    started.wait(5)
    try:
        assert client.get("/api/watchlist").status_code == 503
        assert client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}").status_code == 503
    finally:
        release.set()


def test_concurrent_puts_never_exceed_the_limit_and_count_each_new_entry_once(tmp_path: Path) -> None:
    repo = WatchlistRepo(tmp_path / "explorer.db", max_entries=10)
    outcomes: list[str] = []

    def add(n: int) -> None:
        try:
            outcomes.append("new" if repo.put(f"addr{n % 25}", "l", "n")[1] else "replaced")
        except WatchlistFull:
            outcomes.append("full")

    threads = [threading.Thread(target=add, args=(n,)) for n in range(100)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert len(repo.list()) == 10 and outcomes.count("new") == 10 and len(outcomes) == 100
    repo.close()


def test_concurrent_requests_through_the_app_leave_one_consistent_list(make_client: MAKE) -> None:
    client = make_client()
    codes: list[int] = []

    def work(i: int) -> None:
        address = (RUNNING_EXAMPLE, LARGEST, THIRD)[i % 3]
        codes.append(put(client, address, label=str(i)).status_code if i % 4 else client.delete(f"/api/watchlist/{address}").status_code)

    threads = [threading.Thread(target=work, args=(i,)) for i in range(30)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert set(codes) <= {200, 201, 204, 404}
    entries = client.get("/api/watchlist").json()["entries"]
    assert len({e["address"] for e in entries}) == len(entries) <= 3


def test_the_database_has_the_documented_columns(tmp_path: Path) -> None:
    file = tmp_path / "explorer.db"
    WatchlistRepo(file, 5).close()
    columns = [row[1] for row in sqlite3.connect(file).execute("PRAGMA table_info(watchlist)")]
    assert columns == ["address", "label", "note", "added_at", "updated_at"]


# ---------------------------------------------------------------- wording

def test_no_body_of_e13_to_e15_has_a_banned_word(client: TestClient, settings: Settings) -> None:
    limits = settings.web.watchlist
    texts = [client.get("/api/watchlist").text, put(client, label="Neighbour", note="Worth a look.").text,
             put(client, label="Neighbour 2").text, client.get("/api/watchlist").text,
             put(client, VALID_OUTSIDE_SNAPSHOT).text, put(client, "bad").text, put(client, label="x" * 99, note=5).text,
             put(client, colour=1).text, put(client, label=None).text,
             client.delete(f"/api/watchlist/{VALID_OUTSIDE_SNAPSHOT}").text, client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}").text,
             client.delete(f"/api/watchlist/{RUNNING_EXAMPLE}").text, str(limits)]
    assert [m.group(0) for t in texts if (m := BANNED.search(t))] == []


def test_a_full_list_message_has_no_banned_word(make_client: MAKE, settings: Settings) -> None:
    client = make_client(app_settings=small_list(settings, 1))
    put(client, RUNNING_EXAMPLE)
    assert BANNED.search(put(client, LARGEST).text) is None
