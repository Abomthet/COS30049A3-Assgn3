"""Dependencies shared by the routers."""
from __future__ import annotations

from fastapi import Request

from ..core.runtime import Runtime


def get_runtime(request: Request) -> Runtime:
    """The running service's shared state (settings, loaded Predictor)."""
    return request.app.state.runtime
