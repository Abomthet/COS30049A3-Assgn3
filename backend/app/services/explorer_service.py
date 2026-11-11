"""Timeline, rows and detail of one address, and the per-address cache behind them (E3 to E7; Mod-2, Mod-3, Mod-4, Mod-7).

`Predictor.score_address` answers everything about an address at once: up to 2 MB for the largest. A view needs a
few kilobytes, so the result is computed once per address and method, kept, and cut into the three pieces the
endpoints serve: the timeline (E5), a filtered page of rows (E6) and one transaction (E7). The numbers are
Assignment 2's own, never recomputed here: this module only filters, sorts, pages and picks.

The cache keeps one entry per (method, address), least recently used leaving first, and holds as many entries as
there are snapshot addresses: one full set. It fills lazily on a first view and is warmed for every address under
the default method in the background after the start (`warm`), so the first view of an address is rarely a cold one.
"""
from __future__ import annotations

import dataclasses
import threading
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, cast

from explorer.explain import reasons_for
from explorer.predict import InsufficientHistory, Predictor, iso

from ..core.config import ListLimits
from ..core.errors import InvalidRequest, NotFound, needs_correcting
from ..core.validation import is_day, validate_address
from ..schemas.addresses import (AddressesResponse, AddressSummary, LookupResponse, TimelineResponse, TransactionRow,
                                 TransactionsQuery, TransactionsResponse)
from ..schemas.common import SnapshotInfo
from ..schemas.errors import FieldError
from ..schemas.transactions import TransactionDetail
from .store import AddressData, AddressStore

NOT_SCORED_MESSAGE = "This transaction could not be scored: the address had too little earlier history to compare it with."


@dataclass(frozen=True)
class AddressView:
    """One cache entry: an address as one method sees it, cut into what the endpoints serve."""

    timeline: TimelineResponse
    rows: tuple[TransactionRow, ...]
    # Transaction ID -> the `Predictor.detail` dictionary; for a short-history address, its facts only.
    transactions: dict[str, dict[str, Any]]


def _row(tx: dict[str, Any]) -> TransactionRow:
    """A list row from a transaction's detail (or, when it has no verdict, from its facts alone).

    A transaction that was not scored shows no score, no reason and no flags, even if a method stored a number for it.
    """
    scored = tx.get("scored", False)
    reasons, _ = reasons_for(tx["features"]) if scored else ([], False)
    status = "not-scored" if not scored else "flagged" if tx["flagged"] else "not-flagged"
    return TransactionRow(
        txid=tx["txid"], time=tx["time"], direction=tx["direction"], net_sats=tx["netSats"], status=status,
        score=tx["score"] if scored else None, main_reason=reasons[0]["headline"] if reasons else None,
        main_z=reasons[0]["z"] if reasons else None, flagged_by=sum(tx["flags"].values()) if scored else 0)


