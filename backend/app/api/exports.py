"""E10 GET /api/addresses/{address}/export: the scored transactions as a CSV or JSON file."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response

from ..schemas.errors import SNAPSHOT_GET, error_responses
from ..schemas.exports import ExportDocument, ExportQuery
from ..services.export_service import CSV_MEDIA_TYPE, ExportService
from .deps import get_exports, path_address

router = APIRouter(prefix="/api", tags=["export"])

FILE_RESPONSE = {
    "description": "The file. `Content-Disposition: attachment` names it from the first eight characters of the address and the snapshot date.",
    "model": ExportDocument,  # the JSON file's shape; the CSV is plain text
    "content": {CSV_MEDIA_TYPE: {"schema": {"type": "string"}}},
    "headers": {"Content-Disposition": {"description": "attachment; filename=\"1Bbcsfxj-2026-10-22.csv\"", "schema": {"type": "string"}}},
}


@router.get("/addresses/{address}/export", response_class=Response, summary="The scored transactions as a CSV or JSON file",
            responses={200: FILE_RESPONSE, **SNAPSHOT_GET, **error_responses(400, 404, 503)})
def export(address: Annotated[str, Depends(path_address)], query: Annotated[ExportQuery, Query()],
           service: Annotated[ExportService, Depends(get_exports)]) -> Response:
    """The rows E6 would list for the same filters, all of them, in the order asked for. `format` is `csv` (the default;
    UTF-8, a header row, amounts in BTC, text guarded against formulas) or `json`. A flagged row carries the limitation line."""
    file = service.export(address, query)
    return Response(file.content, media_type=file.media_type,
                    headers={"Content-Disposition": f'attachment; filename="{file.filename}"', "Cache-Control": "no-cache"})
