"""The service's rules for requests that failed their type check (a 400 names every field at fault; plan section 11.2).

Pydantic checks types and stops; the page-size limit, the amount range and the time limit are the services' rules, which
run only once a request has parsed. `core.errors.handle_validation` looks a failed request's route up here and adds
what these rules find in the values that did parse, so `?pageSize=999&status=bogus` names both fields, not one.
Each entry hands the raw request to the service that owns the rules; no rule is written here.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from ..core.errors import FieldRules, RawRequest
from ..core.runtime import Runtime
from ..core.validation import require_address
from ..schemas.errors import FieldError


def _address(runtime: Runtime, raw: RawRequest) -> str:
    """The path's address as the services know it. The route's own dependency has already refused a malformed one."""
    return require_address(raw.path["address"], runtime.settings.web.limits.max_address_chars)


def _body(raw: RawRequest) -> Mapping[str, Any]:
    """The JSON body, or an empty one when there was none (its absence is Pydantic's to report)."""
    return raw.body if isinstance(raw.body, Mapping) else {}


def _rows(runtime: Runtime, raw: RawRequest) -> list[FieldError]:
    """E6's query."""
    assert runtime.explorer is not None  # `handle_validation` calls rules only once the service is ready
    return runtime.explorer.rejected_query(raw.query, paged=True)


def _export(runtime: Runtime, raw: RawRequest) -> list[FieldError]:
    """E10's query: E6's filters, without a page."""
    assert runtime.explorer is not None
    return runtime.explorer.rejected_query(raw.query, paged=False)


def _what_if(runtime: Runtime, raw: RawRequest) -> list[FieldError]:
    """E8's body."""
    assert runtime.whatif is not None
    return runtime.whatif.rejected_what_if(_address(runtime, raw), _body(raw))


def _curve(runtime: Runtime, raw: RawRequest) -> list[FieldError]:
    """E9's body."""
    assert runtime.whatif is not None
    return runtime.whatif.rejected_curve(_address(runtime, raw), _body(raw))


def _watchlist(runtime: Runtime, raw: RawRequest) -> list[FieldError]:
    """E14's body."""
    assert runtime.watchlist is not None
    return runtime.watchlist.rejected_put(_body(raw))


# Keyed by (method, path template), as FastAPI names a route.
FIELD_RULES: dict[tuple[str, str], FieldRules] = {
    ("GET", "/api/addresses/{address}/transactions"): _rows,
    ("GET", "/api/addresses/{address}/export"): _export,
    ("PUT", "/api/watchlist/{address}"): _watchlist,
    ("POST", "/api/addresses/{address}/what-if"): _what_if,
    ("POST", "/api/addresses/{address}/what-if/curve"): _curve,
}
