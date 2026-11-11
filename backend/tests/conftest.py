"""Shared fixtures. The real Predictor is loaded once per test run (about a second); apps share it."""
from __future__ import annotations

import time
from collections.abc import Callable, Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, load_settings
from app.main import create_app
from explorer.predict import Predictor

RUNNING_EXAMPLE = "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz"
LARGEST = "36V7afbhZnvpMpBJmZf7XJKDeL2vtHDB6L"  # 700 transactions
SHORT_HISTORY = ("bc1qx2stewzm2cel6ytwzraxt9z4d9vlh8e5gdnun6", "bc1q4mj77xnsydlrtkrk092xylkv3cyddwddgp9dvj",
                 "1GqdEHU3qyDvq5BkuuLWQECHoUVRw4rU39")
VALID_OUTSIDE_SNAPSHOT = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"  # a valid address (Bitcoin's genesis) that the snapshot lacks


@pytest.fixture(scope="session")
def settings() -> Settings:
    return load_settings({})


@pytest.fixture(scope="session")
def predictor() -> Predictor:
    return Predictor.load()


@pytest.fixture(scope="session")
def addresses(predictor: Predictor) -> list[str]:
    """The 28 snapshot addresses."""
    found = sorted(predictor.features["address"].unique())
    assert len(found) == 28
    return found


@pytest.fixture(scope="session")
def reference(predictor: Predictor) -> Callable[[str], dict[str, Any]]:
    """`Predictor.score_address` as Assignment 2 gives it, computed once per address for the parity tests."""
    results: dict[str, dict[str, Any]] = {}

    def score(address: str) -> dict[str, Any]:
        if address not in results:
            results[address] = predictor.score_address(address)
        return results[address]

    return score


@pytest.fixture(scope="session")
def shared_client(settings: Settings, predictor: Predictor) -> Iterator[TestClient]:
    """One service for a whole test run, so that tests which read every address fill the cache once."""
    with TestClient(create_app(settings, lambda: predictor, warm=False), raise_server_exceptions=False) as client:
        wait_until_ready(client)
        yield client


def wait_until_ready(client: TestClient, seconds: float = 20.0) -> None:
    """The Predictor loads in the background; wait for E1 to say so."""
    deadline = time.monotonic() + seconds
    while client.get("/api/health").status_code != 200:
        assert time.monotonic() < deadline, "the service did not become ready"
        time.sleep(0.02)


@pytest.fixture
def make_client(settings: Settings, predictor: Predictor) -> Iterator[Callable[..., TestClient]]:
    """A factory for test clients. Errors become responses, as they would under Uvicorn."""
    opened: list[TestClient] = []

    def build(loader: Callable[[], Predictor] | None = None, app_settings: Settings | None = None,
              warm: bool = False) -> TestClient:
        """With no loader the shared Predictor is used and the client waits until the service is ready.

        The cache warm-up is off unless a test asks for it: it would score all 28 addresses for every test.
        """
        app = create_app(app_settings or settings, loader or (lambda: predictor), warm)
        client = TestClient(app, raise_server_exceptions=False)
        client.__enter__()  # runs the lifespan
        opened.append(client)
        if loader is None:
            wait_until_ready(client)
        return client

    yield build
    for client in opened:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()
