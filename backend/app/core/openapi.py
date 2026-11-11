"""The OpenAPI document, including schemas whose routes are not built yet (T05, plan section 12.3).

FastAPI lists only the models that a route uses. The contract of E3 to E11 is defined first (T05) and
its routes follow (T11 to T15), so until then those models are added to `components.schemas` here.
When a route uses a model the entry is the same, and the model can be dropped from the two tuples below.

    python -m app.core.openapi        (from backend/) rewrites backend/openapi.json
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel
from pydantic.json_schema import models_json_schema

from ..schemas.addresses import AddressesResponse, LookupRequest, LookupResponse, TimelineResponse, TransactionsResponse
from ..schemas.methods import MethodsResponse
from ..schemas.transactions import TransactionDetail
from ..schemas.whatif import CurveRequest, CurveResponse, WhatIfRequest, WhatIfResult

# Requests are described as they are read, responses as they are written.
CONTRACT_REQUESTS: tuple[type[BaseModel], ...] = (LookupRequest, WhatIfRequest, CurveRequest)
CONTRACT_RESPONSES: tuple[type[BaseModel], ...] = (AddressesResponse, LookupResponse, TimelineResponse, TransactionsResponse,
                                                   TransactionDetail, WhatIfResult, CurveResponse, MethodsResponse)


def build_openapi(app: FastAPI) -> dict[str, Any]:
    """The app's OpenAPI document with the contract-only schemas added."""
    document = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
    schemas = document.setdefault("components", {}).setdefault("schemas", {})
    template = "#/components/schemas/{model}"
    for mode, models in (("validation", CONTRACT_REQUESTS), ("serialization", CONTRACT_RESPONSES)):
        _, extra = models_json_schema([(model, mode) for model in models], ref_template=template)
        for name, schema in extra.get("$defs", {}).items():
            schemas.setdefault(name, schema)
    document["components"]["schemas"] = dict(sorted(schemas.items()))
    return document


def install_openapi(app: FastAPI) -> None:
    """Serve `build_openapi` from `/openapi.json`, built once."""

    def openapi() -> dict[str, Any]:
        if app.openapi_schema is None:
            app.openapi_schema = build_openapi(app)
        return app.openapi_schema

    app.openapi = openapi  # type: ignore[method-assign]


EXPORT_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def export_openapi(path: Path = EXPORT_PATH) -> str:
    """The OpenAPI document as the text committed in backend/openapi.json (the report's API appendix reads it)."""
    from ..main import app  # imported here: main imports this module

    text = json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8")
    return text


if __name__ == "__main__":  # python -m app.core.openapi, from backend/
    export_openapi()
    print(f"Wrote {EXPORT_PATH}")
