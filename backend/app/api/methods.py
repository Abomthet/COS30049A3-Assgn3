"""E11 GET /api/methods: the nine methods, their thresholds and their test results."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..schemas.errors import SNAPSHOT_GET, error_responses
from ..schemas.methods import MethodsResponse
from ..services.methods_service import MethodsService
from .deps import get_methods, snapshot_data

router = APIRouter(prefix="/api", tags=["methods"])


@router.get("/methods", response_model=MethodsResponse, summary="The methods, their thresholds and test results",
            dependencies=[Depends(snapshot_data)], responses={**SNAPSHOT_GET, **error_responses(503)})
def methods(service: Annotated[MethodsService, Depends(get_methods)]) -> MethodsResponse:
    """For each method: its family, what its score measures, the score it flags at, whether it can score a new
    transaction, and Assignment 2's test results (mean recall and recall per planted pattern, each with its 95%
    interval, and the flag rate on real transactions). The numbers are read from Assignment 2's evaluation tables."""
    return service.methods()
