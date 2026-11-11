"""T14, plan sections 7.2 and 7.5 (Mod-5): a point of the E9 curve equals a single `Predictor.score_what_if` call.

The batch scores every amount of a curve in one feature build; this test is what lets the endpoint claim that it
answers what E8 would answer for each amount. The oracle is Assignment 2's own single call, run once per amount.

A default run checks a spread of the grid below; `PARITY_FULL=1 python -m pytest tests/test_whatif_parity.py` checks every
amount of every curve (about 1,500 single calls, several minutes). The grid:

* six addresses: the running example, the largest, the one with the fewest scored transactions that is still scorable,
  the one with the oldest history, a Taproot address and a mid-sized one;
* both directions;
* three times each: the first moment the address can be scored, the exact time of a real transaction in the middle of its
  history (a real transaction at the same second must NOT count as history), and a day after its last transaction;
* 41 amounts spaced on a log scale from 0.000001 to 10 BTC, the range form of E9; the running example is also checked
  on the default curve (a hundredth to a thousand times its usual amount), which needs an earlier transaction in the
  direction, and the first moment an address can be scored may have none.

Tolerance. Flags must be equal. Scores are compared exactly, and where they differ the difference must be below 1e-12.
The features of every row are bit-identical (`test_the_features_...`), and five methods return bit-identical scores. The
regression, k-means and fusion (which contains the regression) multiply matrices with BLAS, and BLAS rounds the last
digits differently for a batch of 41 rows than for one row (and even between two identical single calls, which the API tests
see): measured over the full grid of 1,517 amounts, at most 4.3e-14 on scores of 1 to 100, a few units in the 15th
significant digit. 1e-12 is twenty times that noise and a million times smaller than the six decimals the
plan promises; a bug in the history cut moves a score by tenths or more (the planted bugs below).
"""
from __future__ import annotations

import math
import os
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import pytest
from explorer.predict import PRECOMPUTED_ONLY, Predictor, iso
from fastapi.testclient import TestClient

from app.schemas.whatif import CurveRequest
from app.services import whatif_batch
from app.services.store import SnapshotStore
from app.services.whatif_batch import hypothetical_frame, score_frame
from app.services.whatif_service import WhatIfService

from .conftest import LARGEST, RUNNING_EXAMPLE

FULL = os.environ.get("PARITY_FULL") == "1"
FEWEST_SCORED = "bc1qepzmkm94hy889r9hdf6ck3xgkfpptk75n47284plhg3663ksm6as9nduaq"  # 89 scored of 99
OLDEST = "3HTmUj5wFDQZ2TF8SAcngV7EQ88rptx35D"  # history from December 2020
TAPROOT = "bc1pum0cn22s3ekpzmqrddhrxnfz4ksqcjdq0y3d3p675sj3a0sls76q7cj755"
MID_SIZED = "1GABHZfEcFEZEYWQNsnq9HFEwEzV6CT4Ku"
ADDRESSES = [RUNNING_EXAMPLE, LARGEST, FEWEST_SCORED, OLDEST, TAPROOT, MID_SIZED]
PLAN_TIME = "2026-10-20T12:00:00Z"  # the plan's running example
SCORE_TOLERANCE = 1e-12
DAY = 86400
# What each method's score may differ by, as measured; filled in by the tests and printed by the last one.
deviation: dict[str, float] = {}


@pytest.fixture(scope="module")
def service(predictor: Predictor, settings: Any) -> WhatIfService:
    return WhatIfService(SnapshotStore(predictor), predictor, settings.web.what_if)


