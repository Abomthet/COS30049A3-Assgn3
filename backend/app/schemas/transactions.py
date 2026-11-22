"""One transaction (E7), and the pieces E6, E8 and the error bodies reuse.

A1's `TransactionCore` and `TransactionDetail` plus the fields plan section 6.4 adds (`explanation`,
`scores`, `flags`, `source`). `Verdict` is what the models say about a transaction, shared with the
what-if result, which has no transaction ID or block.
"""
from __future__ import annotations

from typing import Literal

from pydantic import Field

from .common import CamelModel, DataSource, Direction, MethodId, MethodInfo

FeatureRole = Literal["flag", "contributing", "within-usual", "no-comparison"]
FeatureId = Literal["F1", "F2", "F3", "F4"]


class TransactionFacts(CamelModel):
    """The facts of a transaction at one address, scored or not (A1 FR-03), without its identity."""

    address: str
    time: str = Field(description="ISO 8601, UTC.")
    direction: Direction
    received_sats: int
    sent_sats: int
    net_sats: int
    source_url: str | None = Field(description="Public block-explorer page; null for a hypothetical transaction.")


class TransactionCore(TransactionFacts):
    """A1's `TransactionCore`."""

    txid: str
    block_height: int


class FeatureDetail(CamelModel):
    """One of F1 to F4 in the units people read (A1)."""

    id: FeatureId
    name: str
    description: str
    value: float | None = Field(description="BTC for F1, a count for F2, hours for F3, a ratio for F4.")
    usual: float | None = Field(description="Median of the comparison window, in the same units.")
    z: float | None
    role: FeatureRole


class ComparisonBasis(CamelModel):
    """What a group of features was compared with: how many earlier transactions, from when to when (A1)."""

    features: list[FeatureId]
    label: str
    description: str
    tx_count: int
    start: str
    end: str


ReasonLevel = Literal["flag", "contributing", "largest"]


class Reason(CamelModel):
    """One reason a transaction stands out, as the screen writes it (Mod-20): Assignment 2's choice and order, the web's words."""

    feature: FeatureId
    label: str = Field(description="What stands out, such as 'Larger amount than usual' or 'Small for a received amount'.")
    level: ReasonLevel = Field(description="'flag' or 'contributing' for a feature at or above a z line; 'largest' when none "
                                           "reaches one and these are the two biggest differences.")
    value_text: str = Field(description="This transaction's figure with its unit, such as '0.05000000 BTC' or '0.4×'.")
    usual_text: str = Field(description="The address's usual figure, written the same way.")


class Verdict(CamelModel):
    """What the methods say about one scored transaction."""

    scored: Literal[True]
    flagged: bool
    score: float
    method: MethodInfo
    features: list[FeatureDetail]
    comparison: list[ComparisonBasis]
    limitation: str
    reasons: list[Reason] = Field(description="The reasons, strongest first (Assignment 2's `reasons_for`); the flag box is built from this.")
    explanation: str = Field(description="One line per reason, then the limitation line on a flagged item; the text API clients and exports use.")
    scores: dict[MethodId, float | None] = Field(description="Every method's score.")
    flags: dict[MethodId, bool] = Field(description="Every method's flag.")
    ranks: dict[MethodId, float | None] = Field(
        description="Per method, the share (0 to 1) of the address's own scored transactions whose score is at or below this "
                    "one's; null where the method has no score.")


class TransactionDetail(TransactionCore, Verdict):
    """E7: one transaction's facts, features, reason and every method's verdict."""

    source: DataSource
