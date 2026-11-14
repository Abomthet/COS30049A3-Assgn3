"""E1 GET /api/health and E2 GET /api/config."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from ..core.runtime import Runtime
from ..schemas.errors import SNAPSHOT_GET, error_responses
from ..schemas.system import ConfigResponse, HealthResponse
from ..services import system_service
from .deps import get_runtime, snapshot_data

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health", response_model=HealthResponse, summary="Is the service ready, and what has it loaded",
            responses=error_responses(503))
def health(response: Response, runtime: Annotated[Runtime, Depends(get_runtime)]) -> HealthResponse:
    """Answers 200 once the models are loaded, and 503 while they load. Never cached: the front end polls it."""
    response.headers["Cache-Control"] = "no-store"
    return system_service.build_health(runtime)


@router.get("/config", response_model=ConfigResponse, summary="Limits, thresholds, names and capabilities",
            dependencies=[Depends(snapshot_data)], responses={**SNAPSHOT_GET, **error_responses(503)})
def config(runtime: Annotated[Runtime, Depends(get_runtime)]) -> ConfigResponse:
    """Everything the front end would otherwise hard-code: the snapshot, the limitation line, the four features,
    the history rule, the two z lines, the default method, the `web` limits and which optional parts are on.
    Carries an `ETag`: the front end reads it at start and after each recovery, and a repeat costs a 304."""
    return system_service.build_config(runtime)
