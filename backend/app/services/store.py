"""The address store: where the services find one address's tables (Mod-1, T10; plan section 5.5).

Services read an address through `AddressStore.get`, so the snapshot and a fetched address (S-09) look the
same to every endpoint: the live store will implement the same two methods, and no service changes.
"""
from __future__ import annotations

import dataclasses
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

import pandas as pd
from explorer.methods import Method
from explorer.predict import Predictor, Unsupported

from ..schemas.common import DataSource


@dataclass(frozen=True)
class LiveFetch:
    """When and how a fetched address was read from the public blockchain service (S-09).

    Attributes:
        fetched_at: UTC, ISO 8601 (`2026-11-10T14:02:11Z`).
        fetched_unix: The same moment in Unix seconds (the cache's age is measured from it).
        max_tx: The cap the lookup was started with.
        transactions: How many confirmed transactions were fetched (newest first, so the most recent ones).
        total: How many confirmed transactions the address has on the chain, as the service reported when the lookup began.
        truncated: True when the address has more transactions than were fetched.
    """

    fetched_at: str
    fetched_unix: int
    max_tx: int
    transactions: int
    total: int
    truncated: bool


@dataclass(frozen=True)
class AddressData:
    """Everything the store holds about one address, oldest transaction first.

    Attributes:
        address: The address as stored.
        source: Where the data came from: the frozen snapshot, or a live lookup.
        features: One row per transaction (Assignment 2's feature table), ordered by time then transaction
            ID as `Predictor.history_of` orders them, and indexed by transaction ID.
        transactions: The cleaned transactions of the address.
        scores: Every method's score and flag per transaction, indexed by transaction ID.
        fetched: For a fetched address, when and how it was read; None for a snapshot address.
        methods: For a fetched address, the frozen methods with the regression's residual scale set from the address's own
            history (Mod-11); None for a snapshot address, whose scales are in the saved models.
        version: Changes whenever the tables do, so a cache keyed by it never serves an older fetch of the same address.
    """

    address: str
    source: DataSource
    features: pd.DataFrame
    transactions: pd.DataFrame
    scores: pd.DataFrame
    fetched: LiveFetch | None = None
    methods: Mapping[str, Method] | None = None
    version: str = ""


def predictor_for(predictor: Predictor, data: AddressData) -> Predictor:
    """The Predictor that scores this address: the shared one for a snapshot address, and for a fetched address a copy
    whose three tables and methods are the address's own (the loaded models are shared, so the copy costs nothing)."""
    if data.source == "snapshot":
        return predictor
    assert data.methods is not None  # every fetched address is scored with its own adapted methods
    # The Predictor's own tables have a plain index; a store's are indexed by transaction ID (kept as a column too), which
    # `sort_values` and `set_index` in the Predictor would find ambiguous.
    return dataclasses.replace(predictor, features=data.features.reset_index(drop=True), transactions=data.transactions,
                               scores=data.scores.reset_index(drop=True), methods=dict(data.methods))


class AddressStore(Protocol):
    """What a service needs from a store of addresses."""

    def addresses(self) -> Sequence[str]:
        """Every address the store can answer for."""

    def get(self, address: str) -> AddressData:
        """The address's tables.

        Raises:
            Unsupported: The store does not hold the address.
        """


class SnapshotStore:
    """The frozen snapshot: the Predictor's three tables, split by address once at start and never changed."""

    def __init__(self, predictor: Predictor) -> None:
        """Group the tables by address (a few milliseconds for the 7,966 transactions)."""
        ordered = predictor.features.sort_values(["address", "block_time_utc", "txid"]).set_index("txid", drop=False)
        transactions = dict(tuple(predictor.transactions.groupby("address")))
        scores = dict(tuple(predictor.scores.set_index("txid", drop=False).groupby("address")))
        self._data = {
            address: AddressData(address, "snapshot", rows, transactions[address], scores[address])
            for address, rows in ordered.groupby("address", sort=False)}

    def addresses(self) -> Sequence[str]:
        """The snapshot's addresses, in table order."""
        return list(self._data)

    def get(self, address: str) -> AddressData:
        """The address's tables.

        Raises:
            Unsupported: The address is not in the snapshot.
        """
        try:
            return self._data[address]
        except KeyError:
            raise Unsupported(f"{address} is not in the snapshot") from None


class CompositeStore:
    """The snapshot first, then the fetched addresses: what the services see when live lookup is on (S-09)."""

    def __init__(self, snapshot: AddressStore, live: AddressStore) -> None:
        """
        Args:
            snapshot: The frozen snapshot, which always answers first.
            live: The fetched addresses.
        """
        self._snapshot = snapshot
        self._live = live

    def addresses(self) -> Sequence[str]:
        """The snapshot's addresses, then the fetched ones."""
        return [*self._snapshot.addresses(), *self._live.addresses()]

    def get(self, address: str) -> AddressData:
        """The address's tables.

        Raises:
            Unsupported: Neither store holds the address.
        """
        try:
            return self._snapshot.get(address)
        except Unsupported:
            return self._live.get(address)
