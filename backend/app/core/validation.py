"""Bitcoin address and transaction-ID checks (T09, M-09; plan section 11.2).

The server checks again what the browser already checked, because a request need not come from our
browser. The address checker is a port of the prototype's frontend/src/lib/address.ts, with the same
verdicts and the same messages, so a typo is reported as "invalid" (400) instead of coming back as
"unsupported" (404). Both tiers read shared/address_vectors.json and must agree on every entry.

Checks: Base58Check for legacy addresses (1... and 3...), Bech32 for SegWit version 0 and Bech32m for
later versions (bc1...). Ethereum and test-network addresses get their own message; any other chain
falls through to "not a Bitcoin address". References: BIP 173 (Bech32), BIP 350 (Bech32m).
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

from ..schemas.common import AddressKind
from ..schemas.errors import FieldError
from .errors import InvalidRequest

FORMAT_HINT = ("Bitcoin addresses start with 1, 3 or bc1. Check for a missing or extra character, "
               "or pick an address from the list.")
NETWORK_HINT = "The explorer only covers the main Bitcoin network, whose addresses start with 1, 3 or bc1."
TXID_HINT = "Copy the transaction ID from its link, or pick a transaction from the list."

BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32_GENERATOR = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
BECH32_CONST = 1
BECH32M_CONST = 0x2BC830A3
# Base58Check payload: one version byte, 20 bytes of hash, 4 bytes of checksum.
LEGACY_BYTES = 25
VERSION_P2PKH, VERSION_P2SH = 0x00, 0x05
VERSIONS_TESTNET = (0x6F, 0xC4)
LEGACY_LENGTH = (26, 35)
SEGWIT_LENGTH = (14, 90)
SEGWIT_MAX_VERSION = 16
SEGWIT_PROGRAM_LENGTH = (2, 40)
TXID_LENGTH = 64


@dataclass(frozen=True)
class AddressCheck:
    """The verdict on one typed address.

    `reason` is the stable key of a failure (the shared vectors use it); `message` and `hint` are what
    the user reads, and `field_message` is the short text for the form field.
    """

    ok: bool
    address: str | None = None
    kind: AddressKind | None = None
    reason: str | None = None
    message: str = ""
    hint: str = ""
    field_message: str = ""


def _ok(address: str, kind: AddressKind) -> AddressCheck:
    return AddressCheck(ok=True, address=address, kind=kind)


def _fail(reason: str, message: str, field_message: str, hint: str = FORMAT_HINT) -> AddressCheck:
    return AddressCheck(ok=False, reason=reason, message=message, hint=hint, field_message=field_message)


def _checksum_failure() -> AddressCheck:
    return _fail("checksum", "This address fails its checksum, so it probably contains a typo.", "Checksum does not match.")


def _testnet_failure() -> AddressCheck:
    return _fail("testnet", "This is a Bitcoin test-network address.", "Not a main-network address.", NETWORK_HINT)


def validate_address(raw: str, max_chars: int | None = None) -> AddressCheck:
    """Judge a typed address.

    Args:
        raw: The text as typed; surrounding spaces from a paste are ignored.
        max_chars: Longest address accepted (settings.json -> web.limits.maxAddressChars). The prototype
            has no such limit, so the shared vectors mark those entries as server-only.

    Returns:
        An `AddressCheck`. When `ok`, `address` is normalised (bc1 addresses in lower case) and `kind` is set.
    """
    value = raw.strip()
    if value == "":
        return _fail("empty", "Enter a Bitcoin address.", "Required.", "Paste an address, or pick one from the list below.")
    if max_chars is not None and len(value) > max_chars:
        return _fail("too_long", f"An address has at most {max_chars} characters; this one has {len(value)}.", "Too long.")
    if re.search(r"\s", value):
        return _fail("spaces", "Bitcoin addresses never contain spaces.", "Remove the spaces.")
    lower = value.lower()
    if re.fullmatch(r"0x[0-9a-f]{40}", lower):
        return _fail("ethereum", "This looks like an Ethereum address.", "Not a Bitcoin address.",
                     "The explorer only covers Bitcoin. Bitcoin addresses start with 1, 3 or bc1.")
    if lower.startswith(("tb1", "bcrt1")):
        return _testnet_failure()
    if lower.startswith("bc1"):
        return _check_segwit(value)
    if value[0] in "13mn2":
        return _check_legacy(value)
    return _fail("not_bitcoin", "This is not a Bitcoin address.", "Not a Bitcoin address.")


def require_address(raw: str, max_chars: int | None = None, field: str = "address") -> str:
    """The normalised address, or an `InvalidRequest` (400) that names `field`.

    Raises:
        InvalidRequest: The address fails `validate_address`; the body carries its message, hint and field message.
    """
    check = validate_address(raw, max_chars)
    if check.address is None:
        raise InvalidRequest(check.message, check.hint, [FieldError(name=field, message=check.field_message)])
    return check.address


# ---------------------------------------------------------------- Base58Check


def base58_decode(text: str) -> bytes | None:
    """The bytes a Base58 string stands for (each leading '1' is a zero byte), or None for a character outside the alphabet."""
    number = 0
    for char in text:
        digit = BASE58.find(char)
        if digit < 0:
            return None
        number = number * 58 + digit
    leading_zeros = len(text) - len(text.lstrip("1"))
    return bytes(leading_zeros) + number.to_bytes((number.bit_length() + 7) // 8, "big")


def _double_sha256(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()


def _check_legacy(value: str) -> AddressCheck:
    low, high = LEGACY_LENGTH
    if not low <= len(value) <= high:
        return _fail("legacy_length", f"This address has {len(value)} characters; legacy Bitcoin addresses have {low} to {high}.",
                     "Wrong length.")
    bad = next((char for char in value if char not in BASE58), None)
    if bad:
        why = " (0, O, I and l are never used, to avoid confusion)" if bad in "0OIl" else ""
        return _fail("legacy_character", f'The character "{bad}" can\'t appear in this kind of address{why}.',
                     "Contains a character that is not allowed.")
    decoded = base58_decode(value)
    # A wrong decoded length is also what a single mistyped character usually produces.
    if decoded is None or len(decoded) != LEGACY_BYTES:
        return _checksum_failure()
    body, checksum = decoded[:-4], decoded[-4:]
    if _double_sha256(body)[:4] != checksum:
        return _checksum_failure()
    version = body[0]
    if version == VERSION_P2PKH:
        return _ok(value, "p2pkh")
    if version == VERSION_P2SH:
        return _ok(value, "p2sh")
    if version in VERSIONS_TESTNET:
        return _testnet_failure()
    return _fail("not_bitcoin", "This is not a Bitcoin address.", "Not a Bitcoin address.")


# ---------------------------------------------------------------- Bech32 and Bech32m


def _polymod(values: list[int]) -> int:
    checksum = 1
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1FFFFFF) << 5) ^ value
        for i, generator in enumerate(BECH32_GENERATOR):
            if (top >> i) & 1:
                checksum ^= generator
    return checksum


def _hrp_expand(hrp: str) -> list[int]:
    codes = [ord(char) for char in hrp]
    return [c >> 5 for c in codes] + [0] + [c & 31 for c in codes]


def _convert_bits(data: list[int], from_bits: int, to_bits: int, pad: bool) -> list[int] | None:
    """Regroup bits (BIP 173's reference routine); None when the padding is not zero."""
    accumulator, bits, out = 0, 0, []
    max_value = (1 << to_bits) - 1
    max_accumulator = (1 << (from_bits + to_bits - 1)) - 1
    for value in data:
        accumulator = ((accumulator << from_bits) | value) & max_accumulator
        bits += from_bits
        while bits >= to_bits:
            bits -= to_bits
            out.append((accumulator >> bits) & max_value)
    if pad:
        if bits:
            out.append((accumulator << (to_bits - bits)) & max_value)
    elif bits >= from_bits or (accumulator << (to_bits - bits)) & max_value:
        return None
    return out


def _check_segwit(value: str) -> AddressCheck:
    if value != value.lower() and value != value.upper():
        return _fail("segwit_case", "This address mixes upper- and lower-case letters, which bc1 addresses never do.",
                     "Mixed upper- and lower-case letters.")
    address = value.lower()
    low, high = SEGWIT_LENGTH
    if not low <= len(address) <= high:
        return _fail("segwit_length", f"This address has {len(address)} characters; bc1 addresses have 42 or 62.", "Wrong length.")
    body = address[3:]
    bad = next((char for char in body if char not in BECH32_CHARSET), None)
    if bad:
        why = ' (after "bc1", the characters 1, b, i and o are never used)' if bad in "1bio" else ""
        return _fail("segwit_character", f'The character "{bad}" can\'t appear in a bc1 address{why}.',
                     "Contains a character that is not allowed.")
    data = [BECH32_CHARSET.index(char) for char in body]
    version = data[0]
    expected = BECH32_CONST if version == 0 else BECH32M_CONST
    if _polymod(_hrp_expand("bc") + data) != expected:
        return _checksum_failure()
    program = _convert_bits(data[1:-6], 5, 8, pad=False)
    if (program is None or version > SEGWIT_MAX_VERSION
            or not SEGWIT_PROGRAM_LENGTH[0] <= len(program) <= SEGWIT_PROGRAM_LENGTH[1]):
        return _fail("segwit_invalid", "This bc1 address is not a valid SegWit address.", "Not a valid SegWit address.")
    if version == 0:
        if len(program) == 20:
            return _ok(address, "p2wpkh")
        if len(program) == 32:
            return _ok(address, "p2wsh")
        return _fail("segwit_v0_length", "This bc1q address has the wrong length.", "Wrong length.")
    if version == 1 and len(program) == 32:
        return _ok(address, "p2tr")
    return _ok(address, "segwit")


# ---------------------------------------------------------------- Transaction IDs


@dataclass(frozen=True)
class TxidCheck:
    """The verdict on one transaction ID; `txid` is normalised to lower case when `ok`."""

    ok: bool
    txid: str | None = None
    reason: str | None = None
    message: str = ""
    hint: str = ""
    field_message: str = ""


def validate_txid(raw: str) -> TxidCheck:
    """Judge a transaction ID: exactly 64 hexadecimal characters (the explorer shows them in lower case)."""
    value = raw.strip()
    if value == "":
        return TxidCheck(False, reason="empty", message="Enter a transaction ID.", hint=TXID_HINT, field_message="Required.")
    if len(value) != TXID_LENGTH:
        return TxidCheck(False, reason="length", hint=TXID_HINT, field_message="Wrong length.",
                         message=f"A transaction ID has {TXID_LENGTH} characters; this one has {len(value)}.")
    bad = next((char for char in value if char not in "0123456789abcdefABCDEF"), None)
    if bad:
        return TxidCheck(False, reason="character", hint=TXID_HINT, field_message="Contains a character that is not allowed.",
                         message=f'The character "{bad}" can\'t appear in a transaction ID; only 0-9 and a-f do.')
    return TxidCheck(True, txid=value.lower())


def require_txid(raw: str, field: str = "txid") -> str:
    """The normalised transaction ID, or an `InvalidRequest` (400) that names `field`.

    Raises:
        InvalidRequest: The ID fails `validate_txid`.
    """
    check = validate_txid(raw)
    if check.txid is None:
        raise InvalidRequest(check.message, check.hint, [FieldError(name=field, message=check.field_message)])
    return check.txid