class ExplorerService:
    """Serves E3 to E7 from an address store and the Predictor, through the per-address cache."""

    def __init__(self, store: AddressStore, predictor: Predictor, lists: ListLimits) -> None:
        """
        Args:
            store: Where an address's tables come from.
            predictor: Assignment 2's loaded Predictor, which does all the scoring.
            lists: Paging limits (settings.json -> web.lists).
        """
        self._store = store
        self._lists = lists
        self._default = predictor.selected
        # A method's view of the data is a Predictor that shares the loaded tables and differs in `selected` (S-01).
        self._predictors = {name: dataclasses.replace(predictor, selected=name) for name in predictor.methods}
        self._snapshots = {name: SnapshotInfo.model_validate(view.snapshot()) for name, view in self._predictors.items()}
        # Thread-safe, but two requests for the same cold address may both score it: the results are equal, and the
        # later one replaces the earlier. Not worth a lock around 60 ms of work.
        self._view = lru_cache(maxsize=len(store.addresses()))(self._build_view)

    # ---------------------------------------------------------------- the cache

    def warm(self, stop: threading.Event) -> int:
        """Fill the cache for every address under the default method; stops early when `stop` is set.

        Returns:
            How many addresses were filled.
        """
        filled = 0
        for address in self._store.addresses():
            if stop.is_set():
                break
            self._view(self._default, address)
            filled += 1
        return filled

    @property
    def cache_hits(self) -> int:
        """How many views were served from the cache so far (the tests read this)."""
        return self._view.cache_info().hits

    @property
    def cache_size(self) -> int:
        """How many entries the cache holds."""
        return self._view.cache_info().currsize

    def _build_view(self, method: str, address: str) -> AddressView:
        """Score an address once and cut the result into the pieces the endpoints serve."""
        predictor, data = self._predictors[method], self._store.get(address)
        if not data.features["scorable"].any():
            return self._unscored_view(predictor, data)
        result = predictor.score_address(address)
        transactions = {tx["txid"]: tx for tx in result["transactions"]}
        timeline = TimelineResponse.model_validate({key: value for key, value in result.items() if key != "transactions"})
        return AddressView(timeline, tuple(_row(tx) for tx in result["transactions"]), transactions)

    def _unscored_view(self, predictor: Predictor, data: AddressData) -> AddressView:
        """The view of an address with too little history to score, built from its feature table (Mod-4).

        `score_address` raises for these addresses, but the screen still lists their transactions, unscored.
        """
        facts = [predictor.core(row) for _, row in data.features.iterrows()]
        per_day = Counter(fact["time"][:10] for fact in facts)
        timeline = TimelineResponse.model_validate({
            "address": data.address, "snapshot": self._snapshots[predictor.selected],
            "range": {"start": facts[0]["time"], "end": facts[-1]["time"]},
            "days": [{"date": date, "txCount": count, "flaggedCount": 0} for date, count in sorted(per_day.items())],
            "totals": {"txCount": len(facts), "scoredCount": 0, "flaggedCount": 0, "flaggedDays": 0},
            "history": {"status": "insufficient", "txCount": len(facts), "spanDays": float(data.features["history_span_days"].max()),
                        "required": predictor.requirement(), "firstScoredDate": None}})
        return AddressView(timeline, tuple(_row(fact) for fact in facts), {fact["txid"]: fact for fact in facts})

    # ---------------------------------------------------------------- E3, E4

    def _summary(self, data: AddressData, method: str) -> AddressSummary:
        """An address's counts for the list, read from the tables so no address has to be scored for the list."""
        times = data.features["block_time_utc"]
        scored = int(data.features["scorable"].sum())
        kind = validate_address(data.address).kind
        assert kind is not None  # every stored address passed the checker when it was stored
        return AddressSummary(address=data.address, first_seen=iso(times.min()), last_seen=iso(times.max()),
                              tx_count=len(data.features), scored_count=scored,
                              flagged_count=int(data.scores[f"flag_{method}"].sum()),
                              history="sufficient" if scored else "insufficient", kind=kind, source=data.source)

    def addresses(self, method: str | None = None) -> AddressesResponse:
        """E3: every address with its counts. Addresses with enough history come first, busiest first."""
        method = method or self._default
        summaries = [self._summary(self._store.get(address), method) for address in self._store.addresses()]
        summaries.sort(key=lambda s: (s.history != "sufficient", -s.tx_count))
        return AddressesResponse(snapshot=self._snapshots[method], addresses=summaries)

    def lookup(self, address: str) -> LookupResponse:
        """E4: the address is supported, with its summary under the default method.

        Raises:
            Unsupported: The address is not in the store.
        """
        return LookupResponse(status="supported", address=address,
                              summary=self._summary(self._store.get(address), self._default))

    # ---------------------------------------------------------------- E5, E6, E7

    def timeline(self, address: str, method: str | None = None) -> TimelineResponse:
        """E5: per-day counts, totals, range and history status.

        Raises:
            Unsupported: The address is not in the store.
        """
        self._store.get(address)  # raises for an unknown address before anything is scored
        return self._view(method or self._default, address).timeline

    def rows(self, address: str, query: TransactionsQuery) -> TransactionsResponse:
        """E6: a filtered, sorted page of rows.

        Raises:
            InvalidRequest: A day is not a real day, `date` is combined with `from` or `to`, `from` is after `to`, or
                `pageSize` is over the limit.
            Unsupported: The address is not in the store.
        """
        page_size = self._check_query(query)
        self._store.get(address)
        selected = self._select(self._view(query.method or self._default, address).rows, query)
        start = (query.page - 1) * page_size
        return TransactionsResponse(address=address, date=query.date, transactions=selected[start:start + page_size],
                                    page=query.page, page_size=page_size, total=len(selected))

    def detail(self, address: str, txid: str, method: str | None = None) -> TransactionDetail:
        """E7: one transaction's facts, features, reason and every method's verdict.

        Raises:
            Unsupported: The address is not in the store.
            NotFound: The transaction is not one of the address's.
            InsufficientHistory: The transaction could not be scored; the error carries its facts.
        """
        data = self._store.get(address)
        if txid not in data.features.index:
            raise NotFound("This transaction is not one of this address's transactions in the snapshot.",
                           "Check the link, or pick a transaction from the address's list.")
        method = method or self._default
        view = self._view(method, address)
        transaction = view.transactions[txid]
        if not transaction.get("scored", False):
            raise self._not_scored(self._predictors[method], data, view, txid)
        return TransactionDetail.model_validate({**transaction, "source": data.source})

    @staticmethod
    def _not_scored(predictor: Predictor, data: AddressData, view: AddressView, txid: str) -> InsufficientHistory:
        """The 422 for a transaction with too little earlier history behind it: its facts and how much history it had."""
        row = data.features.loc[txid]
        return InsufficientHistory(NOT_SCORED_MESSAGE, {
            "status": "insufficient_history", "message": NOT_SCORED_MESSAGE, "transaction": predictor.core(row),
            "history": {"earlierTx": int(row["earlier_count"]), "spanDays": float(row["history_span_days"]),
                        "required": predictor.requirement()},
            "firstScoredDate": view.timeline.history.first_scored_date})

    # ---------------------------------------------------------------- E6's query

    def _check_query(self, query: TransactionsQuery) -> int:
        """Apply the rules of plan section 11.2 that Pydantic cannot (days, their order, the page-size limit).

        Returns:
            The page size to use.

        Raises:
            InvalidRequest: With every field at fault named.
        """
        days = {"date": query.date, "from": query.from_, "to": query.to}
        errors = [FieldError(name=name, message="Use a day such as 2026-10-20.")
                  for name, value in days.items() if value is not None and not is_day(value)]
        page_size = query.page_size or self._lists.page_size
        if page_size > self._lists.max_page_size:
            errors.append(FieldError(name="pageSize", message=f"Must be at most {self._lists.max_page_size}."))
        if errors:
            raise InvalidRequest(needs_correcting(len(errors)), "Correct the values named below and send the request again.", errors)
        if query.date is not None and (query.from_ is not None or query.to is not None):
            raise InvalidRequest("Use either one date or a range of days, not both.", "Remove the date, or remove from and to.",
                                 [FieldError(name=name, message="Not together with a date range." if name == "date" else "Not together with date.")
                                  for name in ("date", "from", "to") if days[name] is not None])
        if query.from_ is not None and query.to is not None and query.from_ > query.to:
            raise InvalidRequest("The first day is after the last day.", "Swap the two days, or change one of them.",
                                 [FieldError(name="from", message="Must not be after the last day."),
                                  FieldError(name="to", message="Must not be before the first day.")])
        return page_size

    @staticmethod
    def _select(rows: tuple[TransactionRow, ...], query: TransactionsQuery) -> list[TransactionRow]:
        """The rows that match the filters, in the order asked for. Rows arrive oldest first (time, then transaction ID)."""
        first, last = (query.date, query.date) if query.date is not None else (query.from_, query.to)
        chosen = [r for r in rows
                  if (first is None or r.time[:10] >= first) and (last is None or r.time[:10] <= last)
                  and (not query.status or r.status in query.status) and (not query.direction or r.direction in query.direction)]
        descending = query.sort.startswith("-")
        order = query.sort.lstrip("-")
        if order == "time":
            return chosen[::-1] if descending else chosen
        if order == "amount":  # a stable sort, so rows of equal amount stay oldest first
            return sorted(chosen, key=lambda r: r.net_sats, reverse=descending)
        scored = sorted((r for r in chosen if r.score is not None), key=lambda r: cast(float, r.score), reverse=descending)
        return scored + [r for r in chosen if r.score is None]  # rows with no score go last either way
