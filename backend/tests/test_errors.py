"""T08: every failure answers with the one error body, and never leaks a library's text or a path."""
from __future__ import annotations

from collections.abc import Callable

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.core.errors import InvalidRequest, NotFound, Unavailable, _describe
from app.schemas.errors import FieldError
from app.schemas.whatif import WhatIfRequest
from explorer.explain import check_wording
from explorer.predict import InsufficientHistory, Unsupported

from .conftest import RUNNING_EXAMPLE

SECRET = "/Users/someone/secret/path.csv"
HISTORY_BODY = {"status": "insufficient_history", "message": "There is no earlier history at that time.",
                "history": {"earlierTx": 0, "spanDays": 0.0, "required": {"minTx": 10, "minSpanDays": 14}},
                "firstScoredDate": None}


def raise_(exc: Exception) -> Callable[[], None]:
    def route() -> None:
        raise exc
    return route


@pytest.fixture
def rigged(make_client: Callable[..., TestClient]) -> TestClient:
    """The real app plus routes that raise what services raise."""
    client = make_client()
    router = APIRouter()
    for path, exc in {
        "/unsupported": Unsupported(f"{SECRET} is not in the snapshot"),
        "/insufficient": InsufficientHistory("too little", HISTORY_BODY),
        "/value": ValueError(f"bad value in {SECRET}"),
        "/file": FileNotFoundError(SECRET),
        "/boom": RuntimeError(f"library failure at {SECRET}"),
        "/invalid": InvalidRequest("This address fails its checksum.", "Check it.", [FieldError(name="address", message="Bad.")]),
        "/notfound": NotFound("That transaction is not at this address."),
        "/unavailable": Unavailable("Not yet."),
    }.items():
        router.add_api_route(path, raise_(exc))

    @router.post("/what-if")
    def what_if(body: WhatIfRequest) -> dict:
        return {}

    @router.get("/page")
    def page(page: int = 1) -> dict:
        return {}

    client.app.include_router(router)  # type: ignore[attr-defined]
    return client


def test_unsupported_is_404_with_the_coverage_sentence_and_three_examples(rigged: TestClient) -> None:
    response = rigged.get("/unsupported")
    body = response.json()
    assert response.status_code == 404 and body["status"] == "unsupported"
    assert body["message"] == "This address is not one of the 28 in the snapshot."
    assert body["examples"] == ["36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L", "3HTmUj5wFDQZ2TF8SAcngV7EQ88rptx35D",
                                "35ZCxf5uyfc2VN194t8WRzz6RCEN6tQfmY"]
    assert body["canLookupLive"] is False


def test_insufficient_history_is_422_and_keeps_an_explicit_null(rigged: TestClient) -> None:
    response = rigged.get("/insufficient")
    body = response.json()
    assert response.status_code == 422 and body["status"] == "insufficient_history"
    assert body["history"] == HISTORY_BODY["history"]
    assert "firstScoredDate" in body and body["firstScoredDate"] is None


def test_value_error_is_400_without_its_own_text(rigged: TestClient) -> None:
    response = rigged.get("/value")
    assert response.status_code == 400 and response.json()["status"] == "invalid"
    assert SECRET not in response.text


def test_missing_file_is_503_without_the_path(rigged: TestClient) -> None:
    response = rigged.get("/file")
    assert response.status_code == 503 and response.json()["status"] == "unavailable"
    assert SECRET not in response.text
    assert (response.json()["message"], response.json()["hint"]) == ("A data file is missing.", "Try again, or tell the team.")


