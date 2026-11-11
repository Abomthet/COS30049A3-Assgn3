"""E1 health and E2 configuration: what the service is and what it hands the front end."""
from __future__ import annotations

from explorer.explain import FEATURE_DESCRIPTIONS, FEATURE_NAMES

from .. import __version__
from ..core.config import Settings
from ..core.errors import Unavailable
from ..core.runtime import Runtime
from ..schemas.system import (AssistantStatus, Capabilities, ConfigResponse, FeatureInfo, HealthResponse, Thresholds,
                              WhatIfDefaults)

# The units people read (types.ts, FeatureDetail.value): the models work in other units, the interface shows these.
FEATURE_UNITS = {"F1": "BTC", "F2": "count", "F3": "hours", "F4": "ratio"}


def assistant_status(settings: Settings) -> AssistantStatus:
    """Whether the Explorer Assistant's weights are installed and allowed.

    Only presence is checked: the Assistant itself is loaded on first use (S-05), which will add `loading`.
    """
    if settings.assistant_mode == "off":
        return "off"
    return "ready" if settings.assistant_weights.is_file() else "not_installed"


def _require_ready(runtime: Runtime) -> None:
    """Raise `Unavailable` while the models are loading, or after a failed load."""
    if runtime.load_error:
        raise Unavailable("The explorer service could not load its models.",
                          "The server log says why; the README's troubleshooting section lists the usual causes.")
    if not runtime.ready:
        raise Unavailable("The explorer service is still starting.", "Try again in a few seconds.")


def build_health(runtime: Runtime) -> HealthResponse:
    """E1: ready, and what is loaded.

    Raises:
        Unavailable: The models are still loading (503).
    """
    _require_ready(runtime)
    facts = runtime.facts
    assert facts is not None  # `_require_ready` passed
    return HealthResponse(status="ok", version=__version__, snapshot_date=facts.date, address_count=facts.address_count,
                          method_count=facts.method_count, assistant=assistant_status(runtime.settings),
                          live_lookup=runtime.settings.live_lookup, uptime_seconds=round(runtime.uptime_seconds, 1))


def build_config(runtime: Runtime) -> ConfigResponse:
    """E2: every limit, threshold and name the front end would otherwise hard-code.

    Raises:
        Unavailable: The models are still loading (503); the thresholds come from the loaded methods.
    """
    _require_ready(runtime)
    predictor, settings, facts = runtime.predictor, runtime.settings, runtime.facts
    assert predictor is not None and facts is not None
    return ConfigResponse(
        snapshot=predictor.snapshot(),
        limitation_line=settings.limitation_line,
        features=[FeatureInfo(id=fid, name=name, description=FEATURE_DESCRIPTIONS[fid], unit=FEATURE_UNITS[fid])
                  for fid, name in FEATURE_NAMES.items()],
        history=predictor.requirement(),
        thresholds=Thresholds(flag_abs_z=predictor.flag_abs_z(), contributing_abs_z=settings.contributing_abs_z),
        default_method=predictor.selected,
        web=settings.web,
        what_if=WhatIfDefaults(default_time=f"{facts.date}T12:00:00Z"),
        capabilities=Capabilities(assistant=assistant_status(settings) == "ready", live_lookup=settings.live_lookup),
    )
