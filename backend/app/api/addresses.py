"""E3 GET /api/addresses, E4 POST /api/lookup, E5 the timeline and E6 the rows of one address."""
from __future__ import annotations

from typing import Annotated

from explorer.predict import Unsupported
from fastapi import APIRouter, Depends, Query, Response

from ..core.errors import Conflict
from ..core.runtime import Runtime
from ..core.validation import require_address
from ..schemas.addresses import (AddressesResponse, LookupRequest, LookupResponse, TimelineResponse, TransactionsQuery,
                                 TransactionsResponse)
from ..schemas.common import MethodId
from ..schemas.errors import SNAPSHOT_GET, error_responses
from ..services.explorer_service import ExplorerService
from ..services.live_service import LiveService
from .deps import get_explorer, get_live, get_runtime, path_address, snapshot_data

router = APIRouter(prefix="/api", tags=["addresses"])

Explorer = Annotated[ExplorerService, Depends(get_explorer)]
Method = Annotated[MethodId | None, Query(description="Whose flags and scores decide (S-01); default: the baseline.")]


@router.get("/addresses", response_model=AddressesResponse, summary="The addresses that can be opened, with counts",
            dependencies=[Depends(snapshot_data)], responses={**SNAPSHOT_GET, **error_responses(400, 503)})
def list_addresses(explorer: Explorer, method: Method = None) -> AddressesResponse:
    """Each address with its transaction, scored and flagged counts and whether its history is long enough.
    Addresses with enough history come first, busiest first; the short-history ones follow."""
    return explorer.addresses(method)


@router.post("/lookup", response_model=LookupResponse, summary="Whether a typed address is supported",
             responses=error_responses(400, 404, 413, 415, 503))
def lookup(body: LookupRequest, explorer: Explorer, runtime: Annotated[Runtime, Depends(get_runtime)]) -> LookupResponse:
    """200 with the normalised address and its summary; 400 with the checker's specific message for a malformed
    address; 404 with three addresses that can be opened for a valid address outside the snapshot."""
    address = require_address(body.address, runtime.settings.web.limits.max_address_chars)
    return explorer.lookup(address)


@router.get("/addresses/{address}/timeline", response_model=TimelineResponse,
            summary="Per-day counts, totals, range and history status", dependencies=[Depends(snapshot_data)],
            responses={**SNAPSHOT_GET, **error_responses(400, 404, 503)})
def timeline(address: Annotated[str, Depends(path_address)], explorer: Explorer, method: Method = None) -> TimelineResponse:
    """Only days with transactions, oldest first. An address with too little history answers 200 with
    `history.status: "insufficient"` and no scored transactions, so its transactions can still be listed."""
    return explorer.timeline(address, method)


@router.get("/addresses/{address}/transactions", response_model=TransactionsResponse,
            summary="A filtered, sorted page of transaction rows", dependencies=[Depends(snapshot_data)],
            responses={**SNAPSHOT_GET, **error_responses(400, 404, 503)})
def transactions(address: Annotated[str, Depends(path_address)], query: Annotated[TransactionsQuery, Query()],
                 explorer: Explorer) -> TransactionsResponse:
    """Filter by one day (`date`) or a range (`from`, `to`), by `status` and `direction` (each may repeat), sort by
    `time`, `amount` (the size of the net amount, in or out) or `score` (a leading minus reverses), and page with `page` and `pageSize`.
    A filter that matches nothing is a 200 with an empty list."""
    return explorer.rows(address, query)


@router.delete("/addresses/{address}", status_code=204, summary="Forgets a fetched address",
               responses=error_responses(400, 403, 404, 409, 503))
def forget_address(address: Annotated[str, Depends(path_address)], live: Annotated[LiveService, Depends(get_live)],
                   explorer: Explorer, runtime: Annotated[Runtime, Depends(get_runtime)]) -> Response:
    """Removes an address a live lookup fetched, with its cache file and its watchlist entry (S-09). Answers 204; 403 when live
    lookup is off; 404 `unsupported` when the address was never fetched (or has expired); 409 for a snapshot address, which
    cannot be forgotten, and while a lookup for the address is still running."""
    try:
        source = explorer.source_of(address)
    except Unsupported:  # never fetched, or fetching now: the live service tells which
        source = None
    if source == "snapshot":
        raise Conflict("Snapshot addresses cannot be removed.")
    live.forget(address)
    if runtime.watchlist is not None:
        runtime.watchlist.discard(address)
    return Response(status_code=204)
