"""T05: the OpenAPI document builds, documents the routes and the contract, and the committed copy is current."""
from __future__ import annotations

import json
from pathlib import Path

from app.core.openapi import EXPORT_PATH, build_openapi
from app.main import create_app

CONTRACT_SCHEMAS = {"AddressesResponse", "LookupRequest", "LookupResponse", "TimelineResponse", "TransactionsResponse",
                    "TransactionDetail", "WhatIfRequest", "WhatIfResult", "CurveRequest", "CurveResponse", "MethodsResponse",
                    "ErrorBody", "HealthResponse", "ConfigResponse"}


def test_the_committed_openapi_json_is_current(settings) -> None:  # type: ignore[no-untyped-def]
    committed = json.loads(Path(EXPORT_PATH).read_text(encoding="utf-8"))
    assert build_openapi(create_app(settings)) == committed, "run: python -m app.core.openapi"


def test_every_route_has_a_summary_a_response_model_and_documented_errors(settings) -> None:  # type: ignore[no-untyped-def]
    document = build_openapi(create_app(settings))
    for path, operations in document["paths"].items():
        for method, operation in operations.items():
            assert operation.get("summary"), f"{method} {path} has no summary"
            ok = operation["responses"]["200"]["content"]["application/json"]["schema"]
            assert "$ref" in ok, f"{method} {path} has no response model"
            assert "503" in operation["responses"]


def test_the_contract_schemas_are_in_the_document(settings) -> None:  # type: ignore[no-untyped-def]
    schemas = build_openapi(create_app(settings))["components"]["schemas"]
    assert CONTRACT_SCHEMAS <= set(schemas)
    assert set(schemas["ErrorBody"]["properties"]) >= {"status", "message", "hint", "fields", "requestId", "examples",
                                                       "canLookupLive", "transaction", "history", "firstScoredDate"}
    assert schemas["ErrorBody"]["required"] == ["status", "message", "requestId"]


def test_an_error_body_documents_an_example(settings) -> None:  # type: ignore[no-untyped-def]
    schemas = build_openapi(create_app(settings))["components"]["schemas"]
    assert schemas["ErrorBody"]["example"]["status"] == "invalid"
    assert schemas["HealthResponse"]["example"]["addressCount"] == 28
