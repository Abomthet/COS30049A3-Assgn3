"""T07 to T12: what the middleware adds to E3 to E7: `ETag` and 304 (plan section 6.1), and the 413 body limit (section 6.3)."""
from __future__ import annotations

import json
from collections.abc import Callable, Iterator
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings

from .conftest import RUNNING_EXAMPLE, VALID_OUTSIDE_SNAPSHOT

FLAGGED_TX = "c91d9fbbd396070099f3147822cd6e1eb97b1de376ad353f42007149ddb73140"
SNAPSHOT_GETS = [
    "/api/addresses",
    f"/api/addresses/{RUNNING_EXAMPLE}/timeline",
    f"/api/addresses/{RUNNING_EXAMPLE}/transactions?status=flagged",
    f"/api/transactions/{FLAGGED_TX}?address={RUNNING_EXAMPLE}",
]


@pytest.mark.parametrize("path", SNAPSHOT_GETS)
def test_snapshot_data_carries_an_etag_and_no_cache(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["etag"].startswith('W/"')
    assert client.get(path).headers["etag"] == response.headers["etag"]


@pytest.mark.parametrize("path", SNAPSHOT_GETS)
def test_a_repeat_request_with_the_etag_costs_a_304_with_no_body(client: TestClient, path: str) -> None:
    etag = client.get(path).headers["etag"]
    for offered in (etag, etag.removeprefix("W/"), f'"other", {etag}', "*"):
        again = client.get(path, headers={"If-None-Match": offered})
        assert again.status_code == 304 and again.content == b""
        assert again.headers["etag"] == etag and again.headers["cache-control"] == "no-cache"
        assert "x-request-id" in again.headers
    assert client.get(path, headers={"If-None-Match": '"stale"'}).status_code == 200


def test_the_etag_changes_with_the_answer(client: TestClient) -> None:
    tags = {client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params=params).headers["etag"]
            for params in ({}, {"page": 2}, {"sort": "-time"}, {"status": "flagged"}, {"method": "fusion"})}
    assert len(tags) == 5


def test_the_etag_is_the_same_for_a_compressed_and_a_plain_answer(client: TestClient) -> None:
    path = f"/api/addresses/{RUNNING_EXAMPLE}/timeline"
    compressed = client.get(path, headers={"Accept-Encoding": "gzip"})
    plain = client.get(path, headers={"Accept-Encoding": "identity"})
    assert compressed.headers.get("content-encoding") == "gzip" and "content-encoding" not in plain.headers
    assert compressed.headers["etag"] == plain.headers["etag"]


def test_other_responses_have_no_etag(client: TestClient) -> None:
    assert "etag" not in client.get("/api/health").headers
    assert "etag" not in client.post("/api/lookup", json={"address": RUNNING_EXAMPLE}).headers
    for path in (f"/api/addresses/{VALID_OUTSIDE_SNAPSHOT}/timeline", "/api/addresses/x/timeline", "/api/nothing",
                 f"/api/transactions/{'0' * 64}?address={RUNNING_EXAMPLE}"):
        response = client.get(path, headers={"If-None-Match": "*"})
        assert response.status_code >= 400 and "etag" not in response.headers


# ---------------------------------------------------------------- the 413 limit


def lookup_body(size: int) -> bytes:
    """A JSON body of exactly `size` bytes whose address is valid."""
    body = json.dumps({"address": RUNNING_EXAMPLE}).encode()
    return body + b" " * (size - len(body))


def test_a_body_at_the_limit_is_read_and_one_byte_over_is_a_413(client: TestClient, settings: Settings) -> None:
    limit = settings.web.limits.max_body_bytes
    json_header = {"content-type": "application/json"}
    assert client.post("/api/lookup", content=lookup_body(limit), headers=json_header).status_code == 200
    over = client.post("/api/lookup", content=lookup_body(limit + 1), headers=json_header)
    assert over.status_code == 413
    body = over.json()
    assert body["status"] == "too_large" and body["requestId"] == over.headers["x-request-id"]
    assert body["message"] == "The request body is larger than the 10 kB limit." and body["hint"]


def test_a_chunked_body_over_the_limit_is_refused_too(client: TestClient, settings: Settings) -> None:
    def chunks() -> Iterator[bytes]:
        for _ in range(settings.web.limits.max_body_bytes // 1000 + 2):
            yield b" " * 1000

    response = client.post("/api/lookup", content=chunks(), headers={"content-type": "application/json"})
    assert response.status_code == 413 and response.json()["status"] == "too_large"


def test_the_limit_comes_from_settings(make_client: Callable[..., TestClient], settings: Settings) -> None:
    tight = replace(settings, web=settings.web.model_copy(update={"limits": settings.web.limits.model_copy(update={"max_body_bytes": 64})}))
    client = make_client(app_settings=tight)
    assert client.post("/api/lookup", json={"address": RUNNING_EXAMPLE}).status_code == 200
    refused = client.post("/api/lookup", content=lookup_body(65), headers={"content-type": "application/json"})
    assert refused.status_code == 413 and refused.json()["message"] == "The request body is larger than the 0.0625 kB limit."


def test_a_413_carries_the_cors_headers_so_the_browser_can_read_it(client: TestClient, settings: Settings) -> None:
    origin = settings.cors_origins[0]
    response = client.post("/api/lookup", content=lookup_body(settings.web.limits.max_body_bytes + 1),
                           headers={"content-type": "application/json", "Origin": origin})
    assert response.status_code == 413 and response.headers["access-control-allow-origin"] == origin


def test_a_request_without_a_body_is_not_touched_by_the_limit(client: TestClient) -> None:
    assert client.get("/api/addresses").status_code == 200
