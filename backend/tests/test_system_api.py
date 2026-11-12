"""T06, T07: E1 health, E2 config, the lifespan, request identifiers, CORS and compression."""
from __future__ import annotations

import re
import threading
import time
from collections.abc import Callable
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import __version__
from app.core.config import Settings
from explorer.predict import Predictor, check_outputs
from tests.conftest import wait_until_ready


def test_health_says_what_is_loaded(client: TestClient) -> None:
    response = client.get("/api/health")
    body = response.json()
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert {k: body[k] for k in ("status", "version", "snapshotDate", "addressCount", "methodCount", "liveLookup")} == {
        "status": "ok", "version": __version__, "snapshotDate": "2026-10-22", "addressCount": 28, "methodCount": 9,
        "liveLookup": False}
    assert body["assistant"] in ("ready", "not_installed", "loading", "off")
    assert body["uptimeSeconds"] >= 0


def test_health_is_503_while_the_models_load_then_200(make_client: Callable[..., TestClient], predictor: Predictor) -> None:
    release = threading.Event()

    def slow_loader() -> Predictor:
        release.wait(10)
        return predictor

    client = make_client(slow_loader)
    starting = client.get("/api/health")
    assert starting.status_code == 503
    assert starting.json()["status"] == "unavailable" and "requestId" in starting.json()
    assert client.get("/api/config").status_code == 503
    release.set()
    wait_until_ready(client)
    assert client.get("/api/config").status_code == 200


def test_a_failed_load_keeps_answering_503_and_logs_the_cause(make_client: Callable[..., TestClient],
                                                              caplog: pytest.LogCaptureFixture) -> None:
    def broken_loader() -> Predictor:
        raise FileNotFoundError("models/fusion.joblib")

    caplog.set_level("ERROR", logger="app")
    client = make_client(broken_loader)
    deadline = time.monotonic() + 5
    while "could not be loaded" not in caplog.text and time.monotonic() < deadline:
        time.sleep(0.02)
    response = client.get("/api/health")
    assert response.status_code == 503 and response.json()["message"] == "The explorer service could not load its models."
    assert "models/fusion.joblib" in caplog.text and "models/fusion.joblib" not in response.text


def test_config_is_what_the_front_end_needs(client: TestClient, settings: Settings) -> None:
    body = client.get("/api/config").json()
    assert set(body) == {"snapshot", "limitationLine", "features", "history", "thresholds", "defaultMethod", "web", "whatIf",
                         "capabilities"}
    assert body["snapshot"]["addressCount"] == 28 and body["snapshot"]["method"]["id"] == "baseline"
    assert body["limitationLine"] == "Unusual activity requires investigation; it does not indicate wrongdoing."
    assert [(f["id"], f["name"], f["unit"]) for f in body["features"]] == [
        ("F1", "Size", "BTC"), ("F2", "Burst", "count"), ("F3", "Gap", "hours"), ("F4", "Relative size", "ratio")]
    assert body["history"] == {"minTx": 10, "minSpanDays": 14}
    assert body["thresholds"] == {"flagAbsZ": 5.0, "contributingAbsZ": 2.0}
    assert body["defaultMethod"] == "baseline"
    assert body["whatIf"] == {"defaultTime": "2026-10-22T12:00:00Z"}
    assert body["web"] == settings.web.model_dump(by_alias=True)
    assert body["web"]["lists"] == {"pageSize": 50, "maxPageSize": 200}


def test_capabilities_follow_the_switches(make_client: Callable[..., TestClient], settings: Settings, tmp_path: Path) -> None:
    weights = tmp_path / "model.pt"
    weights.write_bytes(b"x")
    on = make_client(app_settings=replace(settings, live_lookup=True, assistant_weights=weights, assistant_mode="auto"))
    assert on.get("/api/config").json()["capabilities"] == {"assistant": True, "liveLookup": True}
    assert on.get("/api/health").json()["assistant"] == "ready"

    off = make_client(app_settings=replace(settings, assistant_weights=weights, assistant_mode="off"))
    assert off.get("/api/config").json()["capabilities"] == {"assistant": False, "liveLookup": False}
    assert off.get("/api/health").json()["assistant"] == "off"

    absent = make_client(app_settings=replace(settings, assistant_weights=tmp_path / "missing.pt", assistant_mode="auto"))
    assert absent.get("/api/health").json()["assistant"] == "not_installed"


def test_every_response_carries_a_request_id_and_a_good_one_is_kept(client: TestClient) -> None:
    first, second = client.get("/api/health"), client.get("/api/health")
    assert re.fullmatch(r"[0-9a-f]{12}", first.headers["X-Request-ID"])
    assert first.headers["X-Request-ID"] != second.headers["X-Request-ID"]
    assert client.get("/api/health", headers={"X-Request-ID": "browser-click-42"}).headers["X-Request-ID"] == "browser-click-42"
    replaced = client.get("/api/health", headers={"X-Request-ID": "bad id\n"}).headers["X-Request-ID"]
    assert re.fullmatch(r"[0-9a-f]{12}", replaced)


def test_one_log_line_per_request(client: TestClient, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level("INFO", logger="app.request")
    response = client.get("/api/health")
    lines = [r.getMessage() for r in caplog.records if r.name == "app.request"]
    assert len(lines) == 1
    assert re.fullmatch(rf"{response.headers['X-Request-ID']} GET /api/health 200 \d+ ms", lines[0])


def test_cors_allows_the_vite_origins_and_nothing_else(client: TestClient) -> None:
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        response = client.get("/api/health", headers={"Origin": origin})
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-expose-headers"] == "X-Request-ID, Content-Disposition, Retry-After"
    other = client.get("/api/health", headers={"Origin": "http://evil.test"})
    assert "access-control-allow-origin" not in other.headers
    preflight = client.options("/api/config", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert preflight.status_code == 200


def test_large_responses_are_compressed(client: TestClient) -> None:
    response = client.get("/api/config", headers={"Accept-Encoding": "gzip"})
    assert response.headers["content-encoding"] == "gzip" and response.json()["web"]


def test_no_banned_word_in_any_response(client: TestClient) -> None:
    for path in ("/api/health", "/api/config", "/api/nothing"):
        check_outputs(client.get(path).json())
