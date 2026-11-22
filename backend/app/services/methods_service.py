"""E11: the nine methods, their thresholds and how each did on Assignment 2's tests.

Every number comes from a file: the thresholds from the loaded methods, the recalls and their 95% intervals from
`eval_significance.csv`, the flag rate on real transactions from `eval_selection.csv`. Only the family and the one-sentence
description of each method are written here, from plan section 7.1; they say what a score measures, not how well it did.
"""
from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

from explorer.baseline import TABLES_DIR
from explorer.predict import PRECOMPUTED_ONLY, Predictor

from ..core.method_names import long_name, short_name
from ..schemas.methods import MethodsResponse

# (family, what the score measures) for each method id, in plain words (the wording list, Note 4).
METHOD_TEXT = {
    "baseline": ("statistics", "How far it strays from this address's usual size, pace and gap. Nothing is trained."),
    "isolation_forest": ("outlier detection", "How easy it is to set apart from the others."),
    "lof": ("outlier detection", "How isolated it is compared with its closest neighbours."),
    "kmeans": ("clustering", "How far it sits from the nearest group of similar transactions."),
    "dbscan": ("clustering", "How far it sits from the nearest dense group."),
    "regression": ("regression", "How far off a prediction of its size and gap was."),
    "regression_interval": ("regression", "How far it falls outside the range predicted for it."),
    "fusion": ("combination", "Regression and Isolation Forest combined."),
    "txgpt_method": ("language model", "How surprising it is to a language model trained on Bitcoin transactions."),
}


def _read(path: Path) -> dict[str, dict[str, str]]:
    """A CSV of Assignment 2's tables by its `method` column."""
    with path.open(encoding="utf-8", newline="") as file:
        return {row["method"]: row for row in csv.DictReader(file)}


def _interval(row: dict[str, str], column: str) -> dict[str, float]:
    """A value of the significance table with its 95% interval."""
    return {"value": float(row[column]), "ciLow": float(row[f"{column}_ci_low"]), "ciHigh": float(row[f"{column}_ci_high"])}


class MethodsService:
    """Builds E11 once, at start: the tables and the thresholds do not change while the service runs."""

    def __init__(self, predictor: Predictor, tables_dir: Path = TABLES_DIR) -> None:
        """
        Args:
            predictor: The loaded Predictor, which holds the methods and their thresholds.
            tables_dir: Where Assignment 2's evaluation tables are.

        Raises:
            FileNotFoundError: An evaluation table is missing.
            KeyError: A method has no row in a table, or a table lacks a column.
        """
        significance = _read(tables_dir / "eval_significance.csv")
        selection = _read(tables_dir / "eval_selection.csv")
        self._response = MethodsResponse.model_validate({
            "defaultMethod": predictor.selected,
            "methods": [self._entry(predictor, name, significance[name], selection[name]) for name in predictor.methods]})

    @staticmethod
    def _entry(predictor: Predictor, name: str, significance: dict[str, str], selection: dict[str, str]) -> dict[str, Any]:
        """One method: its identity, its threshold and its test results."""
        family, description = METHOD_TEXT[name]
        return {
            "id": name, "name": short_name(name), "longName": long_name(name), "family": family, "description": description,
            "threshold": float(predictor.methods[name].threshold), "scoresNewInput": name not in PRECOMPUTED_ONLY,
            "evaluation": {
                "meanRecall": _interval(significance, "mean_recall"),
                "recallByPattern": {"spike": _interval(significance, "recall_spike"),
                                    "burst": _interval(significance, "recall_burst_tx"),
                                    "dormant": _interval(significance, "recall_dormant")},
                "flagRate": float(selection["flag_rate"])}}

    def methods(self) -> MethodsResponse:
        """E11's body."""
        return self._response
