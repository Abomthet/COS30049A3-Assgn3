"""The export (E10): the file's format, the filters it shares with E6, and the JSON file's shape.

The CSV file has the same rows with amounts in BTC and one column per feature value (see `services/export_service.py`).
"""
from __future__ import annotations

from typing import Literal

from pydantic import Field

from .addresses import TransactionFilters
from .common import CamelModel, Direction, MethodId
from .transactions import FeatureId

ExportFormat = Literal["csv", "json"]


class ExportQuery(TransactionFilters):
    """E10's query: E6's filters and the file format. The answer is a file, not a JSON body."""

    format: ExportFormat = "csv"


class ExportFeature(CamelModel):
    """One of F1 to F4 of an exported transaction, in the units people read (BTC, count, hours, ratio)."""

    id: FeatureId
    name: str
    value: float | None
    usual: float | None
    z: float | None


class ExportRow(CamelModel):
    """One exported transaction."""

    address: str
    txid: str
    time: str = Field(description="ISO 8601, UTC.")
    direction: Direction
    received_sats: int
    sent_sats: int
    net_sats: int
    scored: bool
    flagged: bool
    method: MethodId = Field(description="The deciding method: the one `flagged` and `score` belong to.")
    score: float | None
    features: list[ExportFeature] = Field(description="Empty for a transaction of an address with too little history.")
    main_reason: str | None
    flagged_by: list[MethodId] = Field(description="Every method that flags it.")
    source_url: str
    snapshot_date: str
    limitation: str | None = Field(description="The limitation line, on a flagged row; null otherwise.")


class ExportDocument(CamelModel):
    """E10 with `format=json`: the rows that match, with the limitation line stated once for the whole file."""

    address: str
    snapshot_date: str
    method: MethodId
    limitation: str
    count: int
    transactions: list[ExportRow]
