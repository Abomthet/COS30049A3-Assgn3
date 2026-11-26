"""E12: the Explorer Assistant's guarded explanation of one transaction, or the template."""
from __future__ import annotations

from typing import Literal, Self

from pydantic import ConfigDict, Field, model_validator

from .common import CamelModel, RequestModel
from .whatif import WhatIfRequest

ExplanationSource = Literal["text150m", "template"]


class ExplanationRequest(RequestModel):
    """E12's body: an address, and either one of its snapshot transactions or a what-if transaction as E8 takes it."""

    address: str
    txid: str | None = Field(default=None, description="A snapshot transaction of the address.")
    what_if: WhatIfRequest | None = Field(default=None, description="A hypothetical transaction, as E8's body.")

    @model_validator(mode="after")
    def one_transaction(self) -> Self:
        """`txid` and `whatIf` are alternatives, and one of them is needed."""
        if (self.txid is None) == (self.what_if is None):
            raise ValueError("Give either txid or whatIf, and not both.")
        return self


class WriterAttempt(CamelModel):
    """One writer's try: which writer, and the guardrail checks its answer failed (none when it passed).

    The rejected text is never part of a response.
    """

    source: ExplanationSource
    failed_checks: list[str]


class ExplanationResponse(CamelModel):
    """E12: the explanation to show, and how it came about."""

    txid: str = Field(description='The transaction ID, or "what-if" for a hypothetical transaction.')
    flagged: bool
    explanation: str = Field(description="The Assistant's answer when it passed every guardrail check; otherwise the template.")
    source: ExplanationSource
    cached: bool = Field(description="True when the answer came from memory or from the prepared answers, not from a fresh writing.")
    attempts: list[WriterAttempt] = Field(description="Each writer tried and the guardrail checks it failed; empty when none wrote.")
    skipped_writers: dict[str, str] = Field(description="A writer this computer cannot run, and why. The template is shown instead.")
    limitation: str
    seconds: float

    model_config = ConfigDict(json_schema_extra={"example": {
        "txid": "61aced15690314e5ca7056fb742fb004f233a6c006e5fe0622d092b492396a8c", "flagged": True,
        "explanation": "- Larger amount than usual: 0.05000000 BTC (usual 0.00063694 BTC)\n"
                       "Flagged as unusual for this address, not proof of wrongdoing.",
        "source": "text150m", "cached": False, "attempts": [{"source": "text150m", "failedChecks": []}],
        "skippedWriters": {}, "limitation": "Flagged as unusual for this address, not proof of wrongdoing.",
        "seconds": 2.6}})
