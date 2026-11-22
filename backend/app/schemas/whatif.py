"""The what-if: one hypothetical transaction (E8) and a curve over amounts (E9).

Requests are parsed here; the ranges come from settings.json -> web.whatIf and are checked by the
what-if service (the amount's limits, `maxGapYears`, the curve's point counts), so no number is typed
here. Amounts are `Decimal`, never `float`: 0.1 BTC must become exactly 10,000,000 satoshis.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Annotated, Any, Literal, Self

from pydantic import AwareDatetime, BeforeValidator, Field, model_validator

from .common import CamelModel, MethodId, RequestModel, ShortNamed
from .transactions import TransactionFacts, Verdict

WhatIfDirection = Literal["in", "out"]


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


# Greater than zero is part of what an amount is; the smallest and largest amount come from settings. The reader is part
# of the type, so a list of amounts reads each item, and the service can judge one raw value exactly as a body field is.
Amount = Annotated[Decimal, BeforeValidator(read_amount), Field(gt=0)]
# At least two points make a curve.
Points = Annotated[int, Field(ge=2)]


class WhatIfRequest(RequestModel):
    """E8's body."""

    amount_btc: Amount = Field(description="A number or decimal string, in BTC.")
    direction: WhatIfDirection
    time: AwareDatetime = Field(description="ISO 8601 with a zone, such as 2026-10-20T12:00:00Z.")


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
    points: Points | None = None

    @model_validator(mode="after")
    def one_way_of_choosing_amounts(self) -> Self:
        """`amountsBtc` and the range are alternatives, and the range needs all three of its values."""
        range_given = [v is not None for v in (self.min_btc, self.max_btc, self.points)]
        if self.amounts_btc is not None and any(range_given):
            raise ValueError("Give either amountsBtc or minBtc, maxBtc and points, not both.")
        if any(range_given) and not all(range_given):
            raise ValueError("A range needs minBtc, maxBtc and points together.")
        return self


class CurveMethod(ShortNamed):
    """One method's scores and flags, one per amount."""

    id: MethodId
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
