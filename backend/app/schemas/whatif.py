"""The what-if: one hypothetical transaction (E8) and a curve over amounts (E9).

Requests are parsed here; the ranges come from settings.json -> web.whatIf and are checked by the
what-if service (the amount's limits, `maxGapYears`, the curve's point counts), so no number is typed
here. Amounts are `Decimal`, never `float`: 0.1 BTC must become exactly 10,000,000 satoshis.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal, Self

from pydantic import AwareDatetime, Field, field_validator, model_validator

from .common import CamelModel, MethodId, RequestModel
from .transactions import TransactionFacts, Verdict

WhatIfDirection = Literal["in", "out"]
# Greater than zero is part of what an amount is; the smallest and largest amount come from settings.
Amount = Annotated[Decimal, Field(gt=0)]


def read_amount(value: Any) -> Any:
    """Accept a number or a decimal string; one comma is the decimal point, grouping separators are refused.

    Strings go through `Decimal` so no binary rounding is involved. Anything else is left for Pydantic to judge.
    """
    if not isinstance(value, str):
        return value
    text = value.strip()
    if text.count(",") == 1 and "." not in text:
        text = text.replace(",", ".")
    elif "," in text:
        raise ValueError("Write the amount without thousands separators, such as 1250.5.")
    try:
        return Decimal(text)
    except InvalidOperation:
        raise ValueError("Enter an amount in BTC, such as 0.05.") from None


def read_amounts(values: Any) -> Any:
    """`read_amount` for each item of a list."""
    return [read_amount(v) for v in values] if isinstance(values, list) else values


class WhatIfRequest(RequestModel):
    """E8's body."""

    amount_btc: Amount = Field(description="A number or decimal string, in BTC.")
    direction: WhatIfDirection
    time: AwareDatetime = Field(description="ISO 8601 with a zone, such as 2026-10-20T12:00:00Z.")

    _read_amount = field_validator("amount_btc", mode="before")(read_amount)


class WhatIfResult(TransactionFacts, Verdict):
    """E8: a transaction detail without an ID or block, from the methods that can score new input."""

    txid: Literal["what-if"]
    not_available: list[MethodId] = Field(description="Methods that cannot score a hypothetical transaction.")
    note: str


class CurveRequest(RequestModel):
    """E9's body: either a list of amounts, or a range with a point count, or neither (the server chooses)."""

    direction: WhatIfDirection
    time: AwareDatetime
    amounts_btc: list[Amount] | None = None
    min_btc: Amount | None = None
    max_btc: Amount | None = None
    points: int | None = Field(default=None, ge=2)

    _read_amounts = field_validator("amounts_btc", mode="before")(read_amounts)
    _read_min_max = field_validator("min_btc", "max_btc", mode="before")(read_amount)

    @model_validator(mode="after")
    def one_way_of_choosing_amounts(self) -> Self:
        """`amountsBtc` and the range are alternatives, and the range needs all three of its values."""
        range_given = [v is not None for v in (self.min_btc, self.max_btc, self.points)]
        if self.amounts_btc is not None and any(range_given):
            raise ValueError("Give either amountsBtc or minBtc, maxBtc and points, not both.")
        if any(range_given) and not all(range_given):
            raise ValueError("A range needs minBtc, maxBtc and points together.")
        return self


class CurveMethod(CamelModel):
    """One method's scores and flags, one per amount."""

    id: MethodId
    name: str
    threshold: float
    scores: list[float | None]
    flags: list[bool]


class CurveResponse(CamelModel):
    """E9: scores over a range of amounts."""

    address: str
    direction: WhatIfDirection
    time: str
    usual_btc: float | None = Field(description="The address's usual amount in that direction.")
    deciding_method: MethodId
    amounts_btc: list[float]
    methods: list[CurveMethod]
    not_available: list[MethodId]
