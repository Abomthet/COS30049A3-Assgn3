"""Loading Assignment 2's Predictor and describing the snapshot it holds (Mod-1, E1).

The Predictor is loaded once at start and shared read-only; a request never pays the load.
"""
from __future__ import annotations

from explorer.predict import Predictor

from ..core.runtime import SnapshotFacts

EXAMPLE_COUNT = 3


def load_predictor() -> Predictor:
    """Read the snapshot tables and the saved methods (about a second).

    Raises:
        FileNotFoundError: A model or table is missing from backend/.
    """
    return Predictor.load()


def snapshot_facts(predictor: Predictor) -> SnapshotFacts:
    """What health and the error bodies say about the snapshot.

    The examples are the busiest addresses: they have the most to look at, and they are what the
    plan's 'unsupported' body offers.
    """
    busiest = predictor.features.groupby("address").size().sort_values(ascending=False, kind="stable").head(EXAMPLE_COUNT)
    return SnapshotFacts(date=predictor.snapshot_date, address_count=int(predictor.features["address"].nunique()),
                         method_count=len(predictor.methods), examples=tuple(busiest.index))
