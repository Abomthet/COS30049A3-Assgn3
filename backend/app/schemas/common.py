"""Building blocks shared by every response (all endpoints; the API contract of plan section 6).

The shapes marked A1 are those of frontend/src/api/types.ts, Assignment 1's contract. Names are camelCase
on the wire and snake_case in Python: `CamelModel` converts between them, and FastAPI answers by alias.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

Direction = Literal["in", "out", "none"]
HistoryStatus = Literal["sufficient", "insufficient"]
ScoreStatus = Literal["flagged", "not-flagged", "not-scored"]
DataSource = Literal["snapshot", "live"]
AddressKind = Literal["p2pkh", "p2sh", "p2wpkh", "p2wsh", "p2tr", "segwit"]
MethodId = Literal["baseline", "isolation_forest", "lof", "kmeans", "dbscan", "regression", "regression_interval",
                   "fusion", "txgpt_method"]


class CamelModel(BaseModel):
    """Base of every response model: camelCase on the wire, snake_case in code."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RequestModel(CamelModel):
    """Base of every request body: an unknown field is a 400, not silently ignored (plan section 11.2)."""

    model_config = ConfigDict(extra="forbid")


class MethodInfo(CamelModel):
    """The deciding method and the two z lines the explanation uses (A1)."""

    id: str
    name: str
    flag_abs_z: float
    contributing_abs_z: float
    note: str


class SnapshotInfo(CamelModel):
    """What the data is and where it came from (A1)."""

    snapshot_date: str
    source: str
    source_url: str
    illustrative: bool
    day_time_zone: Literal["UTC"]
    address_count: int
    method: MethodInfo


class HistoryRequirement(CamelModel):
    """The least history a transaction needs to be scored (A1)."""

    min_tx: int
    min_span_days: float


class AddressSummary(CamelModel):
    """One address in the list, and the summary E4 returns (A1, plus `kind` and `source`)."""

    address: str
    first_seen: str
    last_seen: str
    tx_count: int
    scored_count: int
    flagged_count: int
    history: HistoryStatus
    kind: AddressKind
    source: DataSource
