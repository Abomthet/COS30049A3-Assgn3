"""E8 POST /api/addresses/{address}/what-if and E9 POST /api/addresses/{address}/what-if/curve."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..schemas.errors import error_responses
from ..schemas.whatif import CurveRequest, CurveResponse, WhatIfRequest, WhatIfResult
from ..services.whatif_service import WhatIfService
from .deps import get_whatif, path_address

router = APIRouter(prefix="/api", tags=["what-if"])

WhatIf = Annotated[WhatIfService, Depends(get_whatif)]


@router.post("/addresses/{address}/what-if", response_model=WhatIfResult,
             summary="A hypothetical transaction's verdict from every model that can score it",
             responses=error_responses(400, 404, 413, 415, 422, 503))
def what_if(address: Annotated[str, Depends(path_address)], body: WhatIfRequest, service: WhatIf) -> WhatIfResult:
    """Scores a transaction of `amountBtc` BTC, `direction` in or out, at `time`, against the address's real history
    strictly before that time. Nothing is stored. 400 names each field at fault; 404 `unsupported` for an address outside
    the snapshot; 422 when too little history lay before the time, with the counts and the first day that can be scored."""
    return service.what_if(address, body)


@router.post("/addresses/{address}/what-if/curve", response_model=CurveResponse,
             summary="Scores over a range of amounts, from one feature build",
             responses=error_responses(400, 404, 413, 415, 422, 503))
def curve(address: Annotated[str, Depends(path_address)], body: CurveRequest, service: WhatIf) -> CurveResponse:
    """The same hypothetical transaction at many amounts: `amountsBtc` (up to `curveMaxPoints`), or `minBtc`, `maxBtc` and
    `points` spaced on a log scale, or neither, for `curvePoints` amounts from a hundredth to a thousand times the
    address's usual amount in that direction. Each method answers one score and one flag per amount; the scores equal
    what E8 gives for each amount alone. Errors as E8."""
    return service.curve(address, body)
