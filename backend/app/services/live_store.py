"""The fetched addresses (S-09): an `AddressStore` that holds what the live lookup read, and keeps it on disk for a while.

A fetched address is stored as the transactions Esplora returned, trimmed to the parts the pipeline uses (`trim_tx`), in
one gzipped JSON file per address under `<database directory>/live/` (backend/var/live/ by default, git-ignored). The scores
are not stored: the models are frozen and scoring takes a third of a second, so a restart scores each cached address again,
the first time it is asked for. A file older than `web.live.cacheDays` is deleted when it is met, and the address is then
unknown, exactly as if it had never been fetched.
"""
from __future__ import annotations

import gzip
import json
import logging
import os
import threading
import time
from collections.abc import Callable, Sequence
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from explorer.predict import Predictor, Unsupported

from .live_scoring import score_history
from .store import AddressData, LiveFetch

log = logging.getLogger("app.live")
SUFFIX = ".json.gz"
DAY_SECONDS = 86_400


def iso_utc(unix_seconds: float) -> str:
    """A moment as `2026-11-10T14:02:11Z`."""
    return datetime.fromtimestamp(int(unix_seconds), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class LiveStore:
    """The fetched addresses, in memory and on disk."""

    def __init__(self, directory: Path, predictor: Predictor, cache_days: int, clock: Callable[[], float] = time.time) -> None:
        """
        Args:
            directory: Where the cache files live; created when the first address is stored.
            predictor: The loaded Predictor, whose frozen methods score every fetched address.
            cache_days: How long a fetch stays usable (settings.json -> web.live.cacheDays).
            clock: Unix seconds; tests pass their own.
        """
        self._directory = directory
        self._predictor = predictor
        self._max_age = cache_days * DAY_SECONDS
        self._clock = clock
        self._lock = threading.Lock()
        self._fetches: dict[str, LiveFetch] = {}
        self._data: dict[str, AddressData] = {}
        self._load_index()

    def _path(self, address: str) -> Path:
        return self._directory / f"{address}{SUFFIX}"

    def _load_index(self) -> None:
        """Read each cache file's header: what was fetched and when. An unreadable or expired file is removed."""
        for path in sorted(self._directory.glob(f"*{SUFFIX}")) if self._directory.is_dir() else []:
            try:
                header = self._read(path)
                fetch = LiveFetch(**header["fetch"])
            except (OSError, ValueError, KeyError, TypeError) as error:
                log.warning("Removing the unreadable live cache file %s (%s)", path.name, error.__class__.__name__)
                path.unlink(missing_ok=True)
                continue
            if self._expired(fetch):
                path.unlink(missing_ok=True)
                continue
            self._fetches[header["address"]] = fetch

    @staticmethod
    def _read(path: Path) -> dict[str, Any]:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            return json.load(handle)

    def _expired(self, fetch: LiveFetch) -> bool:
        return self._clock() - fetch.fetched_unix > self._max_age

    # ---------------------------------------------------------------- the AddressStore protocol

    def addresses(self) -> Sequence[str]:
        """The fetched addresses that have not expired, oldest fetch first."""
        with self._lock:
            return [address for address, _ in sorted(self._fetches.items(), key=lambda item: item[1].fetched_unix)
                    if not self._expired(self._fetches[address])]

    def get(self, address: str) -> AddressData:
        """The address's scored tables.

        Raises:
            Unsupported: The address was never fetched, was forgotten, or its fetch has expired.
        """
        with self._lock:
            fetch = self._fetches.get(address)
            if fetch is None:
                raise Unsupported(f"{address} has not been fetched")
            if self._expired(fetch):
                self._drop(address)
                raise Unsupported(f"{address} was fetched too long ago")
            data = self._data.get(address)
        if data is None:  # scored outside the lock: a second request for the same cold address may score it too, with the same result
            data = score_history(self._predictor, address, self._read(self._path(address))["transactions"], fetch)
            with self._lock:
                self._data[address] = data
        return data

    # ---------------------------------------------------------------- what the live service does

    def fetch_of(self, address: str) -> LiveFetch | None:
        """When the address was fetched and how, or None when it is not held (or has expired)."""
        with self._lock:
            fetch = self._fetches.get(address)
            return None if fetch is None or self._expired(fetch) else fetch

    def put(self, address: str, transactions: list[dict[str, Any]], fetch: LiveFetch) -> AddressData:
        """Score the transactions, keep the result and write the cache file; a fetch of the same address is replaced.

        Raises:
            ValueError: A value the cleaning needs is missing (the service's reply changed shape).
        """
        data = score_history(self._predictor, address, transactions, fetch)
        self._directory.mkdir(parents=True, exist_ok=True)
        path = self._path(address)
        temporary = path.with_name(f"{path.name}.{os.getpid()}.part")
        with gzip.open(temporary, "wt", encoding="utf-8") as handle:
            json.dump({"address": address, "fetch": asdict(fetch), "transactions": transactions}, handle, separators=(",", ":"))
        temporary.replace(path)
        with self._lock:
            self._fetches[address], self._data[address] = fetch, data
        return data

    def forget(self, address: str) -> bool:
        """Remove the address and its file. Returns whether it was held."""
        with self._lock:
            return self._drop(address)

    def _drop(self, address: str) -> bool:
        held = self._fetches.pop(address, None) is not None
        self._data.pop(address, None)
        self._path(address).unlink(missing_ok=True)
        return held