def times_of(predictor: Predictor, address: str) -> dict[str, str]:
    """The three times of the grid for one address."""
    rows = predictor.features[predictor.features["address"] == address].sort_values(["block_time_utc", "txid"])
    scored = rows[rows["scorable"]]
    middle = int(scored["block_time_utc"].iloc[len(scored) // 2])
    return {"edge": iso(int(scored["block_time_utc"].iloc[0])), "same-second": iso(middle),
            "after": iso(int(rows["block_time_utc"].max()) + DAY)}


def agree(batch: float | None, single: float | None) -> bool:
    """Whether two scores are the same number: equal, or within `SCORE_TOLERANCE`."""
    if batch is None or single is None:
        return batch is single
    return batch == single or abs(batch - single) < SCORE_TOLERANCE


WIDE_RANGE = {"minBtc": 0.000001, "maxBtc": 10, "points": 41}


def check_curve(predictor: Predictor, service: WhatIfService, address: str, direction: str, time: str,
                picks: Callable[[int], list[int]] = lambda n: list(range(n)), amounts: dict[str, Any] | None = None,
                measure: bool = True) -> int:
    """Score a curve of 41 amounts once, then each picked amount alone, and require the same scores and flags.

    `amounts` is the range or list the request carries; without it the server chooses (the default curve). `measure`
    adds the differences seen to `deviation`; the tests that plant a bug turn it off.

    Returns:
        How many amounts were compared with a single call.
    """
    curve = service.curve(address, CurveRequest.model_validate({"direction": direction, "time": time, **(amounts or {})}))
    assert len(curve.amounts_btc) == 41
    assert [m.id for m in curve.methods] == [m for m in predictor.methods if m not in PRECOMPUTED_ONLY]
    chosen = picks(len(curve.amounts_btc))
    for i in chosen:
        single = predictor.score_what_if(address, curve.amounts_btc[i], direction, time)
        for method in curve.methods:
            where = f"{address[:10]} {direction} {time} amount {curve.amounts_btc[i]} {method.id}"
            assert method.flags[i] == single["flags"][method.id], f"flag differs: {where}"
            assert agree(method.scores[i], single["scores"][method.id]), (
                f"score differs: {where}: {method.scores[i]!r} against {single['scores'][method.id]!r}")
            if measure and method.scores[i] is not None:
                gap = abs(method.scores[i] - single["scores"][method.id])
                deviation[method.id] = max(deviation.get(method.id, 0.0), gap)
    return len(chosen)


@pytest.mark.parametrize("direction", ["out", "in"])
@pytest.mark.parametrize("address", ADDRESSES, ids=[a[:10] for a in ADDRESSES])
def test_the_curve_equals_single_calls_over_the_grid(predictor: Predictor, service: WhatIfService, address: str, direction: str) -> None:
    """Both directions and three times for each of six addresses.

    A default run compares the curve's smallest amount and one amount from its middle with single calls; a full run, all 41.
    """
    compared = 0
    for number, time in enumerate(times_of(predictor, address).values()):
        picks = (lambda n: list(range(n))) if FULL else (lambda n, k=number: [0, 12 + 7 * k])  # the end, and a different middle each time
        compared += check_curve(predictor, service, address, direction, time, picks, WIDE_RANGE)
    assert compared == (123 if FULL else 6)


def test_every_amount_of_the_running_examples_curve_equals_a_single_call(predictor: Predictor, service: WhatIfService) -> None:
    """The plan's example (0.05 BTC out at 2026-10-20T12:00:00Z), all 41 amounts of its default curve."""
    assert check_curve(predictor, service, RUNNING_EXAMPLE, "out", PLAN_TIME) == 41


def test_the_features_of_every_row_are_bit_identical_to_a_single_build(predictor: Predictor) -> None:
    """The batch changes nothing about a row's features, which is why the scores can agree."""
    real = predictor.transactions[predictor.transactions["address"] == RUNNING_EXAMPLE]
    seconds = int(datetime.fromisoformat(PLAN_TIME.replace("Z", "+00:00")).timestamp())
    amounts = [float(np.round(a, 8)) for a in np.geomspace(1e-6, 1, 9)]
    batch = hypothetical_frame(real, amounts, "out", seconds)
    for i, amount in enumerate(amounts):
        alone = hypothetical_frame(real, [amount], "out", seconds)
        pd.testing.assert_frame_equal(batch.iloc[[i]].reset_index(drop=True).drop(columns="txid"), alone.drop(columns="txid"), check_exact=True)


def test_the_running_examples_plan_amounts_flag_the_way_the_plan_says(predictor: Predictor, service: WhatIfService) -> None:
    """0.05 BTC out is flagged with score 5.98 against a usual 0.000525 BTC; the plan's seven amounts follow single calls."""
    amounts = [0.0001, 0.001, 0.01, 0.05, 0.1, 1, 10]
    request = CurveRequest.model_validate({"direction": "out", "time": PLAN_TIME, "amountsBtc": amounts})
    curve = service.curve(RUNNING_EXAMPLE, request)
    baseline = next(m for m in curve.methods if m.id == "baseline")
    assert curve.amounts_btc == amounts and round(curve.usual_btc or 0, 6) == 0.000525
    assert round(baseline.scores[3] or 0, 2) == 5.98 and baseline.flags[3] is True
    assert [round(s or 0, 4) for s in baseline.scores] == [2.1398, 0.9493, 3.9077, 5.9755, 6.8661, 9.8245, 12.7829]  # b-json.tex
    assert baseline.flags == [False, False, False, True, True, True, True]
    single = predictor.score_what_if(RUNNING_EXAMPLE, 0.05, "out", PLAN_TIME)
    assert single["flagged"] is True and round(single["score"], 2) == 5.98


def test_the_batch_keeps_the_order_of_the_amounts_it_is_given(predictor: Predictor) -> None:
    """Amounts need not be sorted, and a repeated amount repeats its answer."""
    real = predictor.transactions[predictor.transactions["address"] == RUNNING_EXAMPLE]
    seconds = int(datetime.fromisoformat(PLAN_TIME.replace("Z", "+00:00")).timestamp())
    amounts = [1.0, 0.0001, 0.05, 0.0001]
    scores = score_frame(predictor, hypothetical_frame(real, amounts, "out", seconds)).scores["baseline"]
    assert scores[1] == scores[3] and scores[1] != scores[0] != scores[2]
    for amount, score in zip(amounts, scores):
        assert predictor.score_what_if(RUNNING_EXAMPLE, amount, "out", PLAN_TIME)["scores"]["baseline"] == score


def test_the_check_catches_a_batch_that_misses_one_row_of_history(predictor: Predictor, service: WhatIfService,
                                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    """An off-by-one in the history cut (here: the newest earlier transaction is left out) must fail the parity check."""
    original = whatif_batch.hypothetical_frame

    def one_row_short(real: pd.DataFrame, amounts: list[float], direction: str, time_utc: int) -> pd.DataFrame:
        newest_earlier = real.index[real["block_time_utc"] < time_utc][-1]
        return original(real.drop(newest_earlier), amounts, direction, time_utc)

    monkeypatch.setattr("app.services.whatif_service.hypothetical_frame", one_row_short)
    with pytest.raises(AssertionError, match="differs"):
        check_curve(predictor, service, RUNNING_EXAMPLE, "out", PLAN_TIME, lambda n: [0, 20, 40], WIDE_RANGE, measure=False)


def test_the_check_catches_a_batch_that_lets_a_same_second_transaction_count_as_history(
        predictor: Predictor, service: WhatIfService, monkeypatch: pytest.MonkeyPatch) -> None:
    """The time-safety rule's other edge: a real transaction at the what-if's own second is not history.

    The planted bug moves the real same-second transactions one second back, so the feature build counts them. (Writing `<=`
    instead of `<` in the cut changes nothing the scores can see, because `build_features` is itself strict about ties.)
    """
    original = whatif_batch.hypothetical_frame
    time = times_of(predictor, RUNNING_EXAMPLE)["same-second"]
    seconds = int(datetime.fromisoformat(time.replace("Z", "+00:00")).timestamp())

    def counts_same_second(real: pd.DataFrame, amounts: list[float], direction: str, time_utc: int) -> pd.DataFrame:
        shifted = real.copy()
        shifted.loc[shifted["block_time_utc"] == time_utc, "block_time_utc"] = time_utc - 1
        return original(shifted, amounts, direction, time_utc)

    monkeypatch.setattr("app.services.whatif_service.hypothetical_frame", counts_same_second)
    assert (predictor.transactions["block_time_utc"] == seconds).any()
    with pytest.raises(AssertionError, match="differs"):
        check_curve(predictor, service, RUNNING_EXAMPLE, "out", time, lambda n: [0, 20, 40], WIDE_RANGE, measure=False)


def test_the_check_catches_hypothetical_rows_that_see_each_other(predictor: Predictor, service: WhatIfService,
                                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    """The mistake the batch design avoids: if the rows had different times, each would count the ones before it as history."""
    original = whatif_batch.build_features

    def staggered(frame: pd.DataFrame, config: Any) -> pd.DataFrame:
        hypothetical = frame["txid"].str.startswith(whatif_batch.ID_PREFIX)
        frame = frame.copy()
        frame.loc[hypothetical, "block_time_utc"] += np.arange(hypothetical.sum())
        return original(frame, config)

    monkeypatch.setattr(whatif_batch, "build_features", staggered)
    with pytest.raises(AssertionError, match="differs"):
        check_curve(predictor, service, RUNNING_EXAMPLE, "out", PLAN_TIME, lambda n: [0, 20, 40], WIDE_RANGE, measure=False)


def test_the_measured_deviation_is_reported(shared_client: TestClient) -> None:
    """Runs last: prints what the other tests measured (run with -s to see it)."""
    assert math.isfinite(sum(deviation.values()))
    print("\nlargest score difference between the batch and a single call, by method:", {k: f"{v:.1e}" for k, v in sorted(deviation.items())})
