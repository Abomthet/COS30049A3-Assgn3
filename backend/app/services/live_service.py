"""E16 to E20: the live lookup of an address outside the snapshot (S-09, CR-08; plan sections 6.4, 7.4 and 10).

A lookup is a background job. It asks the public blockchain service (Esplora; Blockstream first, mempool.space when the first
limits the rate) for the address's confirmed history, newest first, 25 transactions a page, with Assignment 2's polite client
(`explorer.esplora`: paced requests, back-off, the switch of host). It stops at `maxTx`, scores the history with the frozen models
(`live_scoring`) and hands the result to the live store, after which every other endpoint answers for the address with
`source: "live"`.

Only the address leaves this computer. At most `web.live.lookupsPerHour` lookups start in an hour and only one runs at a time,
so a marker or a loop cannot spend the public service's allowance (about 700 requests an hour from one IP address). A fresh
cached fetch answers at once without any request. The job's events are kept as a list, so a client that connects late, or
reconnects, is replayed everything in order and never misses the end.
"""
from __future__ import annotations

import collections
import logging
import math
import threading
import time
import uuid
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any

from explorer.esplora import PAGE_SIZE, EsploraEndpoints, EsploraError
from explorer.predict import Unsupported
from explorer.snapshot import trim_tx

from ..core.config import LiveSettings
from ..core.errors import Conflict, InvalidRequest, NotFound, RateLimited, UpstreamError, UpstreamTimeout, needs_correcting
from ..schemas.errors import FieldError
from ..schemas.live import LiveLookup
from .live_store import LiveStore, iso_utc
from .store import LiveFetch

log = logging.getLogger("app.live")

HOUR_SECONDS = 3600
BUSY_RETRY_SECONDS = 10  # what a second lookup is told to wait while one is running: a fetch of 500 transactions takes about that long
KEEP_JOBS = 50
TERMINAL = ("done", "failed", "cancelled")
SLOW_HINT = "Try again in a minute, or pick one of the snapshot addresses."
EVENT_FOR_STATUS = {"done": "done", "failed": "failed"}


@dataclass
class Job:
    """One lookup. Its fields change only under `lock`; `events` only ever grows."""

    id: str
    address: str
    max_tx: int
    started_unix: float
    status: str = "queued"
    pages: int = 0
    transactions: int = 0
    cap: int = 0
    total: int | None = None
    error: dict[str, Any] | None = None
    finished_unix: float | None = None
    cached: bool = False
    cancel: threading.Event = field(default_factory=threading.Event)
    events: list[tuple[str, dict[str, Any]]] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def body(self) -> dict[str, Any]:
        """The lookup as E16, E17 and each event give it (the caller holds `lock`)."""
        return {"id": self.id, "address": self.address, "status": self.status,
                "progress": {"pages": self.pages, "transactions": self.transactions, "cap": self.cap, "total": self.total},
                "maxTx": self.max_tx, "startedAt": iso_utc(self.started_unix),
                "finishedAt": None if self.finished_unix is None else iso_utc(self.finished_unix),
                "error": self.error, "cached": self.cached,
                "links": {"status": f"/api/live/lookups/{self.id}", "events": f"/api/live/lookups/{self.id}/events"}}

    @property
    def finished(self) -> bool:
        return self.status in TERMINAL


