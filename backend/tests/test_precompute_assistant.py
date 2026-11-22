"""S-05: tools/precompute_assistant.py writes a file that the service reads back and serves first."""
from __future__ import annotations

import importlib.util
import json
from dataclasses import replace
from pathlib import Path
from types import ModuleType

import pytest
from explorer import assistant
from explorer.explain import template_explanation
from explorer.predict import Predictor

from app.core.config import Settings
from app.services import assistant_service
from app.services.assistant_service import AssistantService, facts_key, load_prepared, prepared_entry, write_guarded
from app.services.reasons import reword, web_explanation

from .conftest import RUNNING_EXAMPLE

TOOL = Path(__file__).resolve().parents[2] / "tools" / "precompute_assistant.py"


@pytest.fixture(scope="module")
def tool() -> ModuleType:
    spec = importlib.util.spec_from_file_location("precompute_assistant", TOOL)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_baseline_has_681_flagged_transactions_and_the_running_example_three(tool: ModuleType, predictor: Predictor) -> None:
    flagged = tool.flagged_transactions(predictor)
    assert len(flagged) == 681 and all(tx["flagged"] and tx["scored"] for _, tx in flagged)
    assert [tx["txid"] for address, tx in flagged if address == RUNNING_EXAMPLE] == [
        tx["txid"] for tx in predictor.score_address(RUNNING_EXAMPLE)["transactions"] if tx.get("flagged")]
    assert len(tool.flagged_transactions(predictor, [RUNNING_EXAMPLE])) == 3


def test_the_written_file_is_read_back_and_served_without_a_model(tool: ModuleType, predictor: Predictor, settings: Settings,
                                                                 tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    flagged = tool.flagged_transactions(predictor, [RUNNING_EXAMPLE])
    replies = {assistant.prompt_messages(tx)[1]["content"]: f"{template_explanation(tx)}\nEvery figure above is the one given."
               for _, tx in flagged}
    replies[assistant.prompt_messages(flagged[2][1])[1]["content"]] = "Not flagged."  # one the guardrail rejects
    writers = [("text150m", lambda messages: replies[messages[1]["content"]])]
    answers = {facts_key(tx): prepared_entry(address, tx["txid"], write_guarded(tx, writers)) for address, tx in flagged}
    path = tmp_path / "answers.json"
    tool.save(path, answers, predictor, len(flagged), "abc")
    document = json.loads(path.read_text(encoding="utf-8"))
    assert document["method"] == "baseline" and document["snapshotDate"] == "2026-10-22" and document["flaggedTransactions"] == 3
    assert (document["writtenByAssistant"], document["templateInstead"]) == (2, 1) and document["model"]["sha256"] == "abc"
    assert tool.load_existing(path) == load_prepared(path) == answers and not path.with_name("answers.json.tmp").exists()
    assert "Not flagged." not in path.read_text(encoding="utf-8")  # a rejected answer is not kept, only the checks it failed

    monkeypatch.setattr(assistant_service, "libraries_installed", lambda: False)
    service = AssistantService(replace(settings, assistant_weights=tmp_path / "missing.pt", assistant_answers=path))
    served = [service.explain(tx) for _, tx in flagged]
    assert [r.source for r in served] == ["text150m", "text150m", "template"] and all(r.cached for r in served)
    assert served[0].explanation == reword(replies[assistant.prompt_messages(flagged[0][1])[1]["content"]], flagged[0][1]["direction"])
    assert served[2].attempts[0].failed_checks and served[2].explanation == web_explanation(flagged[2][1])
