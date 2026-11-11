"""The address store: where the services find one address's tables (Mod-1, T10; plan section 5.5).

Services read an address through `AddressStore.get`, so the snapshot and a fetched address (S-09) look the
same to every endpoint: the live store will implement the same two methods, and no service changes.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

import pandas as pd
from explorer.predict import Predictor, Unsupported

from ..schemas.common import DataSource


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
    """

    address: str
    source: DataSource
    features: pd.DataFrame
    transactions: pd.DataFrame
    scores: pd.DataFrame


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
