"""Ranks for chart G4 (S-02): where one transaction's score sits among the address's own scored transactions.

For each method the rank is the share of the address's scored transactions whose score is at or below this
transaction's, a number from 0 to 1, or None where the method gave no score. It is computed from scores the services
already hold; nothing is rescored here.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np


def rank_among(values: Sequence[float | None], score: float | None) -> float | None:
    """The share of `values` (None and NaN do not count) that are at or below `score`; None without a score or without values."""
    if score is None or np.isnan(score):
        return None
    pool = np.asarray([v for v in values if v is not None and not np.isnan(v)], dtype=float)
    if pool.size == 0:
        return None
    return float(np.count_nonzero(pool <= score) / pool.size)


def ranks_of(scores: Mapping[str, float | None], pools: Mapping[str, np.ndarray]) -> dict[str, float | None]:
    """One transaction's rank per method, against each method's sorted pool of the address's scores.

    Args:
        scores: The transaction's score per method (None where a method has none).
        pools: Per method, the address's scores sorted ascending, without gaps.
    """
    out: dict[str, float | None] = {}
    for method, score in scores.items():
        pool = pools.get(method)
        if score is None or pool is None or pool.size == 0:
            out[method] = None
        else:
            out[method] = float(np.searchsorted(pool, score, side="right") / pool.size)
    return out


def pools_of(transactions: Sequence[Mapping[str, float | None]], methods: Sequence[str]) -> dict[str, np.ndarray]:
    """Per method, the sorted scores of the given transactions' score dictionaries, gaps dropped."""
    pools = {}
    for method in methods:
        values = np.asarray([s[method] for s in transactions if s.get(method) is not None], dtype=float)
        pools[method] = np.sort(values[~np.isnan(values)])
    return pools
