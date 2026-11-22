"""Mod-19: the limitation line the web application shows is "Worth investigating, not proof of wrongdoing.", read from
shared/wording.json; Assignment 2's line leaves the service nowhere, and A2's guardrail still checks A2's line first."""
from __future__ import annotations

import csv
import io
import json
from pathlib import Path

import pytest
from explorer import assistant as a2_assistant
from fastapi.testclient import TestClient

from app.core import config
from app.core.config import A2_LIMITATION_LINE, ConfigError, Settings, limitation_line
from app.services.reasons import reword, reword_limitation

from .conftest import LARGEST, RUNNING_EXAMPLE

NEW = "Worth investigating, not proof of wrongdoing."
OLD = "Unusual activity requires investigation; it does not indicate wrongdoing."
WHAT_IF = {"amountBtc": 0.05, "direction": "out", "time": "2026-10-20T12:00:00Z"}
SHARED = Path(__file__).resolve().parents[2] / "shared" / "wording.json"


def flagged_txids(client: TestClient, address: str) -> list[str]:
    rows = client.get(f"/api/addresses/{address}/transactions", params={"status": "flagged", "pageSize": 200}).json()["transactions"]
    return [row["txid"] for row in rows]


def test_the_line_comes_from_the_shared_file_and_a2s_line_is_kept_under_its_own_name(settings: Settings) -> None:
    assert json.loads(SHARED.read_text(encoding="utf-8")) == {"limitationLine": NEW}
    assert limitation_line() == NEW == settings.limitation_line
    assert A2_LIMITATION_LINE == OLD  # read from settings.json; the rewrite and A2's guardrail need it


def test_a_missing_or_unworded_shared_file_stops_the_start_with_one_sentence(tmp_path: Path) -> None:
    with pytest.raises(ConfigError, match="cannot be read"):
        limitation_line.__wrapped__(tmp_path / "none.json")  # type: ignore[attr-defined]
    bad = tmp_path / "wording.json"
    bad.write_text('{"limitationLine": "This is suspicious activity."}', encoding="utf-8")
    with pytest.raises(ValueError):  # A2's check_wording refuses a banned word
        limitation_line.__wrapped__(bad)  # type: ignore[attr-defined]
    bad.write_text('{"limitationLine": " "}', encoding="utf-8")
    with pytest.raises(ConfigError, match="must be a sentence"):
        limitation_line.__wrapped__(bad)  # type: ignore[attr-defined]
    assert config.WORDING_PATH == SHARED


def test_reword_replaces_a2s_line_and_leaves_other_text_alone() -> None:
    assert reword_limitation(f"Flagged by X.\n{OLD}") == f"Flagged by X.\n{NEW}"
    assert reword(f"Flagged by X.\n{OLD}", "in") == f"Flagged by X.\n{NEW}"
    assert reword_limitation("Not flagged by X.") == "Not flagged by X."


def test_e2_sends_the_new_line(shared_client: TestClient) -> None:
    body = shared_client.get("/api/config").json()
    assert body["limitationLine"] == NEW and OLD not in json.dumps(body)


def test_e7_of_every_flagged_transaction_of_the_running_example_has_the_new_line_only(shared_client: TestClient) -> None:
    ids = flagged_txids(shared_client, RUNNING_EXAMPLE)
    assert ids
    for txid in ids:
        text = shared_client.get(f"/api/transactions/{txid}", params={"address": RUNNING_EXAMPLE}).text
        detail = json.loads(text)
        assert OLD not in text
        assert detail["limitation"] == NEW and detail["explanation"].endswith(NEW) and detail["explanation"].count(NEW) == 1


def test_e7_of_an_unflagged_transaction_has_the_limitation_field_but_not_the_line_in_its_explanation(shared_client: TestClient) -> None:
    rows = shared_client.get(f"/api/addresses/{RUNNING_EXAMPLE}/transactions", params={"status": "not-flagged", "pageSize": 5}).json()["transactions"]
    scored = [r for r in rows if r["status"] == "not-flagged"]
    assert scored
    detail = shared_client.get(f"/api/transactions/{scored[0]['txid']}", params={"address": RUNNING_EXAMPLE}).json()
    assert detail["flagged"] is False and detail["limitation"] == NEW and NEW not in detail["explanation"]


def test_e8_the_what_if_has_the_new_line_only(shared_client: TestClient) -> None:
    response = shared_client.post(f"/api/addresses/{RUNNING_EXAMPLE}/what-if", json=WHAT_IF)
    body = response.json()
    assert response.status_code == 200 and body["flagged"] is True and OLD not in response.text
    assert body["limitation"] == NEW and body["explanation"].endswith(NEW)


def test_the_address_timeline_and_transaction_list_hold_no_old_line(shared_client: TestClient) -> None:
    for path in (f"/api/addresses/{LARGEST}", f"/api/addresses/{LARGEST}/transactions?pageSize=200", "/api/methods"):
        assert OLD not in shared_client.get(path).text


def test_e10_csv_has_the_new_line_in_every_row_and_json_in_its_header_and_flagged_rows(shared_client: TestClient) -> None:
    for address in (RUNNING_EXAMPLE, LARGEST):
        text = shared_client.get(f"/api/addresses/{address}/export", params={"format": "csv"}).text
        rows = list(csv.DictReader(io.StringIO(text)))
        assert rows and {r["limitation"] for r in rows} == {NEW} and OLD not in text
        raw = shared_client.get(f"/api/addresses/{address}/export", params={"format": "json"}).text
        body = json.loads(raw)
        assert OLD not in raw and body["limitation"] == NEW
        assert all(t["limitation"] == NEW for t in body["transactions"] if t["flagged"])


def test_e12_a_prepared_answer_passes_a2s_guardrail_on_a2s_line_and_is_served_with_the_new_one(shared_client: TestClient) -> None:
    """The prepared answers carry A2's line; the guardrail judges them as they are, and the rewrite follows."""
    prepared = json.loads((Path(__file__).resolve().parents[1] / "data" / "assistant_answers.json").read_text(encoding="utf-8"))["answers"]
    assert any(OLD in entry["text"] for entry in prepared.values() if entry.get("text"))
    assert a2_assistant.has_limitation(f"Text. {OLD}") and not a2_assistant.has_limitation(f"Text. {NEW}")
    served = 0
    for txid in flagged_txids(shared_client, RUNNING_EXAMPLE):
        response = shared_client.post("/api/explanations", json={"address": RUNNING_EXAMPLE, "txid": txid})
        body = response.json()
        assert response.status_code == 200 and OLD not in response.text
        assert body["limitation"] == NEW and NEW in body["explanation"]
        if body["source"] != "template":  # a prepared answer that passed the guardrail
            assert body["cached"] is True and body["attempts"] and body["explanation"].count(NEW) == 1
            served += 1
    assert served > 0
