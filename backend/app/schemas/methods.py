"""The nine methods and how well each did (E11).

Every number in `evaluation` is read from the copies of Assignment 2's eval_significance.csv and
eval_selection.csv; none is typed. `meanRecall` and the per-pattern values are recall on planted
transactions, with their 95% intervals; `burst` is the per-transaction burst recall, the measure that
Assignment 2's mean recall uses.
"""
from __future__ import annotations

from typing import Literal

from .common import CamelModel, MethodId, ShortNamed

MethodFamily = Literal["statistics", "outlier detection", "clustering", "regression", "combination", "language model"]


class Interval(CamelModel):
    """A value with its 95% interval."""

    value: float
    ci_low: float
    ci_high: float


class RecallByPattern(CamelModel):
    """Recall on each planted pattern."""

    spike: Interval
    burst: Interval
    dormant: Interval


class Evaluation(CamelModel):
    """How a method did on Assignment 2's tests."""

    mean_recall: Interval
    recall_by_pattern: RecallByPattern
    flag_rate: float


class MethodEntry(ShortNamed):
    """One method: `name` is the short name the screens use, `longName` the one the Models page adds (Mod-21)."""

    id: MethodId
    long_name: str
    family: MethodFamily
    description: str
    threshold: float
    scores_new_input: bool
    evaluation: Evaluation


class MethodsResponse(CamelModel):
    """E11: the methods, their thresholds and test results."""

    default_method: MethodId
    methods: list[MethodEntry]
