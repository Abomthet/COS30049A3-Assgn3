"""E12 POST /api/explanations: the Explorer Assistant's guarded explanation of one transaction, or the template."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from ..core.errors import InvalidRequest
from ..core.runtime import Runtime
from ..core.validation import require_address, require_txid
from ..schemas.errors import FieldError, error_responses
from ..schemas.explanations import ExplanationRequest, ExplanationResponse
from ..services.assistant_service import AssistantService
from ..services.explorer_service import ExplorerService
from ..services.whatif_service import WhatIfService
from .deps import get_assistant, get_explorer, get_runtime, get_whatif

router = APIRouter(prefix="/api", tags=["assistant"])


@router.post("/explanations", response_model=ExplanationResponse,
             summary="The Assistant's guarded explanation of a transaction, or the template",
             responses=error_responses(400, 404, 413, 415, 422, 429, 503))
def explain(body: ExplanationRequest, runtime: Annotated[Runtime, Depends(get_runtime)],
            explorer: Annotated[ExplorerService, Depends(get_explorer)], whatif: Annotated[WhatIfService, Depends(get_whatif)],
            assistant: Annotated[AssistantService, Depends(get_assistant)]) -> ExplanationResponse:
    """Body: `address` and either `txid` (a snapshot transaction) or `whatIf` (`amountBtc`, `direction`, `time`, as E8).
    200 with the explanation to show: the Assistant's answer when it passed every guardrail check, otherwise the template,
    with `attempts` naming the checks a rejected answer failed (the rejected text is never sent). Prepared and cached
    answers come back at once (`cached`). With the Assistant off or not installed the template comes back and
    `skippedWriters` says why. 400 names each field at fault; 404 for an unknown address or transaction; 422 when the
    transaction could not be scored; 429 with `Retry-After` while another answer is being written. A first answer takes
    about 10 seconds with the model's load; later ones about 3."""
    address = require_address(body.address, runtime.settings.web.limits.max_address_chars)
    if body.txid is not None:
        transaction = explorer.scored_transaction(address, require_txid(body.txid))
    else:
        assert body.what_if is not None  # the body's validator needs one of the two
        try:
            transaction = whatif.scored_what_if(address, body.what_if)
        except InvalidRequest as error:  # name the fields as this body writes them
            raise InvalidRequest(error.message, error.hint, [FieldError(name=f"whatIf.{f.name}", message=f.message) for f in error.fields]) from None
    return assistant.explain(transaction)