def test_anything_else_is_500_with_a_fixed_message_and_the_identifier(rigged: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("ERROR", logger="app")
    response = rigged.get("/boom", headers={"X-Request-ID": "abc12345def6"})
    body = response.json()
    assert response.status_code == 500 and body["status"] == "server_error"
    assert body["requestId"] == "abc12345def6" == response.headers["X-Request-ID"]
    assert SECRET not in response.text and "Traceback" not in response.text
    assert SECRET in caplog.text and "abc12345def6" in caplog.text  # the trace goes to the log, under the same identifier


def test_the_service_exceptions_map_to_their_statuses(rigged: TestClient) -> None:
    invalid = rigged.get("/invalid")
    assert invalid.status_code == 400
    assert invalid.json()["fields"] == [{"name": "address", "message": "Bad."}] and invalid.json()["hint"] == "Check it."
    assert rigged.get("/notfound").status_code == 404 and rigged.get("/notfound").json()["status"] == "not_found"
    assert rigged.get("/unavailable").status_code == 503


def test_an_unknown_path_and_a_wrong_method_use_the_body(rigged: TestClient) -> None:
    assert rigged.get("/api/nothing").json()["status"] == "not_found"
    wrong = rigged.post("/api/health")
    assert wrong.status_code == 405 and wrong.json()["status"] == "invalid" and "requestId" in wrong.json()


def test_a_wrong_type_is_400_with_fields_never_422(rigged: TestClient) -> None:
    response = rigged.post("/what-if", json={"amountBtc": 0, "direction": "sideways", "time": "tomorrow"})
    body = response.json()
    assert response.status_code == 400 and body["status"] == "invalid"
    assert body["message"] == "Three values need correcting."
    assert {f["name"] for f in body["fields"]} == {"amountBtc", "direction", "time"}
    by_name = {f["name"]: f["message"] for f in body["fields"]}
    assert by_name["direction"] == "Pick Sent or Received."
    assert by_name["time"] == "Enter a valid date and time."
    assert "input" not in response.text.lower() or "Input should" not in response.text


def test_unknown_missing_and_unparsable_bodies(rigged: TestClient) -> None:
    good = {"amountBtc": 1, "direction": "in", "time": "2026-10-20T12:00:00Z"}
    unknown = rigged.post("/what-if", json={**good, "colour": "red"})
    assert unknown.status_code == 400 and unknown.json()["fields"] == [{"name": "colour", "message": "Not a known field."}]
    missing = rigged.post("/what-if", json={})
    assert missing.status_code == 400 and len(missing.json()["fields"]) == 3
    broken = rigged.post("/what-if", content="{not json", headers={"Content-Type": "application/json"})
    assert broken.status_code == 400 and broken.json()["message"] == "The request body is not valid JSON."
    not_json = rigged.post("/what-if", content="amountBtc=1", headers={"Content-Type": "text/plain"})
    assert not_json.status_code == 415 and not_json.json()["status"] == "invalid"
    array = rigged.post("/what-if", json=[1, 2])
    assert array.status_code == 400 and array.json()["message"] == "The request body must be a JSON object."


def test_a_bad_query_parameter_is_named(rigged: TestClient) -> None:
    body = rigged.get("/page?page=abc").json()
    assert body["fields"] == [{"name": "page", "message": "Must be a whole number."}]


def test_every_error_text_passes_the_wording_rule(rigged: TestClient) -> None:
    for path in ("/unsupported", "/insufficient", "/value", "/file", "/boom", "/invalid", "/notfound", "/unavailable",
                 "/api/nothing", "/page?page=abc"):
        body = rigged.get(path).json()
        for text in (body["message"], body.get("hint", ""), *(f["message"] for f in body.get("fields", []))):
            check_wording(text)


def test_a_non_text_note_on_the_watchlist_says_the_type_is_wrong(client: TestClient) -> None:
    response = client.put(f"/api/watchlist/{RUNNING_EXAMPLE}", json={"note": 5})
    body = response.json()
    assert response.status_code == 400 and body["status"] == "invalid"
    assert {"name": "note", "message": "Must be text."} in body["fields"]


@pytest.mark.parametrize("error, expected", [
    ({"type": "string_type", "ctx": {}}, "Must be text."),
    ({"type": "string_too_short", "ctx": {"min_length": 3}}, "Must be at least 3 characters."),
    ({"type": "string_too_short", "ctx": {"min_length": 1}}, "Must be at least 1 character."),
    ({"type": "string_too_long", "ctx": {"max_length": 40}}, "Must be at most 40 characters."),
    ({"type": "string_too_long", "ctx": {"max_length": 1}}, "Must be at most 1 character."),
    ({"type": "list_type", "ctx": {}}, "Must be a list."),
    ({"type": "too_short", "ctx": {"min_length": 2}}, "Must have at least 2 items."),
    ({"type": "too_short", "ctx": {"min_length": 1}}, "Must have at least 1 item."),
    ({"type": "too_long", "ctx": {"max_length": 5}}, "Must have at most 5 items."),
    ({"type": "too_long", "ctx": {"max_length": 1}}, "Must have at most 1 item."),
])
def test_describe_names_the_type_or_the_limit(error: dict, expected: str) -> None:
    assert _describe(error) == expected
    check_wording(expected)


@pytest.mark.parametrize("error, expected", [
    ({"type": "string_too_short"}, "Must be text of an acceptable length."),
    ({"type": "string_too_long", "ctx": {}}, "Must be text of an acceptable length."),
    ({"type": "too_short"}, "Must be a list of an acceptable length."),
    ({"type": "too_long", "ctx": {}}, "Must be a list of an acceptable length."),
])
def test_describe_falls_back_to_the_old_wording_when_the_limit_is_missing(error: dict, expected: str) -> None:
    assert _describe(error) == expected
