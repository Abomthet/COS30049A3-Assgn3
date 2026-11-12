"""E13 GET /api/watchlist, E14 PUT /api/watchlist/{address} and E15 DELETE /api/watchlist/{address} (S-04)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..schemas.errors import error_responses
from ..schemas.watchlist import WatchlistEntry, WatchlistPut, WatchlistResponse
from ..services.watchlist_service import WatchlistService
from .deps import get_watchlist, path_address

router = APIRouter(prefix="/api", tags=["watchlist"])

Watchlist = Annotated[WatchlistService, Depends(get_watchlist)]


@router.get("/watchlist", response_model=WatchlistResponse, summary="The watched addresses with labels and notes",
            responses=error_responses(503))
def list_watchlist(service: Watchlist) -> WatchlistResponse:
    """Each entry with `address`, `label`, `note`, `addedAt`, `updatedAt` and the address's summary as E3 gives it,
    the most recently added first."""
    return service.entries()


@router.put("/watchlist/{address}", response_model=WatchlistEntry, summary="Adds an address to the watchlist, or replaces its label and note",
            responses={201: {"model": WatchlistEntry, "description": "The address was added."},
                       **error_responses(400, 404, 409, 413, 415, 503)})
def put_watchlist(address: Annotated[str, Depends(path_address)], body: WatchlistPut, service: Watchlist,
                  response: Response) -> WatchlistEntry:
    """Answers 201 for a new entry and 200 for a replaced one. 400 names each field at fault (label and note have
    length limits); 404 `unsupported` for an address that cannot be opened; 409 `conflict` when the list is full."""
    entry, created = service.put(address, body)
    response.status_code = 201 if created else 200
    return entry


@router.delete("/watchlist/{address}", status_code=204, summary="Removes an address from the watchlist",
               responses=error_responses(400, 404, 503))
def delete_watchlist(address: Annotated[str, Depends(path_address)], service: Watchlist) -> Response:
    """Answers 204 with no body, or 404 `not_found` when the address is not on the list."""
    service.delete(address)
    return Response(status_code=204)
