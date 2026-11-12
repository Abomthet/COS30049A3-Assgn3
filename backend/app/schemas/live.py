"""E16 to E19: the live lookup of a fetched address (S-09, CR-08).

One body, `LiveLookup`, serves E16 (its answer), E17 (its status) and every event of E18, so a client can replace what it
holds with whatever arrives. The limits (`maxTx` range, lookups an hour, cache days) come from settings.json -> web.live.
"""
from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import CamelModel, RequestModel
from .errors import ErrorStatus

LookupStatus = Literal["queued", "fetching", "scoring", "done", "failed", "cancelled"]


class LiveLookupRequest(RequestModel):
    """E16's body."""

    address: str
    max_tx: int | None = Field(default=None, description="How many of the address's most recent confirmed transactions to fetch: "
                                                          "`web.live.minMaxTx` to `web.live.maxTxLimit`; default `web.live.defaultMaxTx`.")


class LookupProgress(CamelModel):
    """How far the fetch has got."""

    pages: int = Field(description="Pages of 25 transactions fetched so far.")
    transactions: int = Field(description="Transactions fetched so far.")
    cap: int = Field(description="Where the fetch stops: `maxTx`, or the address's own count when that is smaller.")
    total: int | None = Field(description="The address's confirmed transactions on the chain; null before the service has said.")


class LookupFailure(CamelModel):
    """Why a lookup failed: `status` is for code, `message` and `hint` are words safe to show."""

    status: ErrorStatus
    message: str
    hint: str | None = None


class LookupLinks(CamelModel):
    """Where to follow the lookup."""

    status: str = Field(description="E17.")
    events: str = Field(description="E18.")


class LiveLookup(CamelModel):
    """A lookup's identity, status and progress."""

    id: str
    address: str
    status: LookupStatus
    progress: LookupProgress
    max_tx: int
    started_at: str = Field(description="ISO 8601, UTC.")
    finished_at: str | None = Field(description="ISO 8601, UTC; null while the lookup runs.")
    error: LookupFailure | None = Field(description="Set when `status` is `failed`.")
    cached: bool = Field(description="True when a fresh fetch of this address was already held and no request left this computer.")
    links: LookupLinks
