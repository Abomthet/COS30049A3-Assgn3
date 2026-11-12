"""T10: the per-address cache (Mod-2) and the address store (Mod-1)."""
from __future__ import annotations

import threading
import time
from collections.abc import Callable

import pytest
from explorer.predict import Predictor, Unsupported
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.schemas.addresses import TransactionsQuery
from app.services.explorer_service import ExplorerService
from app.services.store import SnapshotStore

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY, VALID_OUTSIDE_SNAPSHOT


@pytest.fixture(scope="module")
def store(predictor: Predictor) -> SnapshotStore:
    return SnapshotStore(predictor)


@pytest.fixture
def service(predictor: Predictor, store: SnapshotStore, settings: Settings) -> ExplorerService:
    return ExplorerService(store, predictor, settings.web.lists)


# ---------------------------------------------------------------- the store


def test_the_store_holds_the_snapshots_28_addresses(store: SnapshotStore, addresses: list[str]) -> None:
    assert sorted(store.addresses()) == addresses


def test_an_address_comes_with_its_tables_oldest_first_and_its_source(store: SnapshotStore, predictor: Predictor) -> None:
    data = store.get(RUNNING_EXAMPLE)
    assert data.address == RUNNING_EXAMPLE and data.source == "snapshot"
    assert len(data.features) == len(data.transactions) == len(data.scores) == 377
    assert list(data.features["block_time_utc"]) == sorted(data.features["block_time_utc"])
    assert data.features.index.name == "txid" and set(data.scores.index) == set(data.features.index)
    assert set(data.features["address"]) == set(data.transactions["address"]) == set(data.scores["address"]) == {RUNNING_EXAMPLE}
    assert list(data.features["txid"]) == list(predictor.history_of(RUNNING_EXAMPLE)["txid"])


def test_an_address_outside_the_snapshot_raises_unsupported(store: SnapshotStore) -> None:
    with pytest.raises(Unsupported):
        store.get(VALID_OUTSIDE_SNAPSHOT)


# ---------------------------------------------------------------- the cache


def test_the_second_view_of_an_address_is_served_from_the_cache_and_is_equal(service: ExplorerService) -> None:
    first_started = time.perf_counter()
    first = service.timeline(LARGEST)
    cold = time.perf_counter() - first_started
    second_started = time.perf_counter()
    second = service.timeline(LARGEST)
    warm = time.perf_counter() - second_started
    assert second == first and service.cache_hits == 1 and service.cache_size == 1
    assert warm < cold / 5


def test_the_timeline_rows_and_detail_of_one_address_share_one_scoring(service: ExplorerService) -> None:
    timeline = service.timeline(RUNNING_EXAMPLE)
    assert service.cache_size == 1 and service.cache_hits == 0
    page = service.rows(RUNNING_EXAMPLE, TransactionsQuery())
    service.detail(RUNNING_EXAMPLE, page.transactions[-1].txid)
    assert service.cache_size == 1 and service.cache_hits == 2 and timeline.totals.tx_count == 377


def test_a_method_has_its_own_entry_and_the_default_one_is_untouched(service: ExplorerService) -> None:
    default = service.timeline(RUNNING_EXAMPLE)
    other = service.timeline(RUNNING_EXAMPLE, "fusion")
    assert service.cache_size == 2 and other.snapshot.method.id == "fusion" and other.totals != default.totals
    assert service.timeline(RUNNING_EXAMPLE) == default
    assert service.timeline(RUNNING_EXAMPLE, "baseline") == default


def test_an_unknown_address_is_refused_before_anything_is_scored(service: ExplorerService) -> None:
    with pytest.raises(Unsupported):
        service.timeline(VALID_OUTSIDE_SNAPSHOT)
    assert service.cache_size == 0


@pytest.mark.slow
def test_the_cache_holds_one_entry_per_snapshot_address_and_drops_the_least_recently_used(service: ExplorerService,
                                                                                         addresses: list[str]) -> None:
    for address in addresses:
        service.timeline(address)
    assert service.cache_size == len(addresses)
    service.timeline(addresses[0])
    service.timeline(addresses[1], "fusion")  # a 29th entry: the least recently used leaves
    assert service.cache_size == len(addresses)
    before = service.cache_hits
    service.timeline(addresses[0])
    assert service.cache_hits == before + 1  # the one touched last is still there
    service.timeline(addresses[1])  # the oldest untouched entry is the one that went
    assert service.cache_hits == before + 1


@pytest.mark.slow
def test_warm_fills_every_address_and_stops_when_asked(service: ExplorerService, addresses: list[str], predictor: Predictor,
                                                       store: SnapshotStore, settings: Settings) -> None:
    assert service.warm(threading.Event()) == len(addresses) and service.cache_size == len(addresses)
    stopped = threading.Event()
    stopped.set()
    idle = ExplorerService(store, predictor, settings.web.lists)
    assert idle.warm(stopped) == 0 and idle.cache_size == 0


@pytest.mark.slow
def test_the_service_warms_the_cache_after_it_is_ready(make_client: Callable[..., TestClient], addresses: list[str]) -> None:
    client = make_client(warm=True)
    explorer = client.app.state.runtime.explorer  # type: ignore[attr-defined]
    deadline = time.monotonic() + 30
    while explorer.cache_size < len(addresses) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert explorer.cache_size == len(addresses)
    hits = explorer.cache_hits
    assert client.get(f"/api/addresses/{RUNNING_EXAMPLE}/timeline").status_code == 200
    assert explorer.cache_hits == hits + 1


def test_a_request_during_the_warm_up_is_answered(make_client: Callable[..., TestClient]) -> None:
    client = make_client(warm=True)
    assert client.get(f"/api/addresses/{SHORT_HISTORY[0]}/timeline").status_code == 200
    assert client.get(f"/api/addresses/{LARGEST}/timeline").status_code == 200
