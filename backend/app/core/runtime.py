"""What the running service holds: its settings, the loaded Predictor and when it started (Mod-1, E1).

One `Runtime` lives on `app.state`. The Predictor is loaded once, in the background, so the service
can answer E1 with a 503 while it loads; the models are then shared read-only by every request.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .config import Settings

if TYPE_CHECKING:  # explorer is imported only where it is used: it takes seconds to import
    from explorer.predict import Predictor

    from ..services.assistant_service import AssistantService
    from ..services.explorer_service import ExplorerService
    from ..services.export_service import ExportService
    from ..services.methods_service import MethodsService
    from ..services.watchlist_service import WatchlistService
    from ..services.whatif_service import WhatIfService


@dataclass(frozen=True)
class SnapshotFacts:
    """What error bodies and health need to say about the snapshot, computed once after the load."""

    date: str
    address_count: int
    method_count: int
    examples: tuple[str, ...]


@dataclass
class Runtime:
    """Shared state of one running service."""

    settings: Settings
    started_at: float = field(default_factory=time.monotonic)
    predictor: Predictor | None = None
    facts: SnapshotFacts | None = None
    explorer: ExplorerService | None = None
    assistant: AssistantService | None = None
    whatif: WhatIfService | None = None
    exports: ExportService | None = None
    methods: MethodsService | None = None
    watchlist: WatchlistService | None = None
    load_error: str | None = None

    @property
    def ready(self) -> bool:
        """True once the Predictor is loaded and the explorer service is built on it."""
        return self.predictor is not None and self.facts is not None and self.explorer is not None

    @property
    def uptime_seconds(self) -> float:
        """Seconds since the service started."""
        return time.monotonic() - self.started_at
