"""E7 GET /api/transactions/{txid}?address=: one transaction of one address."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..schemas.common import MethodId
from ..schemas.errors import SNAPSHOT_GET, error_responses
from ..schemas.transactions import TransactionDetail
from ..services.explorer_service import ExplorerService
from .deps import get_explorer, path_txid, query_address, snapshot_data

router = APIRouter(prefix="/api", tags=["transactions"])


@router.get("/transactions/{txid}", response_model=TransactionDetail,
            summary="One transaction: facts, features, reason and every method's verdict",
            dependencies=[Depends(snapshot_data)], responses={**SNAPSHOT_GET, **error_responses(400, 404, 422, 503)})
def transaction(txid: Annotated[str, Depends(path_txid)], address: Annotated[str, Depends(query_address)],
                explorer: Annotated[ExplorerService, Depends(get_explorer)],
                method: Annotated[MethodId | None, Query(description="Whose flag and score decide (S-01); default: the baseline.")] = None,
                ) -> TransactionDetail:
    """The transaction's facts, its four features with their usual values and z-scores, what each was compared with,
    the template's explanation and every method's score and flag. 404 `unsupported` for an address outside the
    snapshot, 404 `not_found` when the transaction is not that address's, and 422 `insufficient_history`, with the
    transaction's facts, when too little earlier history lay behind it to score it."""
    return explorer.detail(address, txid, method)
