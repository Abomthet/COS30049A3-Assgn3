"""The watchlist (E13 to E15; S-04)."""
from __future__ import annotations

from pydantic import Field

from .common import AddressSummary, CamelModel, RequestModel


class WatchlistPut(RequestModel):
    """E14's body. The length limits come from settings.json -> web.watchlist and are checked by the watchlist service."""

    label: str = Field(default="", description="A short name; at most `web.watchlist.maxLabelChars` characters.")
    note: str = Field(default="", description="A free note; at most `web.watchlist.maxNoteChars` characters.")


class WatchlistEntry(CamelModel):
    """One watched address with its label and note, and the address's summary as E3 gives it."""

    address: str
    label: str
    note: str
    added_at: str = Field(description="ISO 8601, UTC.")
    updated_at: str = Field(description="ISO 8601, UTC; equals `addedAt` until the entry is replaced.")
    summary: AddressSummary


class WatchlistResponse(CamelModel):
    """E13: the entries, most recently added first."""

    entries: list[WatchlistEntry]
