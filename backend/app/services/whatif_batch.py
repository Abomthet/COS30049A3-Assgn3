"""Mod-5: many hypothetical transactions through one feature build (E9; plan section 7.2, "The what-if, single and batched").

`Predictor.score_what_if` scores one hypothetical transaction against the address's real, strictly earlier history and
spends most of its 0.3 s building the address's features. A curve needs the same transaction at dozens of amounts, so
`hypothetical_frame` puts all of them in one table at one time and builds the features once.

Why that gives each amount exactly the features a single call would give it: Assignment 2's `build_features` takes, for
every transaction, only the transactions confirmed *strictly* earlier at the same address (same-time transactions are
never each other's history). The hypothetical rows share one time and are all later than every real row of `earlier`, so
none sees another and each sees exactly the real history that `score_what_if` would give it. (`earlier` is cut with `<`
as `score_what_if` cuts it, but `build_features` is strict about ties itself, so the cut only decides the shape medians and
the block height.) The models then score the rows independently, so a row's score does not depend on the others. `tests/test_whatif_parity.py` holds this to equality
for every method, and a deliberate off-by-one in the history cut is shown to fail it.

Nothing here re-implements a feature or a score: the hypothetical row is built the way `score_what_if` builds it, and
`build_features`, `Method.score` and `flags` are Assignment 2's own.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

import pandas as pd
from explorer.explain import SATS_PER_BTC
from explorer.features import FeatureConfig, build_features
from explorer.fusion import Cached
from explorer.methods import flags
from explorer.predict import PRECOMPUTED_ONLY, Predictor

# The columns `score_what_if` fills with the median of the earlier history (the transaction's shape).
SHAPE_COLUMNS = ["n_inputs", "n_outputs", "fee_sats", "vsize_vb"]
ID_PREFIX = "what-if-"


@dataclass(frozen=True)
class BatchScores:
    """Every usable method's scores and flags for each amount, in the order the amounts were given."""

    scores: dict[str, list[float | None]]
    flags: dict[str, list[bool]]


def to_sats(amount_btc: float) -> int:
    """Whole satoshis, rounded exactly as `Predictor.score_what_if` rounds an amount."""
    return int(round(amount_btc * SATS_PER_BTC))


def usable_methods(predictor: Predictor) -> list[str]:
    """The methods that can score a new transaction, in the Predictor's order (TxGPT's scores are precomputed)."""
    return [name for name in predictor.methods if name not in PRECOMPUTED_ONLY]


def hypothetical_frame(real: pd.DataFrame, amounts_btc: Sequence[float], direction: str, time_utc: int) -> pd.DataFrame:
    """The features of one hypothetical transaction per amount, from one feature build.

    Args:
        real: The address's real transactions (Assignment 2's transaction table, one address).
        amounts_btc: The amounts, in BTC; each becomes one row, identified as `what-if-000`, `what-if-001`, ...
        direction: "in" or "out".
        time_utc: Unix seconds, shared by every row.

    Returns:
        A feature table with one row per amount in the order given, ready for `Method.score`.

    Raises:
        ValueError: No real transaction is strictly earlier than `time_utc`.
    """
    earlier = real[real["block_time_utc"] < time_utc]
    if earlier.empty:
        raise ValueError("no earlier history at that time")
    shape = earlier[SHAPE_COLUMNS].median().round().astype(int).to_dict()
    rows = []
    for i, amount in enumerate(amounts_btc):
        sats = to_sats(amount)
        received, sent = (sats, 0) if direction == "in" else (0, sats)
        rows.append({"address": real["address"].iloc[0], "role": real["role"].iloc[0], "txid": f"{ID_PREFIX}{i:03d}",
                     "block_height": int(earlier["block_height"].max()), "block_time_utc": time_utc,
                     "received_sats": received, "sent_sats": sent, "net_sats": received - sent, "direction": direction, **shape})
    frame = build_features(pd.concat([earlier, pd.DataFrame(rows)], ignore_index=True), FeatureConfig.refined())
    new = frame[frame["txid"].str.startswith(ID_PREFIX)].sort_values("txid")  # zero-padded, so this is the order given
    return new.assign(period="eval").reset_index(drop=True)


def score_frame(predictor: Predictor, new: pd.DataFrame) -> BatchScores:
    """Score a table of hypothetical rows with every method that can score new input."""
    scores: dict[str, list[float | None]] = {}
    flagged: dict[str, list[bool]] = {}
    for name in usable_methods(predictor):
        method = predictor.methods[name]
        values = method.score(new)
        scores[name] = [None if pd.isna(v) else float(v) for v in values]
        # `flags` scores the frame itself; `Cached` hands it the scores just computed, so no model runs twice.
        flagged[name] = [bool(v) for v in flags(Cached(method.threshold, pd.Series(values, index=new.index)), new)]
    return BatchScores(scores, flagged)
