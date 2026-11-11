"""Request identifiers and the access log (T07, plan sections 6.1 and 11.3).

Every response carries `X-Request-ID`, the error body repeats it as `requestId`, and the one log
line per request starts with it, so a failure on screen can be found in the log. Bodies are never
logged. Written as plain ASGI rather than `BaseHTTPMiddleware`, which would hide an exception from
the catch-all handler.
"""
from __future__ import annotations

import logging
import re
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"
# A caller may supply its own identifier (the browser does, to tie a click to a log line); anything else is replaced.
_ACCEPTED_ID = re.compile(r"[A-Za-z0-9._-]{8,64}")
log = logging.getLogger("app.request")


def new_request_id() -> str:
    """Twelve hexadecimal characters, such as 0f3c9a1e7b2d."""
    return uuid.uuid4().hex[:12]


def request_id_of(request: Request) -> str:
    """The identifier the middleware gave this request (a fresh one if the middleware did not run)."""
    return getattr(request.state, "request_id", None) or new_request_id()


class RequestContextMiddleware:
    """Gives each HTTP request an identifier, adds it to the response and logs the outcome."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        supplied = Headers(scope=scope).get(REQUEST_ID_HEADER, "")
        request_id = supplied if _ACCEPTED_ID.fullmatch(supplied) else new_request_id()
        scope.setdefault("state", {})["request_id"] = request_id
        status = 500  # what the catch-all handler will answer if the application raises
        started = time.perf_counter()

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            # The raw path stays percent-encoded, so a request cannot inject a line break into the log.
            path = scope.get("raw_path", b"").decode("ascii", "replace") or scope["path"]
            log.info("%s %s %s %d %.0f ms", request_id, scope["method"], path, status, (time.perf_counter() - started) * 1000)
