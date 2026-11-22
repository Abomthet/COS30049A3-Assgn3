"""S-05, E12: the Explorer Assistant's explanations answer each status of plan section 6.2, and the guardrail decides what is shown.

The model is faked wherever the test is about the service around it (no torch needed): a writer that repeats the
template with one more sentence passes the guardrail, a writer that says the wrong verdict and uses a banned word fails it.
One `slow` test loads the real model when PyTorch and the weights are present.
"""
from __future__ import annotations

import json
import re
import threading
import time
from collections.abc import Callable, Iterator
from dataclasses import replace
from pathlib import Path
from typing import Any

import pytest
from explorer.explain import template_explanation
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.services import assistant_service
from app.services.assistant_service import AssistantService, Outcome, facts_key, prepared_entry
from app.services.reasons import reword, web_explanation

from .conftest import LARGEST, RUNNING_EXAMPLE, SHORT_HISTORY, VALID_OUTSIDE_SNAPSHOT, wait_until_ready

SETTINGS_FILE = Path(__file__).resolve().parents[1] / "config" / "settings.json"
BANNED_WORDS = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))["bannedWords"]
BANNED = re.compile("|".join(map(re.escape, BANNED_WORDS)), re.IGNORECASE)
LIMITATION = "Worth investigating, not proof of wrongdoing."
WHAT_IF = {"amountBtc": 0.05, "direction": "out", "time": "2026-10-20T12:00:00Z"}
TAG = "Every figure above is the one given."  # the fake writer's one extra sentence; it carries no number


class FakeModel:
    """Stands in for the writers: records its calls, and can wait for a test to let it go on.

    `answer` maps the facts' prompt to text; the test gives it the transaction it will ask about.
    """

    def __init__(self) -> None:
        self.loads = 0
        self.writes = 0
        self.texts: dict[str, str] = {}  # the user message of a prompt -> the reply
        self.hold_load = threading.Event()
        self.hold_write = threading.Event()
        self.hold_load.set()
        self.hold_write.set()
        self.in_load = threading.Event()
        self.in_write = threading.Event()

    def expect(self, tx: dict[str, Any], text: str | None = None) -> str:
        """Teach the writer what to answer for this transaction's prompt; by default the template and one more sentence."""
        reply = text if text is not None else f"{template_explanation(tx)}\n{TAG}"
        self.texts[assistant_service.guardrail.prompt_messages(tx)[1]["content"]] = reply
        return reply

    def load(self) -> tuple[list[tuple[str, Callable[[list[dict[str, str]]], str]]], dict[str, str]]:
        self.loads += 1
        self.in_load.set()
        assert self.hold_load.wait(10)
        return [("text150m", self.write)], {}

    def write(self, messages: list[dict[str, str]]) -> str:
        self.writes += 1
        self.in_write.set()
        assert self.hold_write.wait(10)
        return self.texts[messages[1]["content"]]


@pytest.fixture
def model() -> FakeModel:
    return FakeModel()


