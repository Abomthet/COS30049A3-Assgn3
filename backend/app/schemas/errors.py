"""The one error body and the OpenAPI helper that documents it (plan section 6.3, D-A3-5).

`status` is for code; `message` and `hint` are plain words safe to show. Some statuses add their own
keys, as Assignment 1 planned: `examples` and `canLookupLive` with `unsupported`; `transaction`,
`history` and `firstScoredDate` with `insufficient_history`. Only keys that were set are sent, so an
explicit `firstScoredDate: null` survives while an unused key is absent.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import ConfigDict, Field

from .common import CamelModel, HistoryRequirement
from .transactions import TransactionCore

ErrorStatus = Literal["invalid", "disabled", "unsupported", "not_found", "conflict", "too_large", "insufficient_history",
                      "rate_limited", "server_error", "upstream_error", "unavailable", "upstream_timeout"]


class FieldError(CamelModel):
    """One form field at fault."""

    name: str
    message: str


class HistoryShortfall(CamelModel):
    """How much earlier history there was against how much scoring needs."""

    earlier_tx: int
    span_days: float
    required: HistoryRequirement


class ErrorBody(CamelModel):
    """Every failure answers with this body."""

    status: ErrorStatus
    message: str
    hint: str | None = None
    fields: list[FieldError] | None = None
    request_id: str = Field(description="Matches the server's log line for this request.")
    examples: list[str] | None = Field(default=None, description="With `unsupported`: three addresses that can be opened.")
    can_lookup_live: bool | None = Field(default=None, description="With `unsupported`: whether a live lookup is on.")
    transaction: TransactionCore | None = Field(default=None, description="With `insufficient_history` on a transaction.")
    history: HistoryShortfall | None = None
    first_scored_date: str | None = Field(default=None, description="The first day that can be scored, or null.")

    model_config = ConfigDict(
        json_schema_extra={"example": {
            "status": "invalid",
            "message": "This address fails its checksum, so it probably contains a typo.",
            "hint": "Bitcoin addresses start with 1, 3 or bc1. Check for a missing or extra character, or pick an address from the list.",
            "fields": [{"name": "address", "message": "Checksum does not match."}],
            "requestId": "0f3c9a1e7b2d"}})


def error_responses(*codes: int) -> dict[int | str, dict[str, Any]]:
    """The `responses=` entry that documents the given error statuses with the one body."""
    meanings = {400: "A value is malformed or out of range.", 404: "The address, transaction or path is unknown.",
                409: "The watchlist is full.",
                413: "The request body is over the size limit.", 415: "The request body is not JSON.",
                422: "Too little earlier history to score.", 503: "The service is starting or a file is missing."}
    return {code: {"model": ErrorBody, "description": meanings[code]} for code in codes}


# Every GET of snapshot data carries an ETag; a repeat request with `If-None-Match` costs a 304 with no body.
SNAPSHOT_GET: dict[int | str, dict[str, Any]] = {304: {"description": "The copy the client holds is still right (the `ETag` matched)."}}
