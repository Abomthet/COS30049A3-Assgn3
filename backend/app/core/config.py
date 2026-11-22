"""Configuration (T06, plan section 5.7): environment variables choose what this machine may do;
config/settings.json -> web holds the numbers the web tier needs.

Nothing here is a typed-in limit: the `web` block is read and validated once at start, E2 hands it to
the front end, and the services read their limits from it. An invalid value stops the start with one
sentence (`ConfigError`).
"""
from __future__ import annotations

import json
import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, cast

from explorer.explain import check_wording
from explorer.settings import SETTINGS
from pydantic import ConfigDict, ValidationError

from ..schemas.common import CamelModel

BACKEND_ROOT = Path(__file__).resolve().parents[2]
SETTINGS_PATH = BACKEND_ROOT / "config" / "settings.json"
# The Assistant's prepared answers for the snapshot's flagged transactions (tools/precompute_assistant.py); they ship in the zip.
ASSISTANT_ANSWERS_PATH = BACKEND_ROOT / "data" / "assistant_answers.json"
# The limitation line of the web application (Mod-19): one file that both tiers read, next to the shared test vectors.
WORDING_PATH = BACKEND_ROOT.parent / "shared" / "wording.json"
# Assignment 2's line, from settings.json. A2's code writes it into every flagged explanation and `limitation` field, and
# its Assistant guardrail (`explorer.assistant.has_limitation`) looks for exactly this text, so the web tier keeps it
# to find it: `services/reasons.py::reword_limitation` replaces it with the web line before any text leaves the service.
A2_LIMITATION_LINE: str = SETTINGS["limitationLine"]

DEFAULT_CORS_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173")
LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")


class ConfigError(RuntimeError):
    """The configuration cannot be used; the message says which value and what to do."""


@lru_cache(maxsize=None)
def limitation_line(path: Path = WORDING_PATH) -> str:
    """The limitation line the web application shows, from shared/wording.json (Mod-19).

    Raises:
        ConfigError: The file cannot be read, has no sentence under "limitationLine", or the sentence breaks the wording rule.
    """
    try:
        line = json.loads(path.read_text(encoding="utf-8"))["limitationLine"]
    except (OSError, json.JSONDecodeError, KeyError, TypeError) as error:
        raise ConfigError(f"shared/{path.name} cannot be read ({error.__class__.__name__}); restore it from the repository "
                          "(the service runs from a full clone, with `shared/` next to `backend/`).") from error
    if not isinstance(line, str) or not line.strip():
        raise ConfigError(f'"limitationLine" in shared/{path.name} must be a sentence.')
    check_wording(line)  # the wording rule (A1 NFR-01) holds for this text as it does for A2's
    return line


class ConfigBlock(CamelModel):
    """A block of settings.json -> web: a key that is missing or unknown is an error, so a typo cannot go unnoticed."""

    model_config = ConfigDict(extra="forbid")


class WhatIfLimits(ConfigBlock):
    """Ranges of the what-if form (E8, E9)."""

    min_amount_btc: float
    max_amount_btc: float
    max_gap_years: int
    curve_points: int
    curve_max_points: int
    debounce_ms: int


class ListLimits(ConfigBlock):
    """Paging of every list."""

    page_size: int
    max_page_size: int


class RequestSettings(ConfigBlock):
    """Time limits and polling the front end applies."""

    timeout_ms: int
    assistant_timeout_ms: int
    health_poll_seconds: int


class ChartSettings(ConfigBlock):
    """When a chart switches to WebGL."""

    webgl_min_points: int


class WatchlistLimits(ConfigBlock):
    """Size limits of the watchlist (S-04)."""

    max_entries: int
    max_label_chars: int
    max_note_chars: int


class LiveSettings(ConfigBlock):
    """Limits of a live lookup (S-09)."""

    default_max_tx: int
    min_max_tx: int
    max_tx_limit: int
    lookups_per_hour: int
    cache_days: int


class ReplaySettings(ConfigBlock):
    """Replay speeds (S-06)."""

    speeds: list[int]


class RequestLimits(ConfigBlock):
    """Limits on what a request may carry."""

    max_body_bytes: int
    max_address_chars: int


class WebSettings(ConfigBlock):
    """The `web` block of settings.json (plan section 5.7)."""

    what_if: WhatIfLimits
    lists: ListLimits
    requests: RequestSettings
    charts: ChartSettings
    watchlist: WatchlistLimits
    live: LiveSettings
    replay: ReplaySettings
    limits: RequestLimits


@dataclass(frozen=True)
class Settings:
    """Everything the web tier reads at start. Built by `load_settings`; never changes while running."""

    web: WebSettings
    limitation_line: str
    contributing_abs_z: float
    assistant_weights: Path
    assistant_answers: Path
    cors_origins: tuple[str, ...]
    live_lookup: bool
    assistant_mode: Literal["auto", "off"]
    log_level: str


def _choice(environ: Mapping[str, str], name: str, default: str, allowed: tuple[str, ...], fold: Callable[[str], str] = str.lower) -> str:
    """One of `allowed` from the environment (case-insensitively), or `default` when the variable is not set."""
    value = fold(environ.get(name, default).strip())
    if value not in allowed:
        raise ConfigError(f"{name} must be one of {', '.join(allowed)}; it is set to {environ.get(name)!r}.")
    return value


def load_settings(environ: Mapping[str, str] | None = None, path: Path = SETTINGS_PATH) -> Settings:
    """Read settings.json and the EXPLORER_* variables.

    Args:
        environ: The environment to read; the process environment by default (tests pass their own).
        path: The settings file.

    Raises:
        ConfigError: A variable has an unusable value, or the file's `web` block is missing or malformed.
    """
    environ = os.environ if environ is None else environ
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigError(f"{path.name} cannot be read ({error.__class__.__name__}); restore it from the repository.") from error
    try:
        web = WebSettings.model_validate(raw["web"])
    except KeyError:
        raise ConfigError(f'{path.name} has no "web" block; restore it from the repository.') from None
    except ValidationError as error:
        names = ", ".join(".".join(str(part) for part in problem["loc"]) for problem in error.errors())
        raise ConfigError(f'The "web" block of {path.name} is not valid; check: {names}.') from None

    origins = environ.get("EXPLORER_CORS_ORIGINS")
    return Settings(
        web=web,
        limitation_line=limitation_line(),
        contributing_abs_z=raw["baseline"]["contributingAbsZ"],
        assistant_weights=BACKEND_ROOT / raw["assistant"]["text150mCheckpoint"],
        assistant_answers=ASSISTANT_ANSWERS_PATH,
        cors_origins=tuple(o.strip() for o in origins.split(",") if o.strip()) if origins else DEFAULT_CORS_ORIGINS,
        live_lookup=_choice(environ, "EXPLORER_LIVE_LOOKUP", "off", ("on", "off")) == "on",
        assistant_mode=cast(Literal["auto", "off"], _choice(environ, "EXPLORER_ASSISTANT", "auto", ("auto", "off"))),
        log_level=_choice(environ, "EXPLORER_LOG_LEVEL", "INFO", LOG_LEVELS, fold=str.upper),
    )
