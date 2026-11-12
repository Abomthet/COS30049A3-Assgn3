"""E16 POST /api/live/lookups, E17 GET and E19 DELETE /api/live/lookups/{id}, E18 GET /api/live/lookups/{id}/events (S-09).

All five answer 403 `disabled` when the server runs with `EXPLORER_LIVE_LOOKUP=off` (the default). E20, which forgets a
fetched address, is in `addresses.py` beside the other routes of an address.
"""
from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse

from ..core.runtime import Runtime
from ..core.validation import require_address
from ..schemas.errors import error_responses
from ..schemas.live import LiveLookup, LiveLookupRequest
from ..services.live_service import Job, LiveService
from .deps import get_live, get_runtime

router = APIRouter(prefix="/api/live", tags=["live"])

Live = Annotated[LiveService, Depends(get_live)]
POLL_SECONDS = 0.1  # how often a stream looks for a new event; a page takes far longer to fetch (the client paces its requests)
EVENT_STREAM = {"description": "Server-sent events named `status`, `progress`, `done` and `failed`; each carries the body of E17 as "
                               "its data. A comment line follows every 15 seconds of silence. The stream ends after the last event.",
                "content": {"text/event-stream": {"schema": {"type": "string"}}}}


@router.post("/lookups", response_model=LiveLookup, status_code=202, summary="Starts a live lookup of an address outside the snapshot",
             responses={200: {"model": LiveLookup, "description": "A fresh fetch of this address was already held: the lookup is `done` at once."},
                        **error_responses(400, 403, 404, 409, 413, 415, 429, 502, 503, 504)})
def start_lookup(body: LiveLookupRequest, live: Live, runtime: Annotated[Runtime, Depends(get_runtime)], response: Response) -> LiveLookup:
    """Reads the address's most recent confirmed transactions (`maxTx`, 50 to 1,000; default 500) from the public blockchain
    service in the background and scores them. Answers 202 with the lookup, whose `links` give E17 and E18, and a `Location`
    header; 200 with a `done` lookup when a fetch under `web.live.cacheDays` old is held. 400 names each field at fault; 403
    when live lookup is off; 404 `not_found` for an address with no confirmed transactions; 409 while a lookup for this address
    runs; 429 with `Retry-After` while another lookup runs or the hour's allowance is spent; 502 and 504 when the public
    service answers with an error or not at all. Only the address is sent to it."""
    address = require_address(body.address, runtime.settings.web.limits.max_address_chars)
    job, cached = live.start(address, body.max_tx)
    state = live.state(job)
    response.status_code = 200 if cached else 202
    response.headers["Location"] = state.links.status
    return state


@router.get("/lookups/{lookup_id}", response_model=LiveLookup, summary="A live lookup's status and progress",
            responses=error_responses(403, 404, 503))
def lookup_status(lookup_id: str, live: Live) -> LiveLookup:
    """`status` is one of `queued`, `fetching`, `scoring`, `done`, `failed`, `cancelled`; `progress` counts pages and
    transactions against `cap`; a failed lookup carries `error` with the same `status`, `message` and `hint` words an error body
    has. This is what E18 streams, and what a client polls (every 2 seconds) when the stream fails."""
    return live.state(live.job(lookup_id))


async def stream(live: LiveService, job: Job) -> AsyncIterator[str]:
    """The job's events from the first, in order, until the one that ends it; a comment line after each quiet spell."""
    sent = 0
    quiet_since = time.monotonic()
    while True:
        with job.lock:
            fresh = job.events[sent:]
            done = job.finished
        for name, data in fresh:
            yield f"event: {name}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"
            quiet_since = time.monotonic()
        sent += len(fresh)
        if done:  # sampled together with `fresh`, so nothing is left unsent
            return
        if time.monotonic() - quiet_since >= live.keepalive_seconds:
            yield ": keep-alive\n\n"
            quiet_since = time.monotonic()
        await asyncio.sleep(POLL_SECONDS)


@router.get("/lookups/{lookup_id}/events", summary="A live lookup's progress as server-sent events",
            response_class=StreamingResponse, responses={200: EVENT_STREAM, **error_responses(403, 404, 503)})
def lookup_events(lookup_id: str, live: Live) -> StreamingResponse:
    """The same body as E17 on every event: `status` when the lookup changes state, `progress` after each page fetched,
    then `done` or `failed`. A cancelled lookup ends with a `status` event whose `status` is `cancelled`. A client that
    connects late is replayed every event so far, so it never misses the end."""
    job = live.job(lookup_id)
    headers: dict[str, Any] = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(stream(live, job), media_type="text/event-stream", headers=headers)


@router.delete("/lookups/{lookup_id}", status_code=204, summary="Cancels a live lookup", responses=error_responses(403, 404, 503))
def cancel_lookup(lookup_id: str, live: Live) -> Response:
    """Answers 204. The fetch ends at the next page and nothing is stored; a lookup that has already finished is left as it is."""
    live.cancel(lookup_id)
    return Response(status_code=204)
