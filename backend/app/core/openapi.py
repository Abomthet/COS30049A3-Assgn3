"""The OpenAPI document, as the service really answers (T05, plan section 12.3).

Two things are done to what FastAPI generates:

* FastAPI lists only the models that a route uses. The contract of E8 to E11 is defined first (T05) and its
  routes follow (T13 to T15), so until then those models are added to `components.schemas` here. When a route
  uses a model the entry is the same, and the model can be dropped from the two tuples below.
* FastAPI documents a 422 `HTTPValidationError` on every route that takes input. This service answers 400 with the
  one error body (D-A3-5), so that entry and its two schemas are removed; each route declares its real errors.

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

from ..schemas.methods import MethodsResponse
from ..schemas.whatif import CurveRequest, CurveResponse, WhatIfRequest, WhatIfResult

# Requests are described as they are read, responses as they are written.
CONTRACT_REQUESTS: tuple[type[BaseModel], ...] = (WhatIfRequest, CurveRequest)
CONTRACT_RESPONSES: tuple[type[BaseModel], ...] = (WhatIfResult, CurveResponse, MethodsResponse)
# FastAPI's own validation-error schemas, which no route of this service answers with.
FRAMEWORK_VALIDATION_SCHEMAS = ("HTTPValidationError", "ValidationError")


def _drop_framework_422(document: dict[str, Any]) -> None:
    """Remove FastAPI's default 422 `HTTPValidationError` from every operation, and its schemas.

    A 422 that a route declares itself (E7's `insufficient_history`) does not use that schema and stays.
    """
    reference = "#/components/schemas/HTTPValidationError"
    for operations in document["paths"].values():
        for operation in operations.values():
            schema = operation["responses"].get("422", {}).get("content", {}).get("application/json", {}).get("schema", {})
            if schema.get("$ref") == reference:
                del operation["responses"]["422"]
    for name in FRAMEWORK_VALIDATION_SCHEMAS:
        document["components"]["schemas"].pop(name, None)


def build_openapi(app: FastAPI) -> dict[str, Any]:
    """The app's OpenAPI document with the contract-only schemas added and the framework's 422 removed."""
    document = get_openapi(title=app.title, version=app.version, description=app.description, routes=app.routes)
    _drop_framework_422(document)
    schemas = document["components"]["schemas"]
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
