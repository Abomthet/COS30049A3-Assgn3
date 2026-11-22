"""E12 and E1's `assistant` status: the Explorer Assistant's explanations, guarded, cached and one at a time (Mod-9, D-A3-9).

Assignment 2's Assistant is `explorer.assistant` (the prompt and the guardrail's six checks) with the 152M model that
`explorer.predict.load_writers` builds. This module adds what a web service needs around them:

* **Lazy load.** PyTorch and the 610 MB of weights are not touched until the first answer is asked for, in the worker
  thread that serves that request; E1 reports `loading` meanwhile. Nothing imports torch at start, so the Must tier runs
  without it.
* **One answer at a time.** Writing takes seconds of CPU. A second request that would have to write gets a 429 with
  `Retry-After`; a request that can be answered from memory never waits.
* **Greedy decoding, so a cache.** The same facts always give the same answer, so answers are cached by the SHA-256 of the
  facts the prompt is built from, a failed attempt included (it would fail again).
* **Prepared answers.** `tools/precompute_assistant.py` writes the guarded answers for the snapshot's flagged transactions to
  `data/assistant_answers.json`, which ships in the zip: a computer without the weights still reads them. Each one is
  checked by the guardrail again before it is served.
* **A rejected answer is never returned.** `write_guarded` keeps only the names of the checks an answer failed; the
  response then carries the template.

The writer's own words are reworded after the guardrail has judged them (F4's label by direction, short method names, BTC
with eight decimals, the web's limitation line); the template fallback is the web's text (`reasons.web_explanation`, Mod-20).
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import logging
import math
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from explorer import assistant as guardrail
from explorer.predict import load_writers

from ..core.config import Settings
from ..core.errors import RateLimited
from ..schemas.explanations import ExplanationResponse, WriterAttempt
from ..schemas.system import AssistantStatus
from .reasons import reword, web_explanation

log = logging.getLogger("app.assistant")

WRITER = "text150m"
Writers = list[tuple[str, guardrail.Generator]]
WriterLoader = Callable[[], tuple[Writers, dict[str, str]]]

CACHE_SIZE = 512
DEFAULT_ANSWER_SECONDS = 10  # the plan's figure, until an answer has been timed
LIBRARIES = ("torch", "tokenizers")

# What the screen says (W120, W121): no variable, file or library name. The README says how to install the Assistant and the
# server log says why a load failed, so the three "not installed" causes share one line.
OFF = "The Assistant is turned off on this computer."
NOT_INSTALLED = "The Assistant isn't installed on this computer."
WEIGHTS_MISSING = NOT_INSTALLED
LIBRARIES_MISSING = NOT_INSTALLED
LOAD_FAILED = NOT_INSTALLED


def libraries_installed() -> bool:
    """Whether PyTorch and tokenizers can be imported, found without importing them."""
    return all(importlib.util.find_spec(name) is not None for name in LIBRARIES)


@dataclass(frozen=True)
class Attempt:
    """One writer's try: its name and the guardrail checks its answer failed. The answer itself is not kept."""

    source: str
    failed_checks: tuple[str, ...]


@dataclass(frozen=True)
class Outcome:
    """What the guardrail let through: a writer's answer (`text`) that passed every check, or the template (`text` is None)."""

    source: str
    text: str | None
    attempts: tuple[Attempt, ...]


TEMPLATE = Outcome("template", None, ())


