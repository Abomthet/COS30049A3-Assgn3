"""Exceptions and the handlers that turn every failure into the one error body (T08, M-10, Mod-8).

Services raise the package's own exceptions and never know about HTTP: Assignment 2's `Unsupported`
(404) and `InsufficientHistory` (422), a `ValueError` (400), or one of the `ApiError` classes below.
This module is the only place that decides a status code and builds a body (plan section 6.3).

Validation errors answer 400, not FastAPI's default 422 (D-A3-5): Assignment 1 promised 422 only for
"too little history", and a client can then read every 4xx by `status` alone.

A response never contains a stack trace, a file path, a library's own error text or an echo of the
input. The real text of an unexpected error goes to the log under the same request identifier.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from functools import partial
from typing import Any

from explorer.predict import InsufficientHistory, Unsupported
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..schemas.errors import ErrorBody, ErrorStatus, FieldError
from .middleware import REQUEST_ID_HEADER, request_id_of
from .runtime import Runtime

log = logging.getLogger("app.errors")

DEFAULT_HINT = "Check the value and try again."
NUMBER_WORDS = ("No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten")


@dataclass(frozen=True)
class RawRequest:
    """What a request carried, before any type check: the path and query parameters and the parsed JSON body, by wire names."""

    path: Mapping[str, str]
    query: Mapping[str, str]
    body: Any


# The service rules of one route, applied to a request that failed its type check: the fields at fault that Pydantic,
# which stops at types, could not see (see `handle_validation`). Routes without an entry add nothing.
FieldRules = Callable[[Runtime, RawRequest], list[FieldError]]


class ApiError(Exception):
    """A failure a service or router raises on purpose; the handler answers `status_code` with `status`."""

    status_code = 500
    status: ErrorStatus = "server_error"

    def __init__(self, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint


class InvalidRequest(ApiError):
    """A value is malformed or out of range (400). `fields` names the form fields at fault."""

    status_code = 400
    status = "invalid"

    def __init__(self, message: str, hint: str | None = None, fields: Sequence[FieldError] = ()) -> None:
        super().__init__(message, hint or DEFAULT_HINT)
        self.fields = list(fields)


class NotFound(ApiError):
    """An unknown transaction for that address, watchlist entry, lookup or path (404)."""

    status_code = 404
    status = "not_found"


class Conflict(ApiError):
    """The request cannot be carried out in the present state: a full watchlist, a lookup already running, a snapshot address
    that cannot be forgotten (409)."""

    status_code = 409
    status = "conflict"


class Disabled(ApiError):
    """Live lookup is switched off on this server (403): `EXPLORER_LIVE_LOOKUP` is not `on`."""

    status_code = 403
    status = "disabled"


class UpstreamError(ApiError):
    """The public blockchain service answered with an error, or with something this service cannot use (502)."""

    status_code = 502
    status = "upstream_error"


class UpstreamTimeout(ApiError):
    """The public blockchain service did not answer in time (504)."""

    status_code = 504
    status = "upstream_timeout"


class TooLarge(ApiError):
    """A request body over `web.limits.maxBodyBytes` (413)."""

    status_code = 413
    status = "too_large"


class RateLimited(ApiError):
    """Another request holds the one place there is, such as the Assistant's single answer at a time (429).

    `retry_after` is the whole seconds the client should wait; it goes into the `Retry-After` header.
    """

    status_code = 429
    status = "rate_limited"

    def __init__(self, message: str, retry_after: int, hint: str | None = None) -> None:
        super().__init__(message, hint)
        self.retry_after = retry_after


class Unavailable(ApiError):
    """The service cannot answer yet or a file it needs is missing (503)."""

    status_code = 503
    status = "unavailable"


def error_response(request: Request, status_code: int, status: ErrorStatus, message: str, headers: Mapping[str, str] | None = None,
                   **extras: Any) -> JSONResponse:
    """Build the one error body. Only the keys given are sent, so an unused extra is absent and an explicit null stays.

    `headers` are added to the request identifier, which every error carries (`Retry-After` on a 429).
    """
    request_id = request_id_of(request)
    body = ErrorBody(status=status, message=message, request_id=request_id, **extras)
    return JSONResponse(body.model_dump(by_alias=True, exclude_unset=True), status_code=status_code,
                        headers={**(headers or {}), REQUEST_ID_HEADER: request_id})


# ---------------------------------------------------------------- the handlers


async def handle_api_error(request: Request, exc: Exception) -> JSONResponse:
    """The `ApiError` classes."""
    assert isinstance(exc, ApiError)
    extras: dict[str, Any] = {} if exc.hint is None else {"hint": exc.hint}
    if isinstance(exc, InvalidRequest) and exc.fields:
        extras["fields"] = exc.fields
    headers = {"Retry-After": str(exc.retry_after)} if isinstance(exc, RateLimited) else None
    return error_response(request, exc.status_code, exc.status, exc.message, headers, **extras)


def _describe(error: dict[str, Any]) -> str:
    """A field's problem in plain words, from Pydantic's error type. Pydantic's own text is never shown."""
    kind, context = error["type"], error.get("ctx", {})
    if kind == "missing":
        return "This field is required."
    if kind == "extra_forbidden":
        return "Not a known field."
    if kind == "value_error":  # raised by our own validators, whose text is written for people
        return str(context["error"])
    if kind in ("literal_error", "enum"):
        return f"Must be {context['expected'].replace(chr(39), chr(34))}."
    limits = {"greater_than": "Must be greater than {gt}.", "greater_than_equal": "Must be at least {ge}.",
              "less_than": "Must be less than {lt}.", "less_than_equal": "Must be at most {le}."}
    if kind in limits:
        return limits[kind].format(**context)
    if kind.startswith(("int_", "decimal_", "float_")):
        return "Must be a whole number." if kind.startswith("int_") else "Must be a number."
    if kind.startswith(("datetime", "timezone")):
        return "Use a date and time such as 2026-10-20T12:00:00Z."
    if kind.startswith("date"):
        return "Enter a date like 2026-10-20."
    if kind == "string_type":
        return "Must be text."
    if kind == "list_type":
        return "Must be a list."
    # kind: (wording, the limit's key in ctx, the noun); the old wording stays for a ctx without the limit
    lengths = {"string_too_short": ("Must be at least {n} {noun}.", "min_length", "character"),
               "string_too_long": ("Must be at most {n} {noun}.", "max_length", "character"),
               "too_short": ("Must have at least {n} {noun}.", "min_length", "item"),
               "too_long": ("Must have at most {n} {noun}.", "max_length", "item")}
    if kind in lengths:
        wording, key, noun = lengths[kind]
        if context.get(key) is None:
            return "Must be text of an acceptable length." if kind.startswith("string") else "Must be a list of an acceptable length."
        n = context[key]
        return wording.format(n=n, noun=noun if n == 1 else noun + "s")
    if kind in ("bool_type", "bool_parsing"):
        return "Must be true or false."
    return "This value is not acceptable."


