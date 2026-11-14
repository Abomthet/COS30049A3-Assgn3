"""Refuse a request body over `web.limits.maxBodyBytes` with a 413 (plan sections 6.3 and 11.2; E4 and every POST and PUT).

The body is read here, at most one byte past the limit, and handed on unchanged, so the limit holds whether the client
declares a length or sends the body in chunks, and a route never sees a body it must not read. Written as plain
ASGI for the same reason as `RequestContextMiddleware`.
"""
from __future__ import annotations

from starlette.datastructures import Headers
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .errors import TooLarge, handle_api_error


class BodyLimitMiddleware:
    """Answers 413 `too_large` when a request body is longer than `max_bytes`."""

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        declared = headers.get("content-length")
        if declared is None and "transfer-encoding" not in headers:
            await self.app(scope, receive, send)  # no body
            return
        body = b""
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._refuse(scope, receive, send)
            return
        while True:
            message = await receive()
            if message["type"] != "http.request":  # the client went away: there is nobody to answer
                return
            body += message.get("body", b"")
            if len(body) > self.max_bytes:
                await self._refuse(scope, receive, send)
                return
            if not message.get("more_body", False):
                break
        await self.app(scope, _replay(body), send)

    async def _refuse(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Send the 413 body, built by the error handlers like every other."""
        error = TooLarge(f"The request body is larger than the {self.max_bytes / 1024:g} kB limit.",
                         "Send only the fields the endpoint asks for.")
        response = await handle_api_error(Request(scope), error)
        await response(scope, receive, send)


def _replay(body: bytes) -> Receive:
    """A `receive` that delivers the body already read as one message, then reports that the client is done."""
    pending: list[Message] = [{"type": "http.request", "body": body, "more_body": False}]

    async def receive() -> Message:
        return pending.pop(0) if pending else {"type": "http.disconnect"}

    return receive
