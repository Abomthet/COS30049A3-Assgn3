"""The service's own endpoints: health (E1) and configuration (E2).

`/api/config` is how the front end learns every limit, threshold and name it would otherwise
hard-code, so the two tiers cannot disagree. Its `web` entry is the settings.json block as loaded.
"""
from __future__ import annotations

from typing import Literal

from pydantic import ConfigDict, Field

from ..core.config import WebSettings
from .common import CamelModel, HistoryRequirement, MethodId, SnapshotInfo
from .transactions import FeatureId

AssistantStatus = Literal["ready", "not_installed", "loading", "off"]


class HealthResponse(CamelModel):
    """E1: the service is up and what it has loaded. While the models load the answer is a 503 error body."""

    status: Literal["ok"]
    version: str
    snapshot_date: str
    address_count: int
    method_count: int
    assistant: AssistantStatus
    live_lookup: bool
    uptime_seconds: float

    model_config = ConfigDict(json_schema_extra={"example": {
        "status": "ok", "version": "0.1.0", "snapshotDate": "2026-10-22", "addressCount": 28, "methodCount": 9,
        "assistant": "not_installed", "liveLookup": False, "uptimeSeconds": 12.4}})


class FeatureInfo(CamelModel):
    """One of the four features, as the interface names it."""

    id: FeatureId
    name: str
    description: str
    unit: str


class Thresholds(CamelModel):
    """The two z lines: a feature at or above `flagAbsZ` flags; at or above `contributingAbsZ` contributes."""

    flag_abs_z: float
    contributing_abs_z: float


class WhatIfDefaults(CamelModel):
    """Defaults for the what-if form."""

    default_time: str = Field(description="Noon UTC on the snapshot date.")


class Capabilities(CamelModel):
    """Optional parts of the service and whether this server has them on."""

    assistant: bool
    live_lookup: bool


CONFIG_EXAMPLE = {
    "snapshot": {"snapshotDate": "2026-10-22", "source": "Blockstream Esplora", "sourceUrl": "https://blockstream.info/api",
                 "illustrative": False, "dayTimeZone": "UTC", "addressCount": 28,
                 "method": {"id": "baseline", "name": "Baseline", "flagAbsZ": 5.0, "contributingAbsZ": 2.0,
                            "note": "Flags mean unusual for this address's own history, nothing more."}},
    "limitationLine": "Flagged as unusual for this address, not proof of wrongdoing.",
    "features": [{"id": "F1", "name": "Size", "unit": "BTC",
                  "description": "How much the address received or sent in this transaction (BTC)."}],
    "history": {"minTx": 10, "minSpanDays": 14},
    "thresholds": {"flagAbsZ": 5.0, "contributingAbsZ": 2.0},
    "defaultMethod": "baseline",
    "web": {"whatIf": {"minAmountBtc": 1e-08, "maxAmountBtc": 21000000, "maxGapYears": 5, "curvePoints": 41,
                       "curveMaxPoints": 61, "debounceMs": 250},
            "lists": {"pageSize": 50, "maxPageSize": 200}, "...": "the other blocks of settings.json -> web"},
    "whatIf": {"defaultTime": "2026-10-22T12:00:00Z"},
    "capabilities": {"assistant": False, "liveLookup": False},
}


class ConfigResponse(CamelModel):
    """E2: everything the front end would otherwise hard-code."""

    snapshot: SnapshotInfo
    limitation_line: str
    features: list[FeatureInfo]
    history: HistoryRequirement
    thresholds: Thresholds
    default_method: MethodId
    web: WebSettings
    what_if: WhatIfDefaults
    capabilities: Capabilities

    model_config = ConfigDict(json_schema_extra={"example": CONFIG_EXAMPLE})