def needs_correcting(count: int) -> str:
    """'One value needs correcting.', 'Three values need correcting.': the message of a body with `fields`."""
    noun = "value needs" if count == 1 else "values need"
    return f"{NUMBER_WORDS[count] if count < len(NUMBER_WORDS) else count} {noun} correcting."


def _field_name(location: Sequence[Any]) -> str:
    """The name a client knows: a query or path parameter by its name (not by the position of a repeated value),
    a body field by its dotted path."""
    if location[0] in ("query", "path", "header"):
        return str(location[1])
    return ".".join(str(part) for part in location[1:]) or "body"


async def handle_validation(request: Request, exc: Exception, field_rules: Mapping[tuple[str, str], FieldRules]) -> JSONResponse:
    """FastAPI's `RequestValidationError`: 400 with every field at fault (415 when the body is not JSON at all).

    Pydantic reports the fields that failed their type check and stops there, before the service's rules (page-size
    limit, amount range, time limit) run. A 400 should name every field at fault at once, so the route's rules are
    then applied to the values that did pass; a value that failed its type check has nothing to judge further.
    """
    assert isinstance(exc, RequestValidationError)
    errors = exc.errors()
    if any(e["type"] == "json_invalid" for e in errors):
        return error_response(request, 400, "invalid", "The request body is not valid JSON.",
                              hint="Check the commas and quotation marks, or build the body with a JSON library.")
    if any(e["type"] == "model_attributes_type" for e in errors):
        if request.headers.get("content-type", "").startswith("application/json"):
            return error_response(request, 400, "invalid", "The request body must be a JSON object.", hint=DEFAULT_HINT)
        return error_response(request, 415, "invalid", "The request body must be JSON.",
                              hint="Send the body as JSON with the header Content-Type: application/json.")
    fields = [FieldError(name=_field_name(e["loc"]), message=_describe(e)) for e in errors]
    route = request.scope.get("route")
    rules = field_rules.get((request.method, route.path)) if route is not None else None
    runtime: Runtime = request.app.state.runtime
    if rules is not None and runtime.ready:
        fields += rules(runtime, RawRequest(request.path_params, request.query_params, exc.body))
    return error_response(request, 400, "invalid", needs_correcting(len(fields)),
                          hint="Correct the values named below and send the request again.", fields=fields)


