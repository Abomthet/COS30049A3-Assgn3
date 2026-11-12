"""Dependencies shared by the routers."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Path, Query, Request, Response

from ..core.runtime import Runtime
from ..core.validation import require_address, require_txid
from ..services.assistant_service import AssistantService
from ..services.explorer_service import ExplorerService
from ..services.export_service import ExportService
from ..services.methods_service import MethodsService
from ..services.model_service import require_ready
from ..services.watchlist_service import WatchlistService
from ..services.whatif_service import WhatIfService


def get_runtime(request: Request) -> Runtime:
    """The running service's shared state (settings, loaded Predictor)."""
    return request.app.state.runtime


def get_explorer(runtime: Annotated[Runtime, Depends(get_runtime)]) -> ExplorerService:
    """The explorer service, once the models are loaded.

    Raises:
        Unavailable: The models are still loading, or failed to load (503).
    """
    require_ready(runtime)
    assert runtime.explorer is not None  # `require_ready` passed
    return runtime.explorer


def get_whatif(runtime: Annotated[Runtime, Depends(get_runtime)]) -> WhatIfService:
    """The what-if service, once the models are loaded.

    Raises:
        Unavailable: The models are still loading, or failed to load (503).
    """
    require_ready(runtime)
    assert runtime.whatif is not None  # `require_ready` passed
    return runtime.whatif


def get_exports(runtime: Annotated[Runtime, Depends(get_runtime)]) -> ExportService:
    """The export service, once the models are loaded.

    Raises:
        Unavailable: The models are still loading, or failed to load (503).
    """
    require_ready(runtime)
    assert runtime.exports is not None  # `require_ready` passed
    return runtime.exports


def get_methods(runtime: Annotated[Runtime, Depends(get_runtime)]) -> MethodsService:
    """The methods service, once the models are loaded.

    Raises:
        Unavailable: The models are still loading, or failed to load (503).
    """
    require_ready(runtime)
    assert runtime.methods is not None  # `require_ready` passed
    return runtime.methods


def get_watchlist(runtime: Annotated[Runtime, Depends(get_runtime)]) -> WatchlistService:
    """The watchlist service, once the models are loaded.

    Raises:
        Unavailable: The models are still loading, or failed to load (503).
    """
    require_ready(runtime)
    assert runtime.watchlist is not None  # `require_ready` passed
    return runtime.watchlist


def get_assistant(runtime: Annotated[Runtime, Depends(get_runtime)]) -> AssistantService:
    """The Assistant service, once the models are loaded (it is built with the application, but E12 needs the explorer too).

    Raises:
        Unavailable: The models are still loading, or failed to load (503).
    """
    require_ready(runtime)
    assert runtime.assistant is not None  # built by `create_app`
    return runtime.assistant


def snapshot_data(response: Response) -> None:
    """Mark a route's answer as snapshot data: `Cache-Control: no-cache`, which also gets it an `ETag` (plan section 6.1)."""
    response.headers["Cache-Control"] = "no-cache"


def path_address(address: Annotated[str, Path(description="A Bitcoin address.")],
                 runtime: Annotated[Runtime, Depends(get_runtime)]) -> str:
    """The address of the path, checked and normalised.

    Raises:
        InvalidRequest: The address fails the checker (400), with its specific message.
    """
    return require_address(address, runtime.settings.web.limits.max_address_chars)


def query_address(address: Annotated[str, Query(description="The address the transaction belongs to.")],
                  runtime: Annotated[Runtime, Depends(get_runtime)]) -> str:
    """The `address` query parameter, checked and normalised.

    Raises:
        InvalidRequest: The address fails the checker (400).
    """
    return require_address(address, runtime.settings.web.limits.max_address_chars)


def path_txid(txid: Annotated[str, Path(description="A transaction ID: 64 hexadecimal characters.")]) -> str:
    """The transaction ID of the path, checked and lower-cased.

    Raises:
        InvalidRequest: The ID is not 64 hexadecimal characters (400).
    """
    return require_txid(txid)
