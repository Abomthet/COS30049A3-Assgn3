"""T03: the copied Assignment 2 files are exactly what A2_VENDOR.json says (plan section 12.3, integrity)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((BACKEND / "A2_VENDOR.json").read_text(encoding="utf-8"))


def test_every_copied_file_matches_its_hash() -> None:
    changed = [path for path, expected in MANIFEST["files"].items()
               if hashlib.sha256((BACKEND / path).read_bytes()).hexdigest() != expected]
    assert changed == []


def test_no_python_file_was_added_to_the_copied_packages() -> None:
    copied = set(MANIFEST["files"])
    extra = [p.relative_to(BACKEND).as_posix() for folder in ("explorer", "lm") for p in (BACKEND / folder).glob("*.py")
             if p.relative_to(BACKEND).as_posix() not in copied]
    assert extra == []


def test_settings_json_differs_from_assignment_2_only_by_the_web_block() -> None:
    settings = json.loads((BACKEND / "config" / "settings.json").read_text(encoding="utf-8"))
    others = {key: value for key, value in settings.items() if key not in MANIFEST["derived"]["config/settings.json"]["addedKeys"]}
    canonical = json.dumps(others, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    assert hashlib.sha256(canonical).hexdigest() == MANIFEST["derived"]["config/settings.json"]["otherKeysSha256"]


def test_the_assistant_weights_are_checked_when_present() -> None:
    for path, expected in MANIFEST.get("assistant", {}).items():
        target = BACKEND / path
        if target.is_file():  # git-ignored and 610 MB: hashed only where someone copied it in
            digest = hashlib.sha256()
            with target.open("rb") as handle:
                for chunk in iter(lambda: handle.read(1 << 20), b""):
                    digest.update(chunk)
            assert digest.hexdigest() == expected