async def handle_http_exception(request: Request, exc: Exception) -> JSONResponse:
    """Errors raised by the framework itself: an unknown path (404), a wrong method (405) and the like."""
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 404:
        return error_response(request, 404, "not_found", "There is nothing at this link.",
                              hint="Check the address, or go back to the list.")
    if exc.status_code == 405:
        return error_response(request, 405, "invalid", "That method is not allowed here.",
                              hint="The API's documentation at /docs lists the methods each path accepts.")
    if exc.status_code < 500:
        return error_response(request, exc.status_code, "invalid", "The request could not be accepted.", hint=DEFAULT_HINT)
    return await handle_unexpected(request, exc)


async def handle_unsupported(request: Request, exc: Exception) -> JSONResponse:
    """Assignment 2's `Unsupported`: a valid address that is not in the snapshot (404), with three that are."""
    runtime: Runtime = request.app.state.runtime
    facts = runtime.facts
    assert facts is not None  # the Predictor that raised this is loaded
    message = f"This address is not one of the {facts.address_count} in the snapshot."
    return error_response(request, 404, "unsupported", message, examples=list(facts.examples),
                          can_lookup_live=runtime.settings.live_lookup)


async def handle_insufficient_history(request: Request, exc: Exception) -> JSONResponse:
    """Assignment 2's `InsufficientHistory`: too little earlier history to score (422). Its body is passed through."""
    assert isinstance(exc, InsufficientHistory)
    body = exc.body
    extras = {key: body[key] for key in ("history", "firstScoredDate", "transaction") if key in body}
    return error_response(request, 422, "insufficient_history", body["message"], **extras)


async def handle_value_error(request: Request, exc: Exception) -> JSONResponse:
    """A `ValueError` from a service (400). Its text may come from a library, so it is logged, not sent."""
    log.warning("%s rejected a value: %s", request_id_of(request), exc)
    return error_response(request, 400, "invalid", "A value in the request is not acceptable.", hint=DEFAULT_HINT)


async def handle_missing_file(request: Request, exc: Exception) -> JSONResponse:
    """A model or table the service needs is missing (503)."""
    log.error("%s a required file is missing: %s", request_id_of(request), exc)
    return error_response(request, 503, "unavailable", "A data file is missing.", hint="Try again, or tell the team.")


async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
    """Anything else (500): a fixed message and the request identifier; the trace goes to the log only."""
    log.error("%s unhandled error", request_id_of(request), exc_info=exc)
    return error_response(request, 500, "server_error", "Something went wrong on our side.",
                          hint="Try again. If it keeps happening, give the request identifier to the team.")


def register_handlers(app: FastAPI, field_rules: Mapping[tuple[str, str], FieldRules] | None = None) -> None:
    """Install every handler. Starlette picks the most specific class first, so `InsufficientHistory`
    (a `ValueError`) is answered before the generic `ValueError` handler.

    Args:
        app: The application.
        field_rules: Per route, keyed by (method, path template), the service rules `handle_validation` adds to a 400.
    """
    app.add_exception_handler(ApiError, handle_api_error)
    app.add_exception_handler(RequestValidationError, partial(handle_validation, field_rules=field_rules or {}))
    app.add_exception_handler(StarletteHTTPException, handle_http_exception)
    app.add_exception_handler(Unsupported, handle_unsupported)
    app.add_exception_handler(InsufficientHistory, handle_insufficient_history)
    app.add_exception_handler(ValueError, handle_value_error)
    app.add_exception_handler(FileNotFoundError, handle_missing_file)
    app.add_exception_handler(Exception, handle_unexpected)