def facts_key(tx: dict[str, Any]) -> str:
    """SHA-256 of the facts the Assistant is given for a transaction: equal facts, equal answer."""
    facts = json.dumps(guardrail.summary(tx), sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(facts.encode("utf-8")).hexdigest()


def write_guarded(tx: dict[str, Any], writers: Writers) -> Outcome:
    """Ask the writers in order; the first answer that passes every guardrail check, else the template.

    The rejected answers are dropped here, keeping only the names of the checks they failed.
    """
    result = guardrail.explain(tx, writers)
    attempts = tuple(Attempt(a["source"], tuple(name for name, ok in a["checks"].items() if name != "passed" and not ok))
                     for a in result["attempts"])
    return Outcome(result["source"], None if result["source"] == "template" else result["text"], attempts)


def prepared_entry(address: str, txid: str, outcome: Outcome) -> dict[str, Any]:
    """One answer as `data/assistant_answers.json` holds it. A template outcome has no text: it is rebuilt when served."""
    entry: dict[str, Any] = {"address": address, "txid": txid, "source": outcome.source,
                             "attempts": [{"source": a.source, "failedChecks": list(a.failed_checks)} for a in outcome.attempts]}
    if outcome.text is not None:
        entry["text"] = outcome.text
    return entry


def load_prepared(path: Path) -> dict[str, dict[str, Any]]:
    """The prepared answers by the SHA-256 of their facts; none when the file is absent or cannot be read."""
    try:
        answers = json.loads(path.read_text(encoding="utf-8"))["answers"]
    except FileNotFoundError:
        return {}
    except (OSError, ValueError, KeyError, TypeError) as error:
        log.warning("The prepared answers in %s cannot be read (%s); they are ignored.", path.name, error.__class__.__name__)
        return {}
    return answers if isinstance(answers, dict) else {}


def _outcome_of(entry: Any, tx: dict[str, Any]) -> Outcome | None:
    """A prepared entry as an outcome, or None when it is malformed or its text no longer passes the guardrail."""
    try:
        attempts = tuple(Attempt(a["source"], tuple(a["failedChecks"])) for a in entry["attempts"])
        if entry["source"] == "template":
            return Outcome("template", None, attempts) if attempts else None
        text = entry["text"]
        passed = entry["source"] == WRITER and guardrail.check(text, guardrail.prompt_messages(tx), guardrail.summary(tx))["passed"]
    except (KeyError, TypeError):
        return None
    return Outcome(WRITER, text, attempts) if passed else None


class AssistantService:
    """Serves E12 and the `assistant` state of E1 and E2."""

    def __init__(self, settings: Settings, loader: WriterLoader = load_writers, cache_size: int = CACHE_SIZE) -> None:
        """
        Args:
            settings: The mode (`EXPLORER_ASSISTANT`), the weights' path, the limitation line and the prepared answers' path.
            loader: Builds the writers on first use; Assignment 2's by default, a fake in tests.
            cache_size: How many answers to keep in memory, least recently used leaving first.
        """
        self._settings = settings
        self._loader = loader
        self._cache_size = cache_size
        self._prepared = load_prepared(settings.assistant_answers) if settings.assistant_mode == "auto" else {}
        self._cache: OrderedDict[str, Outcome] = OrderedDict()
        self._cache_lock = threading.Lock()
        self._gate = threading.Lock()  # held while an answer is written: one at a time
        self._writers: Writers | None = None
        self._failure: str | None = None
        self._loading = False
        self._busy_since: float | None = None
        self._last_seconds: float | None = None

    # ---------------------------------------------------------------- state

    @property
    def prepared_count(self) -> int:
        """How many prepared answers were read."""
        return len(self._prepared)

    def reason_unavailable(self) -> str | None:
        """Why no writer can run on this computer, or None when one can (or is loaded)."""
        if self._settings.assistant_mode == "off":
            return OFF
        if self._writers:
            return None
        if self._failure:
            return self._failure
        if not self._settings.assistant_weights.is_file():
            return WEIGHTS_MISSING
        if not libraries_installed():
            return LIBRARIES_MISSING
        return None

    def status(self) -> AssistantStatus:
        """E1's `assistant`: `off`, `loading` while the model loads, `not_installed`, or `ready`."""
        if self._settings.assistant_mode == "off":
            return "off"
        if self._loading:
            return "loading"
        return "not_installed" if self.reason_unavailable() else "ready"

    # ---------------------------------------------------------------- E12

    def explain(self, tx: dict[str, Any]) -> ExplanationResponse:
        """The explanation of one scored transaction (a detail as Assignment 2's `score_address` or `score_what_if` gives it).

        The prepared answers and the cache are tried first; otherwise the Assistant writes, and the guardrail decides what
        is shown. Without the Assistant the template is returned with the reason.

        Raises:
            RateLimited: Another answer is being written (429).
        """
        started = time.perf_counter()
        key = facts_key(tx)
        if self._settings.assistant_mode == "off":
            return self._respond(tx, TEMPLATE, False, started, {WRITER: OFF})
        outcome = self._remembered(key, tx)
        if outcome is not None:
            return self._respond(tx, outcome, True, started)
        if (reason := self.reason_unavailable()) is not None:
            return self._respond(tx, TEMPLATE, False, started, {WRITER: reason})
        outcome = self._write(key, tx)
        if outcome is None:
            return self._respond(tx, TEMPLATE, False, started, {WRITER: self.reason_unavailable() or LOAD_FAILED})
        return self._respond(tx, outcome, False, started)

    def _remembered(self, key: str, tx: dict[str, Any]) -> Outcome | None:
        """The prepared answer for these facts if it still passes the guardrail, else the cached one."""
        if (entry := self._prepared.get(key)) is not None and (outcome := _outcome_of(entry, tx)) is not None:
            return outcome
        with self._cache_lock:
            outcome = self._cache.get(key)
            if outcome is not None:
                self._cache.move_to_end(key)
            return outcome

    def _remember(self, key: str, outcome: Outcome) -> None:
        with self._cache_lock:
            self._cache[key] = outcome
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)

    def _write(self, key: str, tx: dict[str, Any]) -> Outcome | None:
        """Write one answer, if no other is being written. None when the model cannot be loaded.

        Raises:
            RateLimited: Another answer is being written.
        """
        if not self._gate.acquire(blocking=False):
            raise RateLimited("The Assistant is busy.", self._wait_estimate(), "Try again in a moment.")
        started = time.monotonic()
        self._busy_since = started
        try:
            if (outcome := self._remembered(key, tx)) is not None:  # another request finished these facts while this one waited
                return outcome
            writers = self._load()
            if not writers:
                return None
            outcome = write_guarded(tx, writers)
            self._remember(key, outcome)
            self._last_seconds = time.monotonic() - started
            return outcome
        finally:
            self._busy_since = None
            self._gate.release()

    def _load(self) -> Writers:
        """The writers, built on first use. A failed load is remembered, so it is not retried for every request."""
        if self._writers is None and self._failure is None:
            self._loading = True
            began = time.perf_counter()
            try:
                writers, skipped = self._loader()
                self._writers = writers
                if not writers:
                    log.warning("The Explorer Assistant has no writer to run: %s", "; ".join(skipped.values()) or "no reason given")
                    self._failure = LOAD_FAILED
                else:
                    log.info("The Explorer Assistant is loaded (%.1f s)", time.perf_counter() - began)
            except Exception:  # the cause goes to the log; the response names no file or library error
                log.exception("The Explorer Assistant could not be loaded")
                self._failure = LOAD_FAILED
            finally:
                self._loading = False
        return self._writers or []

    def _wait_estimate(self) -> int:
        """Whole seconds until the answer being written should be done: the last timed answer, or the plan's 10 s."""
        expected = self._last_seconds or DEFAULT_ANSWER_SECONDS
        elapsed = 0.0 if self._busy_since is None else time.monotonic() - self._busy_since
        return max(1, math.ceil(expected - elapsed))

    def _respond(self, tx: dict[str, Any], outcome: Outcome, cached: bool, started: float,
                 skipped: dict[str, str] | None = None) -> ExplanationResponse:
        # The writer's own words get only the phrase rewording, after the guardrail judged them; the template is the web's text.
        text = web_explanation(tx) if outcome.text is None else reword(outcome.text, tx["direction"])
        return ExplanationResponse(
            txid=tx["txid"], flagged=bool(tx["flagged"]), explanation=text, source="template" if outcome.text is None else WRITER,
            cached=cached, attempts=[WriterAttempt(source=a.source, failed_checks=list(a.failed_checks)) for a in outcome.attempts],
            skipped_writers=skipped or {}, limitation=self._settings.limitation_line, seconds=round(time.perf_counter() - started, 3))
