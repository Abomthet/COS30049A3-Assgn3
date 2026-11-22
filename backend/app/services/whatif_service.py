"""E8 and E9: a hypothetical transaction, and a curve over amounts, scored against an address's real earlier history.

The models are Assignment 2's. E8 is `Predictor.score_what_if` as it is (Mod-5's single case). E9 builds the features of
every amount in one pass (`whatif_batch`, Mod-5) and scores them with the same methods, so a point of the curve equals
what E8 would answer for that amount. This module checks the numbers a request may carry (ranges from settings.json ->
web.whatIf), finds the amounts of a curve, and turns A2's refusals into the plan's 422 (Mod-6): an address with too
little history before the chosen time answers with the counts and the first day that could be scored.
"""
from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import numpy as np
import pandas as pd
from explorer.amounts import SATS_PER_BTC
from explorer.predict import InsufficientHistory, Predictor, Unsupported, day, finite, iso
from pydantic import AwareDatetime, TypeAdapter

from ..core.config import WhatIfLimits
from ..core.errors import InvalidRequest, needs_correcting
from ..core.validation import amount_problem, gap_problem, passed
from ..schemas.errors import FieldError
from ..schemas.whatif import Amount, CurveRequest, CurveResponse, Points, WhatIfRequest, WhatIfResult
from .ranks import rank_among
from .reasons import reword, reword_comparison, reword_limitation
from .store import AddressData, AddressStore, predictor_for
from .whatif_batch import hypothetical_frame, score_frame, usable_methods

# Each judges one raw value as the body's own field is, for a body that failed its type check elsewhere (`rejected_*`).
AMOUNT, MOMENT, POINTS = TypeAdapter(Amount), TypeAdapter(AwareDatetime), TypeAdapter(Points)
DAY_SECONDS = 86400
CORRECT_HINT = "Correct the values named below and send the request again."
TOO_EARLY_MESSAGE = "At that time this address did not have enough earlier history to compare with."
# The default curve runs from a hundredth to a thousand times the usual amount (plan section 6.2, E9).
DEFAULT_LOW_FACTOR, DEFAULT_HIGH_FACTOR = 0.01, 1000
SATOSHI_DECIMALS = 8


def _log_spaced(low: float, high: float, points: int) -> list[float]:
    """`points` amounts evenly spaced on a log scale from `low` to `high`, rounded to a satoshi.

    Neighbours that round to the same satoshi are merged, so a range near the satoshi gives fewer points.
    """
    return sorted({float(np.round(v, SATOSHI_DECIMALS)) for v in np.geomspace(low, high, points)})


