"""S-12: tools/measure.py labels a run "uncommitted changes" only when the working tree really differs from HEAD."""
from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path
from types import ModuleType

import pytest

TOOL = Path(__file__).resolve().parents[2] / "tools" / "measure.py"


def load_measure() -> ModuleType:
    spec = importlib.util.spec_from_file_location("measure_tool", TOOL)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module  # its dataclasses look their module up while being defined
    spec.loader.exec_module(module)
    return module


def git(cwd: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True)


def test_a_clean_tree_is_not_labelled_dirty_and_a_changed_one_is(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    measure = load_measure()
    git(tmp_path, "init", "-q")
    (tmp_path / "file.txt").write_text("one\n", "utf-8")
    git(tmp_path, "add", "file.txt")
    git(tmp_path, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-m", "first")
    monkeypatch.setattr(measure, "ROOT", tmp_path)

    assert measure.working_tree_dirty() is False  # a clean tree prints nothing; this used to read as dirty

    (tmp_path / "file.txt").write_text("two\n", "utf-8")
    assert measure.working_tree_dirty() is True


def test_outside_a_repository_it_is_not_labelled_dirty(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    measure = load_measure()
    monkeypatch.setattr(measure, "ROOT", tmp_path)
    monkeypatch.setenv("GIT_CEILING_DIRECTORIES", str(tmp_path.parent))
    assert measure.working_tree_dirty() is False
