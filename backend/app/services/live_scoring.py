"""Mod-11: Assignment 2's frozen models applied to one fetched address (S-09; plan section 7.4).

A fetched address goes through the route Assignment 2 used for its held-out snapshots (`ds2_check`, `ds10`): the clean
transaction table (`build_transactions`), the features (`build_features`), the 70% time split (`assign_periods`) and every
saved method, frozen, scoring every transaction. The one per-address quantity in the models, the regression's residual scale
("how far this address's amounts usually miss the prediction"), is set from the address's own fit period by the rule the
training used (`residual_scales`), because the saved scales belong to the 28 addresses the models were fitted on. TxGPT
needs a GPU pass over each address's tokens, so a fetched address has no TxGPT score, as a what-if has none.

Nothing here re-implements a feature or a score; this module only chains Assignment 2's functions, as `ds2_check.py` does.
"""
from __future__ import annotations

from typing import Any

import io

import numpy as np
import pandas as pd
from explorer.features import FeatureConfig, build_features
from explorer.fusion import Cached, FusionMethod
from explorer.methods import Method, fit_rows, flags
from explorer.predict import PRECOMPUTED_ONLY, Predictor
from explorer.regression import RegressionMethod, residual_scales, targets
from explorer.settings import SETTINGS
from explorer.split import assign_periods
from explorer.transactions import build_transactions

from .store import AddressData, LiveFetch

ROLE = "live"


def adapt(method: Method, fit: pd.DataFrame) -> Method:
    """The frozen method, with the regression's residual scales set from the address's own fit period.

    The same rule as `explorer.ds2_check.adapt`, which Assignment 2 applied to every address it had not trained on.
    A fusion adapts its components; every other method is returned as it is.
    """
    if isinstance(method, RegressionMethod):
        floor = SETTINGS["regression"]["residualFloor"]
        scales = {}
        for target, model in method.models.items():
            y = targets(fit)[target]
            keep = y.notna()
            scales[target], _ = residual_scales(model, fit[keep], y[keep], floor)
        return RegressionMethod(method.models, scales, method.default_scale)
    if isinstance(method, FusionMethod):
        fused = FusionMethod({name: adapt(component, fit) for name, component in method.components.items()}, method.multipliers)
        fused.threshold = method.threshold
        return fused
    return method


def as_saved(features: pd.DataFrame) -> pd.DataFrame:
    """The feature table as `run_features` leaves it in features.csv: written to text with the saved number of significant
    digits and read back. The regression's trees split on exact values, so a score computed from unrounded features can differ
    from the one computed from the saved table (by tenths, for a few rows); the models were fitted on the saved table."""
    text = features.to_csv(index=False, float_format=f"%.{SETTINGS['features']['csvSignificantDigits']}g")
    return pd.read_csv(io.StringIO(text), dtype={"address": str, "txid": str})


def score_history(predictor: Predictor, address: str, transactions: list[dict[str, Any]], fetched: LiveFetch) -> AddressData:
    """The address's tables, scored, from the transactions Esplora returned (in the trimmed form `trim_tx` gives).

    Args:
        predictor: The loaded Predictor, which holds the frozen methods.
        address: The address, as normalised.
        transactions: Its confirmed transactions, as the service returned them.
        fetched: When and how they were read.

    Raises:
        ValueError: A value the cleaning needs is missing (the service's reply changed shape).
    """
    clean, _ = build_transactions({address: {"role": ROLE, "txs": transactions}})
    return score_transactions(predictor, clean, fetched)


def score_transactions(predictor: Predictor, clean: pd.DataFrame, fetched: LiveFetch) -> AddressData:
    """The address's tables, scored, from its clean transaction table (`build_transactions`' output for one address)."""
    address = str(clean["address"].iloc[0])
    features = as_saved(build_features(clean, FeatureConfig.refined()))
    features["period"], _ = assign_periods(features, SETTINGS["model"]["fitFraction"])
    features = features.sort_values(["block_time_utc", "txid"]).set_index("txid", drop=False)
    scores = features[["address", "role", "txid", "block_time_utc", "direction", "net_sats", "period", "scorable"]].copy()
    methods: dict[str, Method] = {}
    scorable = bool(features["scorable"].any())
    fit = fit_rows(features)
    for name, saved in predictor.methods.items():
        if name in PRECOMPUTED_ONLY or not scorable:
            scores[f"score_{name}"], scores[f"flag_{name}"] = np.nan, False
            methods[name] = saved
            continue
        method = adapt(saved, fit)
        # Apple's Accelerate library sets floating-point flags that NumPy reports as "divide by zero in matmul" for some matrix
        # sizes, with correct results (the scores below equal the saved ones to 1e-13); the report would be an error in the tests.
        with np.errstate(divide="ignore", over="ignore", invalid="ignore"):
            values = method.score(features)
        scores[f"score_{name}"] = values
        scores[f"flag_{name}"] = flags(Cached(method.threshold, pd.Series(values, index=features.index)), features)
        methods[name] = method
    return AddressData(address, "live", features, clean, scores, fetched, methods,
                       version=f"{fetched.fetched_unix}")
