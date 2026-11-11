"""Addresses: the list (E3), the lookup (E4), the timeline (E5) and a page of rows (E6).

E3, E5 and the rows' first five fields are A1's shapes; the additions are those of plan section 6.4.
`TransactionFilters` holds the query E6 and E10 share. Its numeric limits (page size, range of days)
come from settings.json -> web and are checked by the service, so no number is typed here.
"""
from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import (AddressSummary, CamelModel, Direction, HistoryRequirement, HistoryStatus, MethodId, RequestModel,
                     ScoreStatus, SnapshotInfo)


class AddressesResponse(CamelModel):
    """E3: the addresses that can be opened."""

    snapshot: SnapshotInfo
    addresses: list[AddressSummary]


class LookupRequest(RequestModel):
    """E4's body. The checker's specific message for a bad address comes from core.validation."""

    address: str


class LookupResponse(CamelModel):
    """E4: the typed address is supported."""

    status: Literal["supported"]
    address: str = Field(description="The normalised address.")
    summary: AddressSummary


class TimelineDay(CamelModel):
    """One day that has transactions (A1)."""

    date: str
    tx_count: int
    flagged_count: int


class TimeRange(CamelModel):
    """The first and last transaction time."""

    start: str
    end: str


class TimelineTotals(CamelModel):
    """Counts over the whole history (A1)."""

    tx_count: int
    scored_count: int
    flagged_count: int
    flagged_days: int


class TimelineHistory(CamelModel):
    """Whether the history is long enough to score, and from when (A1)."""

    status: HistoryStatus
    tx_count: int
    span_days: float
    required: HistoryRequirement
    first_scored_date: str | None


class TimelineResponse(CamelModel):
    """E5: per-day counts, totals, range and history status of one address."""

    address: str
    snapshot: SnapshotInfo
    range: TimeRange
    days: list[TimelineDay] = Field(description="Only days with transactions, oldest first.")
    totals: TimelineTotals
    history: TimelineHistory


class TransactionRow(CamelModel):
    """One row of E6 (A1's `TransactionRow` plus the deciding method's view)."""

    txid: str
    time: str
    direction: Direction
    net_sats: int
    status: ScoreStatus
    score: float | None = Field(description="The deciding method's score; null when not scored.")
    main_reason: str | None = Field(description="The template's strongest reason, such as 'Longer gap than usual'.")
    main_z: float | None
    flagged_by: int = Field(description="How many methods flag it.")


class TransactionsResponse(CamelModel):
    """E6: a filtered, sorted page of rows."""

    address: str
    date: str | None
    transactions: list[TransactionRow]
    page: int
    page_size: int
    total: int


Sort = Literal["time", "-time", "amount", "-amount", "score", "-score"]


class TransactionFilters(RequestModel):
    """Query parameters E6 and E10 share. `status` and `direction` may repeat."""

    date: str | None = Field(default=None, description="One UTC day, YYYY-MM-DD.")
    from_: str | None = Field(default=None, alias="from", description="First day of an inclusive range; not with `date`.")
    to: str | None = Field(default=None, description="Last day of an inclusive range.")
    status: list[ScoreStatus] | None = None
    direction: list[Direction] | None = None
    sort: Sort = "time"
    method: MethodId | None = Field(default=None, description="Whose flags and scores decide (S-01); default: the baseline.")


class TransactionsQuery(TransactionFilters):
    """E6's query: the filters and a page."""

    page: int = Field(default=1, ge=1)
    page_size: int | None = Field(default=None, ge=1, description="Defaults to settings web.lists.pageSize.")
