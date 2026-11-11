"""T03: Assignment 2's Predictor loads from backend/ and scores the running example (plan section 2.1)."""
from __future__ import annotations

import time

from tests.conftest import RUNNING_EXAMPLE
from explorer.predict import Predictor

LOAD_BUDGET_SECONDS = 10  # plan section 5.9: ready within 10 seconds of starting


def test_load_and_score_the_running_example(record_property) -> None:  # type: ignore[no-untyped-def]
    started = time.perf_counter()
    predictor = Predictor.load()
    load_seconds = time.perf_counter() - started
    record_property("load_seconds", round(load_seconds, 2))

    result = predictor.score_address(RUNNING_EXAMPLE)
    totals = result["totals"]
    assert (totals["txCount"], totals["scoredCount"], totals["flaggedCount"]) == (377, 367, 3)
    assert len(predictor.methods) == 9
    assert load_seconds < LOAD_BUDGET_SECONDS


def test_the_what_if_example_is_flagged(predictor: Predictor) -> None:
    result = predictor.score_what_if(RUNNING_EXAMPLE, 0.05, "out", "2026-10-20T12:00:00Z")
    assert result["flagged"] and round(result["score"], 2) == 5.98