class LiveService:
    """Starts, follows and cancels lookups; forgets fetched addresses."""

    def __init__(self, store: LiveStore, limits: LiveSettings, esplora: Callable[[], EsploraEndpoints],
                 clock: Callable[[], float] = time.time) -> None:
        """
        Args:
            store: Where fetched addresses are kept.
            limits: settings.json -> web.live.
            esplora: Gives the client a lookup reads the chain with (called once per lookup).
            clock: Unix seconds; tests pass their own.
        """
        self._store = store
        self._limits = limits
        self._esplora = esplora
        self._clock = clock
        self._lock = threading.Lock()
        self._jobs: dict[str, Job] = {}
        self._starts: collections.deque[float] = collections.deque()
        self._thread: threading.Thread | None = None
        self.keepalive_seconds = 15.0  # E18 sends a comment line this often so the connection stays open

    # ---------------------------------------------------------------- E16

    def start(self, address: str, max_tx: int | None) -> tuple[Job, bool]:
        """E16: start a lookup, or answer from a fresh cached fetch.

        Returns:
            The job, and whether it is new and running (202) or answered from the cache (200).

        Raises:
            InvalidRequest: `maxTx` is outside its range.
            Conflict: A lookup for this address is already running.
            RateLimited: Another lookup is running, or the hour's allowance is spent.
            NotFound: The address has no confirmed transactions.
            UpstreamError: The public blockchain service answered with an error.
            UpstreamTimeout: It did not answer in time.
        """
        max_tx = self._limits.default_max_tx if max_tx is None else max_tx
        if problems := self._range_problems(max_tx):
            raise InvalidRequest(needs_correcting(1), "Correct the values named below and send the request again.", problems)
        now = self._clock()
        with self._lock:
            fetch = self._store.fetch_of(address)
            if fetch is not None and (not fetch.truncated or fetch.max_tx >= max_tx):
                job = self._new_job(address, max_tx, now)
                job.cached, job.status, job.finished_unix = True, "done", now
                job.pages, job.transactions, job.cap, job.total = math.ceil(fetch.transactions / PAGE_SIZE), fetch.transactions, fetch.transactions, fetch.total
                self._emit(job, "done")
                return job, True
            if any(j.address == address and not j.finished for j in self._jobs.values()):
                raise Conflict("A lookup for this address is already running.", "Wait for it to finish, or cancel it first.")
            if self._running():
                raise RateLimited("Another lookup is running; only one runs at a time.", BUSY_RETRY_SECONDS,
                                  "Wait a few seconds and ask again.")
            while self._starts and now - self._starts[0] >= HOUR_SECONDS:
                self._starts.popleft()
            if len(self._starts) >= self._limits.lookups_per_hour:
                wait = max(1, math.ceil(self._starts[0] + HOUR_SECONDS - now))
                raise RateLimited(f"At most {self._limits.lookups_per_hour} lookups an hour are allowed.", wait,
                                  f"Try again in {math.ceil(wait / 60)} minutes, or pick one of the snapshot addresses.")
            self._starts.append(now)
            job = self._new_job(address, max_tx, now)  # reserves the one place while the first request is made below
        client = self._esplora()
        try:
            total = self._count(client, address)
        except BaseException:
            with self._lock:
                self._jobs.pop(job.id, None)
            raise
        with job.lock:
            job.total, job.cap = total, min(max_tx, total)
            self._set_status(job, "fetching")
        self._thread = threading.Thread(target=self._run, args=(job, client), name=f"live-{job.id}", daemon=True)
        self._thread.start()
        return job, False

    def rejected_lookup(self, body: Mapping[str, Any]) -> list[FieldError]:
        """E16: the range of `maxTx`, for a body that failed its type check on another field."""
        value = body.get("maxTx")
        if isinstance(value, int) and not isinstance(value, bool):
            return self._range_problems(value)
        return []

    def _range_problems(self, max_tx: int) -> list[FieldError]:
        if self._limits.min_max_tx <= max_tx <= self._limits.max_tx_limit:
            return []
        return [FieldError(name="maxTx", message=f"Must be between {self._limits.min_max_tx} and {self._limits.max_tx_limit}.")]

    def _new_job(self, address: str, max_tx: int, now: float) -> Job:
        """Register a job (the caller holds `_lock`); finished jobs beyond the newest `KEEP_JOBS` are forgotten."""
        job = Job(uuid.uuid4().hex[:12], address, max_tx, now, cap=max_tx)
        self._jobs[job.id] = job
        finished = [j for j in self._jobs.values() if j.finished and j is not job]
        for old in finished[:max(0, len(self._jobs) - KEEP_JOBS)]:
            del self._jobs[old.id]
        return job

    def _running(self) -> bool:
        return any(not j.finished for j in self._jobs.values())

    def _count(self, client: EsploraEndpoints, address: str) -> int:
        """How many confirmed transactions the address has (one request), which is also the first answer's proof the service is up."""
        try:
            stats = client.address(address)
            total = int(stats["chain_stats"]["tx_count"])
        except EsploraError as error:
            raise self._upstream(error) from error
        except (KeyError, TypeError, ValueError) as error:
            log.warning("The address reply of the public service has an unexpected shape (%s)", error.__class__.__name__)
            raise UpstreamError("The public blockchain service sent an answer this service cannot read.", SLOW_HINT) from error
        if total == 0:
            raise NotFound("This address has no confirmed transactions yet, so there is nothing to fetch.",
                           "Pick one of the snapshot addresses, or try an address that has been used.")
        return total

    @staticmethod
    def _upstream(error: EsploraError) -> UpstreamError | UpstreamTimeout:
        """The API error for a failed request; the service's own text goes to the log, never to the reader."""
        log.warning("The public blockchain service failed: %s", error)
        if error.status is None:
            return UpstreamTimeout("The public blockchain service did not answer in time.", SLOW_HINT)
        return UpstreamError("The public blockchain service answered with an error.", SLOW_HINT)

    # ---------------------------------------------------------------- the job

    def _emit(self, job: Job, name: str) -> None:
        """Append an event carrying the lookup as it is now (the caller holds `job.lock`, or the job is not yet shared)."""
        job.events.append((name, job.body()))

    def _set_status(self, job: Job, status: str) -> None:
        """Move to a new status and say so (the caller holds `job.lock`)."""
        job.status = status
        if status in TERMINAL:
            job.finished_unix = self._clock()
        self._emit(job, EVENT_FOR_STATUS.get(status, "status"))

    def _run(self, job: Job, client: EsploraEndpoints) -> None:
        """The job's thread: page through the history, score it, store it. Every way out leaves a terminal status."""
        try:
            transactions = self._page(job, client)
            if transactions is None:
                return
            with job.lock:
                if job.cancel.is_set():
                    return
                self._set_status(job, "scoring")
            fetch = LiveFetch(iso_utc(self._clock()), int(self._clock()), job.max_tx, len(transactions), job.total or len(transactions),
                              (job.total or 0) > len(transactions))
            self._store.put(job.address, transactions, fetch)
            with job.lock:
                if job.cancel.is_set():  # cancelled while scoring: nothing is kept
                    self._store.forget(job.address)
                else:
                    self._set_status(job, "done")
        except EsploraError as error:
            self._fail(job, self._upstream(error))
        except ValueError as error:  # `build_transactions`: a value is missing, so the service's reply changed shape
            log.warning("Scoring %s failed on the reply's shape: %s", job.address, error)
            self._fail(job, UpstreamError("The public blockchain service sent data this service cannot read.", SLOW_HINT))
        except Exception:
            log.exception("The lookup of %s failed unexpectedly", job.address)
            self._fail(job, None)

    def _page(self, job: Job, client: EsploraEndpoints) -> list[dict[str, Any]] | None:
        """Fetch pages newest first until the cap or a short page. Returns None when the lookup was cancelled."""
        found: list[dict[str, Any]] = []
        last_seen: str | None = None
        while len(found) < job.cap:
            if job.cancel.is_set():
                return None
            page = client.address_txs_chain(job.address, last_seen)
            found.extend(trim_tx(tx, job.address) for tx in page)
            del found[job.cap:]
            with job.lock:
                if job.cancel.is_set():
                    return None
                job.pages, job.transactions = job.pages + 1, len(found)
                self._emit(job, "progress")
            if len(page) < PAGE_SIZE:
                break
            last_seen = page[-1]["txid"]
        return found

    def _fail(self, job: Job, error: UpstreamError | UpstreamTimeout | None) -> None:
        """End the job as failed. A cancelled job stays cancelled."""
        with job.lock:
            if job.finished:
                return
            if error is None:
                job.error = {"status": "server_error", "message": "Something went wrong on our side.",
                             "hint": "Try again. If it keeps happening, give the request identifier to the team."}
            else:
                job.error = {"status": error.status, "message": error.message, "hint": error.hint}
            self._set_status(job, "failed")

    # ---------------------------------------------------------------- E17, E19

    def job(self, lookup_id: str) -> Job:
        """E17's lookup.

        Raises:
            NotFound: No lookup has this identifier (it may have been forgotten after many newer ones).
        """
        with self._lock:
            found = self._jobs.get(lookup_id)
        if found is None:
            raise NotFound("There is no lookup with this identifier.", "Start a new lookup.")
        return found

    def state(self, job: Job) -> LiveLookup:
        """The lookup as E16, E17 and the events give it."""
        with job.lock:
            return LiveLookup.model_validate(job.body())

    def cancel(self, lookup_id: str) -> None:
        """E19: stop a running lookup (the fetch ends at the next page, and nothing is stored); a finished one is left as it is.

        Raises:
            NotFound: No lookup has this identifier.
        """
        job = self.job(lookup_id)
        with job.lock:
            if not job.finished:
                job.cancel.set()
                self._set_status(job, "cancelled")

    # ---------------------------------------------------------------- E20

    def forget(self, address: str) -> None:
        """E20: remove a fetched address and its cache file.

        Raises:
            Conflict: A lookup for the address is still running.
            Unsupported: The address is not held.
        """
        with self._lock:
            if any(j.address == address and not j.finished for j in self._jobs.values()):
                raise Conflict("This address is being fetched right now.", "Cancel the lookup first, then forget the address.")
        if not self._store.forget(address):
            raise Unsupported(f"{address} has not been fetched")

    def close(self) -> None:
        """Stop a running lookup and wait for its thread (the application is shutting down)."""
        with self._lock:
            jobs = [j for j in self._jobs.values() if not j.finished]
        for job in jobs:
            with job.lock:
                job.cancel.set()
        thread = self._thread
        if thread is not None:
            thread.join(timeout=5)
