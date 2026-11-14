"""T09: the address and transaction-ID checkers against the shared vectors (also read by Vitest later)."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.core.errors import InvalidRequest
from app.core.validation import require_address, require_txid, validate_address, validate_txid

VECTORS = json.loads((Path(__file__).resolve().parents[2] / "shared" / "address_vectors.json").read_text(encoding="utf-8"))
ADDRESSES = VECTORS["addresses"]
TXIDS = VECTORS["transactionIds"]


@pytest.mark.parametrize("vector", ADDRESSES, ids=[v["id"] for v in ADDRESSES])
def test_address_vector(vector: dict) -> None:
    check = validate_address(vector["input"], vector.get("maxChars"))
    assert check.ok is vector["ok"]
    if vector["ok"]:
        assert (check.address, check.kind) == (vector["address"], vector["kind"])
    else:
        assert (check.reason, check.message, check.hint, check.field_message) == (
            vector["reason"], vector["message"], vector["hint"], vector["fieldMessage"])


@pytest.mark.parametrize("vector", TXIDS, ids=[v["id"] for v in TXIDS])
def test_txid_vector(vector: dict) -> None:
    check = validate_txid(vector["input"])
    assert check.ok is vector["ok"]
    if vector["ok"]:
        assert check.txid == vector["txid"]
    else:
        assert (check.reason, check.message, check.hint, check.field_message) == (
            vector["reason"], vector["message"], vector["hint"], vector["fieldMessage"])


def test_the_vectors_cover_every_kind_and_every_failure_reason() -> None:
    kinds = {v["kind"] for v in ADDRESSES if v["ok"]}
    reasons = {v["reason"] for v in ADDRESSES if not v["ok"]}
    assert kinds == {"p2pkh", "p2sh", "p2wpkh", "p2wsh", "p2tr", "segwit"}
    assert reasons == {"empty", "too_long", "spaces", "ethereum", "testnet", "not_bitcoin", "legacy_length", "legacy_character",
                       "checksum", "segwit_case", "segwit_length", "segwit_character", "segwit_invalid", "segwit_v0_length"}


def test_every_single_character_typo_in_a_segwit_address_is_caught() -> None:
    good = "bc1q7evspfauqve6ll84juuj0anlzrxxpdeq7raqn3"
    charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
    for position in range(4, len(good)):
        for char in charset:
            if char != good[position]:
                typo = good[:position] + char + good[position + 1:]
                assert not validate_address(typo).ok, typo


def test_require_address_returns_the_normalised_address() -> None:
    assert require_address("  BC1Q7EVSPFAUQVE6LL84JUUJ0ANLZRXXPDEQ7RAQN3 ") == "bc1q7evspfauqve6ll84juuj0anlzrxxpdeq7raqn3"


def test_require_address_raises_a_400_that_names_the_field() -> None:
    with pytest.raises(InvalidRequest) as caught:
        require_address("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNx", field="address")
    error = caught.value
    assert error.status_code == 400 and error.message.endswith("probably contains a typo.")
    assert [(f.name, f.message) for f in error.fields] == [("address", "Checksum does not match.")]


def test_require_txid_normalises_and_rejects() -> None:
    assert require_txid("AB" * 32) == "ab" * 32
    with pytest.raises(InvalidRequest) as caught:
        require_txid("abc")
    assert caught.value.fields[0].name == "txid"
