"""T06: settings.json -> web and the EXPLORER_* variables."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.config import DEFAULT_CORS_ORIGINS, ConfigError, load_settings

SETTINGS_FILE = Path(__file__).resolve().parents[1] / "config" / "settings.json"


def test_defaults_come_from_the_plan() -> None:
    settings = load_settings({})
    assert settings.cors_origins == DEFAULT_CORS_ORIGINS == ("http://localhost:5173", "http://127.0.0.1:5173")
    assert (settings.live_lookup, settings.assistant_mode, settings.log_level) == (False, "off", "INFO")  # Assistant "off" until S-05 (E12)


def test_the_web_block_is_the_plans() -> None:
    web = load_settings({}).web
    assert (web.what_if.max_gap_years, web.what_if.curve_points, web.what_if.curve_max_points) == (5, 41, 61)
    assert (web.lists.page_size, web.lists.max_page_size) == (50, 200)
    assert (web.limits.max_body_bytes, web.limits.max_address_chars) == (10240, 100)
    assert web.replay.speeds == [1, 5, 20]


def test_environment_variables_are_read() -> None:
    settings = load_settings({"EXPLORER_CORS_ORIGINS": "http://a.test, http://b.test", "EXPLORER_LIVE_LOOKUP": "ON",
                              "EXPLORER_ASSISTANT": "off", "EXPLORER_LOG_LEVEL": "debug"})
    assert settings.cors_origins == ("http://a.test", "http://b.test")
    assert (settings.live_lookup, settings.assistant_mode, settings.log_level) == (True, "off", "DEBUG")


@pytest.mark.parametrize("name", ["EXPLORER_LIVE_LOOKUP", "EXPLORER_ASSISTANT", "EXPLORER_LOG_LEVEL"])
def test_a_bad_variable_stops_the_start_with_one_sentence(name: str) -> None:
    with pytest.raises(ConfigError, match=name):
        load_settings({name: "sideways"})


def test_a_missing_web_block_is_reported(tmp_path: Path) -> None:
    raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    del raw["web"]
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ConfigError, match='no "web" block'):
        load_settings({}, path)


def test_an_unknown_or_missing_key_in_the_web_block_is_reported(tmp_path: Path) -> None:
    raw = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    raw["web"]["lists"]["pageSise"] = 50
    del raw["web"]["lists"]["pageSize"]
    path = tmp_path / "settings.json"
    path.write_text(json.dumps(raw), encoding="utf-8")
    with pytest.raises(ConfigError, match=r"lists\.pageSise.*lists\.pageSize|lists\.pageSize.*lists\.pageSise"):
        load_settings({}, path)
