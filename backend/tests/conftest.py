"""Shared fixtures. The real Predictor is loaded once per test run (about a second); apps share it."""
from __future__ import annotations

import time
from collections.abc import Callable, Iterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings, load_settings
from app.main import create_app
from explorer.predict import Predictor

RUNNING_EXAMPLE = "1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dz"


@pytest.fixture(scope="session")
def settings() -> Settings:
    return load_settings({})


@pytest.fixture(scope="session")
def predictor() -> Predictor:
    return Predictor.load()


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

    def build(loader: Callable[[], Predictor] | None = None, app_settings: Settings | None = None) -> TestClient:
        """With no loader the shared Predictor is used and the client waits until the service is ready."""
        app = create_app(app_settings or settings, loader or (lambda: predictor))
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