@pytest.fixture
def weights(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A weights file that exists, and PyTorch that seems installed: the Assistant is allowed to run (the writer is fake)."""
    path = tmp_path / "model.pt"
    path.write_bytes(b"x")
    monkeypatch.setattr(assistant_service, "libraries_installed", lambda: True)
    return path


@pytest.fixture
def explorer_client(make_client: Callable[..., TestClient], settings: Settings, weights: Path, tmp_path: Path, model: FakeModel
                    ) -> Iterator[TestClient]:
    """A service whose Assistant is the fake, with no prepared answers."""
    app_settings = replace(settings, assistant_weights=weights, assistant_answers=tmp_path / "none.json")
    client = make_client(app_settings=app_settings)
    client.app.state.runtime.assistant = AssistantService(app_settings, model.load)  # type: ignore[attr-defined]
    yield client


def runtime_of(client: TestClient) -> Any:
    return client.app.state.runtime  # type: ignore[attr-defined]


def flagged_ids(client: TestClient, address: str) -> list[str]:
    rows = client.get(f"/api/addresses/{address}/transactions", params={"status": "flagged", "pageSize": 200}).json()["transactions"]
    return [row["txid"] for row in rows]


def transaction(client: TestClient, address: str, txid: str) -> dict[str, Any]:
    return runtime_of(client).explorer.scored_transaction(address, txid)  # type: ignore[no-any-return]


def ask(client: TestClient, address: str = RUNNING_EXAMPLE, **body: Any) -> Any:
    return client.post("/api/explanations", json={"address": address, **body})


def what_if_transaction(client: TestClient, address: str = RUNNING_EXAMPLE) -> dict[str, Any]:
    from app.schemas.whatif import WhatIfRequest
    return runtime_of(client).whatif.scored_what_if(address, WhatIfRequest.model_validate(WHAT_IF))  # type: ignore[no-any-return]


# ---------------------------------------------------------------- 200: the Assistant writes, the guardrail passes it


def test_a_passing_answer_is_returned_with_its_source_and_the_shape_of_e12(explorer_client: TestClient, model: FakeModel) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    tx = transaction(explorer_client, RUNNING_EXAMPLE, txid)
    model.expect(tx)
    response = ask(explorer_client, txid=txid)
    body = response.json()
    assert response.status_code == 200 and set(body) == {"txid", "flagged", "explanation", "source", "cached", "attempts",
                                                         "skippedWriters", "limitation", "seconds"}
    assert body["txid"] == txid and body["flagged"] is True and body["source"] == "text150m" and body["cached"] is False
    assert body["attempts"] == [{"source": "text150m", "failedChecks": []}] and body["skippedWriters"] == {}
    assert body["limitation"] == LIMITATION and isinstance(body["seconds"], float)
    assert body["explanation"] == reword(f"{template_explanation(tx)}\n{TAG}", tx["direction"])  # the writer's words, in the screen's wording (Mod-12)
    assert LIMITATION in body["explanation"] and "no-store" not in response.headers.get("cache-control", "")


def test_the_same_facts_are_answered_from_the_cache(explorer_client: TestClient, model: FakeModel) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    model.expect(transaction(explorer_client, RUNNING_EXAMPLE, txid))
    first, second = ask(explorer_client, txid=txid).json(), ask(explorer_client, txid=txid).json()
    assert (first["cached"], second["cached"]) == (False, True)
    assert second["explanation"] == first["explanation"] and second["source"] == "text150m"
    assert (model.loads, model.writes) == (1, 1)


def test_a_what_if_transaction_is_explained_and_cached_like_any_other(explorer_client: TestClient, model: FakeModel) -> None:
    model.expect(what_if_transaction(explorer_client))
    first = ask(explorer_client, whatIf=WHAT_IF).json()
    assert first["txid"] == "what-if" and first["flagged"] is True and first["source"] == "text150m" and first["cached"] is False
    assert ask(explorer_client, whatIf={**WHAT_IF, "amountBtc": "0.05"}).json()["cached"] is True  # the same facts, spelled differently
    assert model.writes == 1


def test_the_cache_keeps_the_most_recently_used_answers(settings: Settings, weights: Path, tmp_path: Path, model: FakeModel,
                                                        explorer_client: TestClient) -> None:
    ids = flagged_ids(explorer_client, RUNNING_EXAMPLE)
    txs = [transaction(explorer_client, RUNNING_EXAMPLE, txid) for txid in ids]
    assert len({facts_key(tx) for tx in txs}) == len(txs) == 3
    service = AssistantService(replace(settings, assistant_weights=weights, assistant_answers=tmp_path / "none.json"), model.load, cache_size=2)
    for tx in txs:
        model.expect(tx)
    service.explain(txs[0])
    service.explain(txs[1])
    service.explain(txs[0])  # the first is used again, so the second is the oldest
    service.explain(txs[2])  # and leaves
    assert [service.explain(tx).cached for tx in (txs[0], txs[2], txs[1])] == [True, True, False]
    assert model.writes == 4


def test_equal_facts_have_equal_keys_and_different_facts_do_not(explorer_client: TestClient) -> None:
    a, b, _ = (transaction(explorer_client, RUNNING_EXAMPLE, txid) for txid in flagged_ids(explorer_client, RUNNING_EXAMPLE))
    assert facts_key(a) == facts_key({**a, "txid": "elsewhere", "time": "2020-01-01T00:00:00Z"}) and facts_key(a) != facts_key(b)
    assert re.fullmatch(r"[0-9a-f]{64}", facts_key(a))


# ---------------------------------------------------------------- the guardrail: a rejected answer is never returned


def test_a_rejected_answer_is_replaced_by_the_template_naming_the_failed_checks(explorer_client: TestClient, model: FakeModel) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    tx = transaction(explorer_client, RUNNING_EXAMPLE, txid)
    rejected = f"Not flagged: this is {BANNED_WORDS[-1]} activity of 12345 BTC."
    model.expect(tx, rejected)
    response = ask(explorer_client, txid=txid)
    body = response.json()
    assert response.status_code == 200 and body["source"] == "template" and body["explanation"] == web_explanation(tx)
    [attempt] = body["attempts"]
    assert attempt["source"] == "text150m"
    assert set(attempt["failedChecks"]) == {"numbers_ok", "limitation_ok", "wording_ok", "verdict_ok"}
    assert "12345" not in response.text and BANNED_WORDS[-1] not in response.text and "Not flagged" not in response.text
    again = ask(explorer_client, txid=txid).json()  # greedy decoding fails the same way, so the failure is remembered too
    assert again["source"] == "template" and again["cached"] is True and again["attempts"] == body["attempts"] and model.writes == 1


@pytest.mark.parametrize(("reply", "failed"), [
    ("{template}\nThe move was {banned}.", {"wording_ok"}),
    ("{template}\nIt is 777 times usual.", {"numbers_ok"}),
    ("", {"nonempty", "verdict_ok", "limitation_ok"}),
])
def test_each_check_can_reject(explorer_client: TestClient, model: FakeModel, reply: str, failed: set[str]) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    tx = transaction(explorer_client, RUNNING_EXAMPLE, txid)
    model.expect(tx, reply.format(template=template_explanation(tx), banned=BANNED_WORDS[0]))
    body = ask(explorer_client, txid=txid).json()
    assert body["source"] == "template" and set(body["attempts"][0]["failedChecks"]) == failed
    assert body["explanation"] == web_explanation(tx)


def test_a_prepared_answer_that_no_longer_passes_is_not_served(settings: Settings, weights: Path, tmp_path: Path, model: FakeModel,
                                                               explorer_client: TestClient) -> None:
    tx = transaction(explorer_client, RUNNING_EXAMPLE, flagged_ids(explorer_client, RUNNING_EXAMPLE)[0])
    tampered = Outcome("text150m", f"{template_explanation(tx)}\nA {BANNED_WORDS[1]} move.", ())
    path = tmp_path / "answers.json"
    path.write_text(json.dumps({"answers": {facts_key(tx): prepared_entry(RUNNING_EXAMPLE, tx["txid"], tampered)}}), encoding="utf-8")
    service = AssistantService(replace(settings, assistant_weights=weights, assistant_answers=path), model.load)
    model.expect(tx)
    response = service.explain(tx)
    assert response.cached is False and response.source == "text150m" and BANNED_WORDS[1] not in response.explanation
    assert model.writes == 1  # the tampered text was ignored and the model asked


# ---------------------------------------------------------------- prepared answers are served first


def prepared_file(path: Path, tx: dict[str, Any], outcome: Outcome) -> None:
    path.write_text(json.dumps({"answers": {facts_key(tx): prepared_entry(RUNNING_EXAMPLE, tx["txid"], outcome)}}), encoding="utf-8")


def test_a_prepared_answer_is_served_first_even_without_the_weights(make_client: Callable[..., TestClient], settings: Settings,
                                                                    tmp_path: Path, model: FakeModel,
                                                                    monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(assistant_service, "libraries_installed", lambda: False)
    base = make_client(app_settings=replace(settings, assistant_weights=tmp_path / "missing.pt", assistant_answers=tmp_path / "x.json"))
    txid = flagged_ids(base, RUNNING_EXAMPLE)[0]
    tx = transaction(base, RUNNING_EXAMPLE, txid)
    text = f"{template_explanation(tx)}\n{TAG}"
    answers = tmp_path / "answers.json"
    prepared_file(answers, tx, Outcome("text150m", text, (assistant_service.Attempt("text150m", ()),)))
    app_settings = replace(settings, assistant_weights=tmp_path / "missing.pt", assistant_answers=answers)
    client = make_client(app_settings=app_settings)
    assert client.get("/api/health").json()["assistant"] == "not_installed"
    body = ask(client, txid=txid).json()
    assert body["source"] == "text150m" and body["cached"] is True and body["explanation"] == reword(text, tx["direction"])
    assert body["attempts"] == [{"source": "text150m", "failedChecks": []}] and body["skippedWriters"] == {}
    other = flagged_ids(client, RUNNING_EXAMPLE)[1]  # no prepared answer for it, and no model: the template, with the reason
    fallback = ask(client, txid=other).json()
    assert fallback["source"] == "template" and list(fallback["skippedWriters"]) == ["text150m"]
    assert model.loads == 0


def test_a_prepared_failure_is_served_as_the_template_with_the_checks_named(settings: Settings, weights: Path, tmp_path: Path,
                                                                            model: FakeModel, explorer_client: TestClient) -> None:
    tx = transaction(explorer_client, RUNNING_EXAMPLE, flagged_ids(explorer_client, RUNNING_EXAMPLE)[0])
    path = tmp_path / "answers.json"
    prepared_file(path, tx, Outcome("template", None, (assistant_service.Attempt("text150m", ("direction_ok",)),)))
    response = AssistantService(replace(settings, assistant_weights=weights, assistant_answers=path), model.load).explain(tx)
    assert (response.source, response.cached, model.loads) == ("template", True, 0)
    assert [(a.source, a.failed_checks) for a in response.attempts] == [("text150m", ["direction_ok"])]
    assert response.explanation == web_explanation(tx)


def test_an_unreadable_prepared_file_is_ignored(settings: Settings, weights: Path, tmp_path: Path, model: FakeModel, caplog: pytest.LogCaptureFixture) -> None:
    path = tmp_path / "answers.json"
    path.write_text("{not json", encoding="utf-8")
    service = AssistantService(replace(settings, assistant_weights=weights, assistant_answers=path), model.load)
    assert service.prepared_count == 0 and "cannot be read" in caplog.text
    absent = AssistantService(replace(settings, assistant_weights=weights, assistant_answers=tmp_path / "absent.json"), model.load)
    assert absent.prepared_count == 0


# ---------------------------------------------------------------- off, and not installed: never a failure


def test_off_answers_with_the_template_and_says_why(make_client: Callable[..., TestClient], settings: Settings, weights: Path,
                                                    tmp_path: Path, model: FakeModel) -> None:
    probe = make_client()
    txid = flagged_ids(probe, RUNNING_EXAMPLE)[0]
    tx = transaction(probe, RUNNING_EXAMPLE, txid)
    answers = tmp_path / "answers.json"
    prepared_file(answers, tx, Outcome("text150m", f"{template_explanation(tx)}\n{TAG}", ()))  # prepared, but the Assistant is off
    client = make_client(app_settings=replace(settings, assistant_mode="off", assistant_weights=weights, assistant_answers=answers))
    client.app.state.runtime.assistant = AssistantService(client.app.state.runtime.settings, model.load)  # type: ignore[attr-defined]
    body = ask(client, txid=txid).json()
    assert body["source"] == "template" and body["attempts"] == [] and body["explanation"] == web_explanation(tx)
    assert body["skippedWriters"] == {"text150m": assistant_service.OFF} and body["cached"] is False
    assert client.get("/api/health").json()["assistant"] == "off" and model.loads == 0


@pytest.mark.parametrize("missing", ["weights", "libraries"])
def test_not_installed_answers_with_the_template_and_says_why(make_client: Callable[..., TestClient], settings: Settings, weights: Path,
                                                              tmp_path: Path, model: FakeModel, monkeypatch: pytest.MonkeyPatch,
                                                              missing: str) -> None:
    if missing == "libraries":
        monkeypatch.setattr(assistant_service, "libraries_installed", lambda: False)
    file = weights if missing == "libraries" else tmp_path / "missing.pt"
    client = make_client(app_settings=replace(settings, assistant_weights=file, assistant_answers=tmp_path / "none.json"))
    client.app.state.runtime.assistant = AssistantService(client.app.state.runtime.settings, model.load)  # type: ignore[attr-defined]
    txid = flagged_ids(client, RUNNING_EXAMPLE)[0]
    response = ask(client, txid=txid)
    body = response.json()
    reason = assistant_service.LIBRARIES_MISSING if missing == "libraries" else assistant_service.WEIGHTS_MISSING
    assert response.status_code == 200 and body["source"] == "template" and body["skippedWriters"] == {"text150m": reason}
    assert body["attempts"] == [] and LIMITATION in body["explanation"]
    assert client.get("/api/health").json()["assistant"] == "not_installed" and model.loads == 0


def test_a_model_that_cannot_be_loaded_gives_the_template_and_is_not_tried_again(explorer_client: TestClient, settings: Settings,
                                                                                weights: Path, tmp_path: Path,
                                                                                caplog: pytest.LogCaptureFixture) -> None:
    calls = []

    def broken() -> Any:
        calls.append(1)
        raise RuntimeError("corrupt checkpoint at /secret/place/model.pt")

    runtime_of(explorer_client).assistant = AssistantService(
        replace(settings, assistant_weights=weights, assistant_answers=tmp_path / "none.json"), broken)
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    first, second = ask(explorer_client, txid=txid), ask(explorer_client, txid=txid)
    assert first.status_code == second.status_code == 200 and first.json()["source"] == "template"
    assert first.json()["skippedWriters"] == {"text150m": assistant_service.LOAD_FAILED} == second.json()["skippedWriters"]
    assert "/secret/place" not in first.text and "corrupt checkpoint" in caplog.text and calls == [1]
    assert explorer_client.get("/api/health").json()["assistant"] == "not_installed"


# ---------------------------------------------------------------- 429: one answer at a time


def in_thread(call: Callable[[], Any]) -> tuple[threading.Thread, list[Any]]:
    result: list[Any] = []
    thread = threading.Thread(target=lambda: result.append(call()))
    thread.start()
    return thread, result


@pytest.mark.parametrize("where", ["load", "write"])
def test_a_second_answer_waits_through_a_429_while_one_is_being_written(explorer_client: TestClient, model: FakeModel, where: str) -> None:
    first_id, second_id, third_id = flagged_ids(explorer_client, RUNNING_EXAMPLE)
    txs = {txid: transaction(explorer_client, RUNNING_EXAMPLE, txid) for txid in (first_id, second_id, third_id)}
    for tx in txs.values():
        model.expect(tx)
    if where == "write":
        ask(explorer_client, txid=third_id)  # answered and cached, and the model loaded, before the busy time
    held = model.hold_load if where == "load" else model.hold_write
    arrived = model.in_load if where == "load" else model.in_write
    arrived.clear()
    held.clear()
    thread, result = in_thread(lambda: ask(explorer_client, txid=first_id))
    assert arrived.wait(10)
    status = explorer_client.get("/api/health").json()["assistant"]
    assert status == ("loading" if where == "load" else "ready")
    assert explorer_client.get("/api/config").json()["capabilities"]["assistant"] is True

    busy = ask(explorer_client, txid=second_id)
    assert busy.status_code == 429 and busy.json()["status"] == "rate_limited"
    assert re.fullmatch(r"[1-9]\d*", busy.headers["Retry-After"]) and busy.json()["requestId"] == busy.headers["X-Request-ID"]
    assert busy.json()["message"] == "The Assistant is writing another answer." and BANNED.search(busy.text) is None
    if where == "write":
        assert ask(explorer_client, txid=third_id).json()["cached"] is True  # memory is never kept waiting

    held.set()
    thread.join(10)
    assert result[0].status_code == 200 and result[0].json()["source"] == "text150m"
    retried = ask(explorer_client, txid=second_id)
    assert retried.status_code == 200 and retried.json()["source"] == "text150m"
    assert explorer_client.get("/api/health").json()["assistant"] == "ready"


def test_the_retry_after_follows_the_time_the_last_answer_took(settings: Settings, weights: Path, tmp_path: Path, model: FakeModel) -> None:
    service = AssistantService(replace(settings, assistant_weights=weights, assistant_answers=tmp_path / "none.json"), model.load)
    assert service._wait_estimate() == assistant_service.DEFAULT_ANSWER_SECONDS
    service._last_seconds = 3.2
    assert service._wait_estimate() == 4
    service._busy_since = time.monotonic() - 100
    assert service._wait_estimate() == 1


# ---------------------------------------------------------------- 400, 404, 422, 413, 415


def error_of(response: Any, status: int) -> dict[str, Any]:
    assert response.status_code == status, response.text
    body: dict[str, Any] = response.json()
    assert BANNED.search(response.text) is None
    return body


def test_a_body_needs_exactly_one_of_txid_and_what_if(explorer_client: TestClient) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    for body in ({}, {"txid": txid, "whatIf": WHAT_IF}):
        error = error_of(ask(explorer_client, **body), 400)
        assert error["status"] == "invalid" and error["fields"] == [{"name": "body", "message": "Give either txid or whatIf, and not both."}]


def test_a_malformed_value_is_a_400_naming_the_field(explorer_client: TestClient) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    error = error_of(ask(explorer_client, address="1Bbcsfxj2JRUD5crcdZVHBcViT61vrJ3dy", txid=txid), 400)
    assert error["fields"][0]["name"] == "address"
    error = error_of(ask(explorer_client, txid="abc"), 400)
    assert error["fields"][0]["name"] == "txid"
    error = error_of(ask(explorer_client, txid=txid, extra=1), 400)
    assert error["fields"] == [{"name": "extra", "message": "Not a known field."}]
    assert error_of(explorer_client.post("/api/explanations", json={"txid": txid}), 400)["fields"] == [
        {"name": "address", "message": "This field is required."}]
    error = error_of(ask(explorer_client, whatIf={"amountBtc": "lots", "direction": "sideways", "time": "tomorrow"}), 400)
    assert [f["name"] for f in error["fields"]] == ["whatIf.amountBtc", "whatIf.direction", "whatIf.time"]


def test_a_what_if_value_out_of_range_is_named_as_the_body_writes_it(explorer_client: TestClient) -> None:
    error = error_of(ask(explorer_client, whatIf={**WHAT_IF, "amountBtc": 99999999999}), 400)
    assert [f["name"] for f in error["fields"]] == ["whatIf.amountBtc"]
    error = error_of(ask(explorer_client, whatIf={**WHAT_IF, "time": "2040-01-01T00:00:00Z"}), 400)
    assert [f["name"] for f in error["fields"]] == ["whatIf.time"]


def test_an_unknown_address_or_transaction_is_a_404(explorer_client: TestClient) -> None:
    txid = flagged_ids(explorer_client, RUNNING_EXAMPLE)[0]
    for body in ({"txid": txid}, {"whatIf": WHAT_IF}):
        error = error_of(ask(explorer_client, address=VALID_OUTSIDE_SNAPSHOT, **body), 404)
        assert error["status"] == "unsupported" and len(error["examples"]) == 3
    error = error_of(ask(explorer_client, txid="0" * 64), 404)
    assert error["status"] == "not_found"
    other = flagged_ids(explorer_client, LARGEST)[0]  # a real transaction, but not this address's
    assert error_of(ask(explorer_client, txid=other), 404)["status"] == "not_found"


def test_a_transaction_that_could_not_be_scored_is_a_422_as_in_e7(explorer_client: TestClient) -> None:
    address = SHORT_HISTORY[0]
    rows = explorer_client.get(f"/api/addresses/{address}/transactions").json()["transactions"]
    error = error_of(ask(explorer_client, address=address, txid=rows[0]["txid"]), 422)
    assert error["status"] == "insufficient_history" and error["history"]["required"] == {"minTx": 10, "minSpanDays": 14}
    early = error_of(ask(explorer_client, whatIf={**WHAT_IF, "time": "2024-05-20T12:00:00Z"}), 422)
    assert early["status"] == "insufficient_history" and early["firstScoredDate"] == "2024-07-11"


def test_a_body_that_is_too_large_or_not_json_is_refused_as_on_every_post(explorer_client: TestClient, settings: Settings) -> None:
    too_large = explorer_client.post("/api/explanations", content=b" " * (settings.web.limits.max_body_bytes + 1),
                                     headers={"content-type": "application/json"})
    assert error_of(too_large, 413)["status"] == "too_large"
    assert error_of(explorer_client.post("/api/explanations", content=b"address=x"), 415)["status"] == "invalid"


def test_e12_waits_for_the_models_like_every_other_endpoint(make_client: Callable[..., TestClient], predictor: Any) -> None:
    release = threading.Event()

    def slow() -> Any:
        assert release.wait(10)
        return predictor

    client = make_client(loader=slow)
    try:
        error = error_of(client.post("/api/explanations", json={"address": RUNNING_EXAMPLE, "txid": "0" * 64}), 503)
        assert error["status"] == "unavailable"
    finally:
        release.set()
        wait_until_ready(client)


# ---------------------------------------------------------------- the wording rule over E12's bodies


def scan_bodies(client: TestClient, addresses: list[str], per_address: int | None) -> tuple[int, list[tuple[str, str]]]:
    """POST every flagged transaction (the first `per_address`) and return how many bodies were read and any banned word found."""
    found, count = [], 0
    for address in addresses:
        for txid in flagged_ids(client, address)[:per_address]:
            response = ask(client, address, txid=txid)
            assert response.status_code == 200
            body = response.json()
            assert LIMITATION in body["explanation"] and body["limitation"] == LIMITATION
            count += 1
            if match := BANNED.search(response.text):
                found.append((txid, match.group(0)))
    return count, found


def fake_for_every_transaction(client: TestClient, model: FakeModel, addresses: list[str]) -> None:
    for address in addresses:
        for txid in flagged_ids(client, address):
            model.expect(transaction(client, address, txid))


def test_no_e12_body_has_a_banned_word_and_every_flag_carries_the_limitation_line(explorer_client: TestClient, model: FakeModel) -> None:
    addresses = [RUNNING_EXAMPLE, LARGEST]
    fake_for_every_transaction(explorer_client, model, addresses)
    count, found = scan_bodies(explorer_client, addresses, per_address=12)
    assert count == 15 and found == []
    text = ask(explorer_client, whatIf=WHAT_IF).text
    assert BANNED.search(text) is None  # not written by the fake: the template, with the reason
    for body in ({"txid": "0" * 64}, {}, {"txid": "x"}):
        assert BANNED.search(ask(explorer_client, **body).text) is None


@pytest.mark.slow
def test_no_e12_body_over_all_flagged_transactions_has_a_banned_word(explorer_client: TestClient, model: FakeModel, addresses: list[str]) -> None:
    fake_for_every_transaction(explorer_client, model, addresses)
    count, found = scan_bodies(explorer_client, addresses, per_address=None)
    assert count == 681 and found == []


# ---------------------------------------------------------------- the real model


@pytest.mark.slow
def test_the_real_model_writes_a_guarded_answer_once_and_the_same_again(make_client: Callable[..., TestClient], settings: Settings,
                                                                       tmp_path: Path) -> None:
    pytest.importorskip("torch")
    if not settings.assistant_weights.is_file():
        pytest.skip("the Assistant's weights are not installed")
    client = make_client(app_settings=replace(settings, assistant_answers=tmp_path / "none.json"))
    assert client.get("/api/health").json()["assistant"] == "ready"
    txid = flagged_ids(client, RUNNING_EXAMPLE)[0]
    first = ask(client, txid=txid)
    assert first.status_code == 200 and BANNED.search(first.text) is None
    body = first.json()
    assert body["source"] in ("text150m", "template") and body["cached"] is False and LIMITATION in body["explanation"]
    assert body["skippedWriters"] == {} and body["seconds"] > 0
    second = ask(client, txid=txid).json()
    assert second["cached"] is True and second["explanation"] == body["explanation"]
    assert client.get("/api/health").json()["assistant"] == "ready"
