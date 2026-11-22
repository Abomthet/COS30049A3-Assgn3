"""W120 to W130: what the screens show from the server carries no setup text (no environment variable, no file or library
name, no pointer to the README, no "this service"). The messages come from the web layer's modules; the endpoint tests
assert their exact words, and this file asserts what none of them may contain."""
from __future__ import annotations

import re

import pytest

from app.core import validation
from app.services import assistant_service

SETUP_TEXT = re.compile(r"EXPLORER_|README|requirements|this service|explorer service|\.pt\b|\.joblib|PyTorch|tokenizers|610 MB", re.I)

MESSAGES = {
    "assistant OFF": assistant_service.OFF,
    "assistant NOT_INSTALLED": assistant_service.NOT_INSTALLED,
    "assistant WEIGHTS_MISSING": assistant_service.WEIGHTS_MISSING,
    "assistant LIBRARIES_MISSING": assistant_service.LIBRARIES_MISSING,
    "assistant LOAD_FAILED": assistant_service.LOAD_FAILED,
    "address NOT_BITCOIN": validation.NOT_BITCOIN,
    "address TESTNET": validation.TESTNET,
    "address TYPO": validation.TYPO,
    "address BAD_BC1": validation.BAD_BC1,
}


@pytest.mark.parametrize("name", sorted(MESSAGES))
def test_no_message_names_a_variable_a_file_or_this_service(name: str) -> None:
    assert SETUP_TEXT.search(MESSAGES[name]) is None, MESSAGES[name]


def test_the_three_not_installed_causes_share_one_line() -> None:
    assert {assistant_service.WEIGHTS_MISSING, assistant_service.LIBRARIES_MISSING, assistant_service.LOAD_FAILED} == {
        "The Assistant isn't installed on this computer."}


def test_no_address_verdict_repeats_a_format_hint() -> None:
    for text in ("", "a b", "0x" + "a" * 40, "tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "hello", "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNx",
                 "1" * 12 + "A" * 20, "BC1Q7evspfauqve6ll84juuj0anlzrxxpdeq7raqn3x", "bc1q7evspfauqve6ll84juuj0anlzrxxpdeq7raqn3x"):
        check = validation.validate_address(text)
        assert not check.ok and check.hint == "" and "start with 1, 3 or bc1" not in check.message, text


def test_the_placeholders_are_filled_from_the_same_values_as_before() -> None:
    assert validation.validate_address("1" * 12).message == "12 characters; this kind has 26 to 35."
    assert validation.validate_address("1" * 33 + "0").message == '"0" isn\'t allowed. Remove it.'
    assert validation.validate_address("bc1q").message == "4 characters; bc1 addresses have 42 or 62."
