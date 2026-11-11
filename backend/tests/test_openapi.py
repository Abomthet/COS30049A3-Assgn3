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


# The statuses the plan gives each route (section 6.2), besides 200 and the 503 of a service that is still starting.
PLANNED_STATUSES = {
    ("get", "/api/health"): set(), ("get", "/api/config"): set(),
    ("get", "/api/addresses"): {"304", "400"},
    ("post", "/api/lookup"): {"400", "404", "413", "415"},
    ("get", "/api/addresses/{address}/timeline"): {"304", "400", "404"},
    ("get", "/api/addresses/{address}/transactions"): {"304", "400", "404"},
    ("get", "/api/transactions/{txid}"): {"304", "400", "404", "422"},
    ("post", "/api/addresses/{address}/what-if"): {"400", "404", "413", "415", "422"},
    ("post", "/api/addresses/{address}/what-if/curve"): {"400", "404", "413", "415", "422"},
    ("get", "/api/addresses/{address}/export"): {"304", "400", "404"},
    ("get", "/api/methods"): {"304"},
}


def test_each_route_documents_the_statuses_the_plan_gives_it(settings) -> None:  # type: ignore[no-untyped-def]
    paths = build_openapi(create_app(settings))["paths"]
    found = {(method, path): set(operation["responses"]) - {"200", "503"} for path, operations in paths.items()
             for method, operation in operations.items()}
    assert found == PLANNED_STATUSES


def test_validation_errors_are_documented_as_the_400_error_body_and_no_422_http_validation_error_remains(settings) -> None:  # type: ignore[no-untyped-def]
    document = build_openapi(create_app(settings))
    assert "HTTPValidationError" not in json.dumps(document) and "ValidationError" not in document["components"]["schemas"]
    error = {"$ref": "#/components/schemas/ErrorBody"}
    for path, operations in document["paths"].items():
        for method, operation in operations.items():
            if operation.get("parameters") or operation.get("requestBody"):
                assert operation["responses"]["400"]["content"]["application/json"]["schema"] == error, f"{method} {path}"
            for status, response in operation["responses"].items():
                if status not in ("200", "304"):
                    assert response["content"]["application/json"]["schema"] == error, f"{method} {path} {status}"


def test_e7_documents_its_422_as_insufficient_history(settings) -> None:  # type: ignore[no-untyped-def]
    operation = build_openapi(create_app(settings))["paths"]["/api/transactions/{txid}"]["get"]
    assert operation["responses"]["422"]["description"] == "Too little earlier history to score."


def test_the_snapshot_gets_document_the_conditional_request(settings) -> None:  # type: ignore[no-untyped-def]
    paths = build_openapi(create_app(settings))["paths"]
    assert "304" in paths["/api/addresses"]["get"]["responses"] and "304" not in paths["/api/health"]["get"]["responses"]