class WhatIfService:
    """Serves E8 and E9 from an address store and the Predictor."""

    def __init__(self, store: AddressStore, predictor: Predictor, limits: WhatIfLimits) -> None:
        """
        Args:
            store: Where an address's tables come from.
            predictor: Assignment 2's loaded Predictor, which does all the scoring.
            limits: The amount, time and point-count limits (settings.json -> web.whatIf).
        """
        self._store = store
        self._predictor = predictor
        self._limits = limits
        # The methods that cannot score new input: TxGPT's scores for the snapshot were computed in advance.
        self._not_available = [name for name in predictor.methods if name not in usable_methods(predictor)]

    # ---------------------------------------------------------------- E8

    def what_if(self, address: str, request: WhatIfRequest) -> WhatIfResult:
        """E8: one hypothetical transaction's verdict from every method that can score it.

        Raises:
            Unsupported: The address is not in the store.
            InvalidRequest: The amount is out of range or the time is too far after the last transaction.
            InsufficientHistory: Too little history lay before the chosen time.
        """
        data = self._store.get(address)
        result = self.scored_what_if(address, request)
        seconds = int(request.time.astimezone(timezone.utc).timestamp())
        return WhatIfResult.model_validate({**result, "explanation": reword(result["explanation"]),
                                            "limitation": reword_limitation(result["limitation"]),
                                            "comparison": reword_comparison(result["comparison"]), "notAvailable": self._not_available,
                                            "ranks": self._ranks(data, seconds, result["scores"])})

    def scored_what_if(self, address: str, request: WhatIfRequest) -> dict[str, Any]:
        """The hypothetical transaction as `Predictor.score_what_if` gives it, for E8 and E12 (the explanation is A2's text).

        Raises:
            Unsupported: The address is not in the store.
            InvalidRequest: The amount is out of range or the time is too far after the last transaction.
            InsufficientHistory: Too little history lay before the chosen time.
        """
        data = self._store.get(address)
        amount = float(request.amount_btc)
        time_utc = request.time.astimezone(timezone.utc)
        self._raise_for(self._problems(data, time_utc, [("amountBtc", request.amount_btc)]))
        seconds = int(time_utc.timestamp())
        try:
            result = predictor_for(self._predictor, data).score_what_if(address, amount, request.direction, iso(seconds))
        except InsufficientHistory:  # no real transaction before the time: A2's body lacks the first scorable day
            raise self._too_early(data, seconds) from None
        if not result["scored"]:  # earlier history exists but is under the minimum: A2 returns the row unscored
            raise self._too_early(data, seconds)
        return result

    def _ranks(self, data: AddressData, seconds: int, scores: Mapping[str, float | None]) -> dict[str, float | None]:
        """Per method, where the hypothetical score sits among the scores of the address's scored transactions before the time.

        These are the stored scores of the history the transaction is compared with; a method that cannot score new input
        (`scores` lacks it), or one with no stored score in that history, has a rank of None.
        """
        history = data.scores.loc[data.features["scorable"] & (data.features["block_time_utc"] < seconds)]
        return {name: rank_among(history[f"score_{name}"].tolist(), scores.get(name)) if f"score_{name}" in history else None
                for name in self._predictor.methods}

    # ---------------------------------------------------------------- E9

    def curve(self, address: str, request: CurveRequest) -> CurveResponse:
        """E9: scores over a list or a range of amounts, from one feature build.

        Raises:
            Unsupported: The address is not in the store.
            InvalidRequest: An amount, the range, the point count or the time is out of range, or a default range was
                asked for and the address has no earlier transaction in that direction to base it on.
            InsufficientHistory: Too little history lay before the chosen time.
        """
        data = self._store.get(address)
        time_utc = request.time.astimezone(timezone.utc)
        self._raise_for(self._curve_problems(data, time_utc, request.amounts_btc, request.min_btc, request.max_btc, request.points))
        seconds = int(time_utc.timestamp())
        if request.amounts_btc is not None:
            amounts = [float(a) for a in request.amounts_btc]
        elif request.min_btc is not None and request.max_btc is not None and request.points is not None:
            amounts = _log_spaced(float(request.min_btc), float(request.max_btc), request.points)
        else:
            amounts = self._default_amounts(data, request.direction, seconds)
        frame = self._frame(data, amounts, request.direction, seconds)
        predictor = predictor_for(self._predictor, data)  # a fetched address's regression has its own residual scale
        scored = score_frame(predictor, frame)
        usual = finite(frame["usual_F1"].iloc[0])  # the size window holds only earlier transactions, so one value serves every amount
        methods = [{"id": name, "name": self._predictor.method_info(name)["name"],
                    "threshold": float(predictor.methods[name].threshold), "scores": scored.scores[name],
                    "flags": scored.flags[name]} for name in scored.scores]
        return CurveResponse.model_validate({
            "address": address, "direction": request.direction, "time": iso(seconds),
            "usualBtc": None if usual is None else usual / SATS_PER_BTC, "decidingMethod": self._predictor.selected,
            "amountsBtc": amounts, "methods": methods, "notAvailable": self._not_available})

    def _default_amounts(self, data: AddressData, direction: str, seconds: int) -> list[float]:
        """The server's choice when a curve names no amounts: from a hundredth to a thousand times the usual amount.

        The usual amount depends on the time and the direction, so it is read from a feature build of one probe row
        (its own amount does not enter the comparison, which holds only earlier transactions).
        """
        probe = self._frame(data, [self._limits.min_amount_btc], direction, seconds)
        usual = finite(probe["usual_F1"].iloc[0])
        if usual is None:
            raise InvalidRequest("This address has no earlier transaction in that direction to base a range on.",
                                 "Give the amounts yourself, as amountsBtc or as minBtc, maxBtc and points.",
                                 [FieldError(name="direction", message="No earlier transactions in this direction at that time.")])
        low = max(usual / SATS_PER_BTC * DEFAULT_LOW_FACTOR, self._limits.min_amount_btc)
        high = min(usual / SATS_PER_BTC * DEFAULT_HIGH_FACTOR, self._limits.max_amount_btc)
        return _log_spaced(low, high, self._limits.curve_points)

    # ---------------------------------------------------------------- shared

    def _frame(self, data: AddressData, amounts: list[float], direction: str, seconds: int) -> pd.DataFrame:
        """The feature table of the hypothetical rows, or the 422 when they cannot be scored."""
        try:
            frame = hypothetical_frame(data.transactions, amounts, direction, seconds)
        except ValueError:  # the one reason `hypothetical_frame` refuses: nothing earlier
            raise self._too_early(data, seconds) from None
        if not frame["scorable"].all():
            raise self._too_early(data, seconds)
        return frame

    def _too_early(self, data: AddressData, seconds: int) -> InsufficientHistory:
        """The 422 of plan section 6.2: how much history lay before the time, what scoring needs, the first day that works."""
        earlier = data.transactions.loc[data.transactions["block_time_utc"] < seconds, "block_time_utc"]
        scorable = data.features.loc[data.features["scorable"], "block_time_utc"]
        return InsufficientHistory(TOO_EARLY_MESSAGE, {
            "status": "insufficient_history", "message": TOO_EARLY_MESSAGE,
            "history": {"earlierTx": len(earlier), "spanDays": float((seconds - earlier.min()) / DAY_SECONDS) if len(earlier) else 0.0,
                        "required": self._predictor.requirement()},
            "firstScoredDate": day(scorable.min()) if len(scorable) else None})

    def _problems(self, data: AddressData | None, time_utc: datetime | None, amounts: Sequence[tuple[str, Decimal]],
                  extra: Sequence[FieldError] = ()) -> list[FieldError]:
        """Every field of the body at fault: the `extra` the caller found, each amount outside its range, and a time too far on.

        A `time_utc` or `data` of None is not judged: the time failed its type check, or the address is not in the store.
        """
        errors = list(extra)
        errors += [FieldError(name=name, message=problem) for name, amount in amounts
                   if (problem := amount_problem(amount, self._limits))]
        if data is not None and time_utc is not None:
            last = datetime.fromtimestamp(int(data.features["block_time_utc"].max()), tz=timezone.utc)
            if problem := gap_problem(time_utc, last, self._limits):
                errors.append(FieldError(name="time", message=problem))
        return errors

    @staticmethod
    def _raise_for(errors: list[FieldError]) -> None:
        """One 400 naming every field in `errors`, when there are any."""
        if errors:
            raise InvalidRequest(needs_correcting(len(errors)), CORRECT_HINT, errors)

    def _curve_problems(self, data: AddressData | None, time_utc: datetime | None, amounts_btc: Sequence[Decimal | None] | None,
                        min_btc: Decimal | None, max_btc: Decimal | None, points: int | None) -> list[FieldError]:
        """E9's body: the amounts or the range, the point count and the time. A value of None is not judged.

        Each rule stands on its own, so a body whose `points` failed its type check still has its amounts judged.
        """
        limit = self._limits.curve_max_points
        extra: list[FieldError] = []
        amounts: list[tuple[str, Decimal]] = []
        if amounts_btc is not None:
            if not amounts_btc or len(amounts_btc) > limit:
                extra.append(FieldError(name="amountsBtc", message=f"Give between 1 and {limit} amounts."))
            amounts += [(f"amountsBtc.{i}", a) for i, a in enumerate(amounts_btc) if a is not None]
        if points is not None and points > limit:
            extra.append(FieldError(name="points", message=f"Must be at most {limit}."))
        if min_btc is not None and max_btc is not None and min_btc >= max_btc:
            extra.append(FieldError(name="maxBtc", message="Must be greater than minBtc."))
        amounts += [(name, a) for name, a in (("minBtc", min_btc), ("maxBtc", max_btc)) if a is not None]
        return self._problems(data, time_utc, amounts, extra)

    # ---------------------------------------------------------------- bodies that failed their type check

    def _known(self, address: str) -> AddressData | None:
        """The address's data, or None when the address is not in the store (its 404 comes once the body is right)."""
        try:
            return self._store.get(address)
        except Unsupported:
            return None

    def rejected_what_if(self, address: str, body: Mapping[str, Any]) -> list[FieldError]:
        """E8: the fields at fault by this service's rules, for a body that failed its type check on another field.

        Only what passed the type check is judged (see `passed`), so one 400 can name every field at fault.
        """
        amount = passed(AMOUNT, body.get("amountBtc"))
        return self._problems(self._known(address), passed(MOMENT, body.get("time")),
                              [] if amount is None else [("amountBtc", amount)])

    def rejected_curve(self, address: str, body: Mapping[str, Any]) -> list[FieldError]:
        """E9: as `rejected_what_if`, for the amounts, the range, the point count and the time."""
        raw = body.get("amountsBtc")
        return self._curve_problems(
            self._known(address), passed(MOMENT, body.get("time")),
            [passed(AMOUNT, item) for item in raw] if isinstance(raw, list) else None,
            passed(AMOUNT, body.get("minBtc")), passed(AMOUNT, body.get("maxBtc")), passed(POINTS, body.get("points")))
