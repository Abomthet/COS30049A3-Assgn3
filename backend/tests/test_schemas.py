"""T05: the schemas produce the shapes of frontend/src/api/types.ts, and parse requests as the plan says."""
from __future__ import annotations

import re
from decimal import Decimal
from pathlib import Path
from types import NoneType
from typing import get_args

import pytest
from pydantic import BaseModel, ValidationError

from app.schemas import addresses, common, errors, transactions, whatif

TYPES_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "api" / "types.ts"

# Assignment 1's interfaces and the model that answers them. DayResponse is left out on purpose: E6's `date`
# may be null and its rows carry more, which the plan changes (section 6.4).
CONTRACT: dict[str, type[BaseModel]] = {
    "SnapshotInfo": common.SnapshotInfo, "MethodInfo": common.MethodInfo, "HistoryRequirement": common.HistoryRequirement,
    "AddressSummary": common.AddressSummary, "AddressesResponse": addresses.AddressesResponse,
    "LookupResponse": addresses.LookupResponse, "TimelineDay": addresses.TimelineDay,
    "TimelineResponse": addresses.TimelineResponse, "TransactionRow": addresses.TransactionRow,
    "TransactionCore": transactions.TransactionCore, "FeatureDetail": transactions.FeatureDetail,
    "ComparisonBasis": transactions.ComparisonBasis, "TransactionDetail": transactions.TransactionDetail,
    "InvalidBody": errors.ErrorBody, "UnsupportedBody": errors.ErrorBody, "InsufficientHistoryBody": errors.ErrorBody,
    "NotFoundBody": errors.ErrorBody,
}
# Error bodies are sent with only the keys that apply, so a key that is optional in the model is not a mismatch.
ERROR_INTERFACES = {"InvalidBody", "UnsupportedBody", "InsufficientHistoryBody", "NotFoundBody"}


def parse_interfaces(source: str) -> dict[str, dict[str, tuple[bool, str]]]:
    """name -> {property: (required, type text)} for each exported interface, following `extends` (depth-1 keys only)."""
    interfaces: dict[str, dict[str, tuple[bool, str]]] = {}
    for match in re.finditer(r"export interface (\w+)(?: extends (\w+))? \{", source):
        name, parent = match.groups()
        depth, properties = 1, dict(interfaces.get(parent, {}))
        for line in source[match.end():].splitlines()[1:]:
            stripped = line.strip()
            if depth == 1:
                prop = re.match(r"(\w+)(\?)?:\s*(.*)", stripped)
                if prop and not stripped.startswith(("/", "*")):
                    properties[prop.group(1)] = (prop.group(2) is None, prop.group(3))
            depth += line.count("{") - line.count("}")
            if depth == 0:
                break
        interfaces[name] = properties
    return interfaces


def allows_none(model: type[BaseModel], alias: str) -> bool:
    field = next(f for n, f in model.model_fields.items() if (f.alias or n) == alias)
    return NoneType in get_args(field.annotation)


@pytest.mark.skipif(not TYPES_TS.exists(), reason="the front end is not in this checkout")
@pytest.mark.parametrize("interface", CONTRACT)
def test_model_has_every_property_of_the_prototype_contract(interface: str) -> None:
    model = CONTRACT[interface]
    properties = parse_interfaces(TYPES_TS.read_text(encoding="utf-8"))[interface]
    aliases = {f.alias or n for n, f in model.model_fields.items()}
    assert set(properties) <= aliases
    if interface in ERROR_INTERFACES:
        return
    for name, (required, text) in properties.items():
        assert allows_none(model, name) == ("null" in text), f"{interface}.{name} nullability"
        assert required, f"{interface}.{name} is optional in the contract but always sent"


def test_amounts_are_decimals_and_one_comma_is_the_decimal_point() -> None:
    body = {"amountBtc": "0,05", "direction": "out", "time": "2026-10-20T12:00:00Z"}
    assert whatif.WhatIfRequest.model_validate(body).amount_btc == Decimal("0.05")
    assert whatif.WhatIfRequest.model_validate({**body, "amountBtc": 0.1}).amount_btc == Decimal("0.1")


@pytest.mark.parametrize("amount", ["1,000.5", "1,000,000", "abc", "", True])
def test_grouping_separators_and_words_are_refused(amount: object) -> None:
    with pytest.raises(ValidationError):
        whatif.WhatIfRequest.model_validate({"amountBtc": amount, "direction": "out", "time": "2026-10-20T12:00:00Z"})


@pytest.mark.parametrize("time", ["tomorrow", "2026-10-20T12:00:00", "2026-10-20"])
def test_time_needs_a_zone(time: str) -> None:
    with pytest.raises(ValidationError):
        whatif.WhatIfRequest.model_validate({"amountBtc": 1, "direction": "in", "time": time})


def test_requests_refuse_unknown_fields_and_wrong_directions() -> None:
    good = {"amountBtc": 1, "direction": "in", "time": "2026-10-20T12:00:00Z"}
    with pytest.raises(ValidationError):
        whatif.WhatIfRequest.model_validate({**good, "colour": "red"})
    with pytest.raises(ValidationError):
        whatif.WhatIfRequest.model_validate({**good, "direction": "none"})
    with pytest.raises(ValidationError):
        addresses.LookupRequest.model_validate({"address": "x", "extra": 1})


def test_a_curve_chooses_amounts_one_way() -> None:
    base = {"direction": "out", "time": "2026-10-20T12:00:00Z"}
    assert whatif.CurveRequest.model_validate(base).amounts_btc is None
    assert whatif.CurveRequest.model_validate({**base, "amountsBtc": [0.1, "0,2"]}).amounts_btc == [Decimal("0.1"), Decimal("0.2")]
    assert whatif.CurveRequest.model_validate({**base, "minBtc": 0.001, "maxBtc": 1, "points": 10}).points == 10
    with pytest.raises(ValidationError):
        whatif.CurveRequest.model_validate({**base, "amountsBtc": [1], "minBtc": 1, "maxBtc": 2, "points": 3})
    with pytest.raises(ValidationError):
        whatif.CurveRequest.model_validate({**base, "minBtc": 1})


def test_the_transactions_query_reads_from_as_from() -> None:
    query = addresses.TransactionsQuery.model_validate({"from": "2026-01-01", "to": "2026-02-01", "pageSize": 20, "status": ["flagged"]})
    assert (query.from_, query.page, query.page_size, query.sort) == ("2026-01-01", 1, 20, "time")
    with pytest.raises(ValidationError):
        addresses.TransactionsQuery.model_validate({"sort": "colour"})
