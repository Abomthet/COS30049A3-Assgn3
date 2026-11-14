"""A fake Esplora for the live-lookup tests (S-09): no test touches the network.

The history it serves is a recording: the 100 most recent confirmed transactions of one real address, read once from
Blockstream and kept as the live cache holds them (trimmed to the parts the pipeline uses, in tests/fixtures). `inflate` turns
a trimmed transaction back into the full shape Esplora sends (inputs and outputs that belong to other addresses are filled in
with stand-ins), so the service's own trimming and cleaning run on what looks like a real reply.
"""
from __future__ import annotations

import gzip
import json
import threading
from pathlib import Path
from typing import Any

from explorer.esplora import PAGE_SIZE, EsploraEndpoints, EsploraError

FIXTURES = Path(__file__).parent / "fixtures"
RECORDED_ADDRESS = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh"
OTHER = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4"  # BIP 173's example: the "other side" of every recorded transaction
# Valid addresses that are not in the snapshot, to look up with the recording as their history.
ADDRESSES = ("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
             "12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", "1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs",
             "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3", "35hK24tcLEWcgNA4JxpvbkNkoAcDGqQPsP")


def recorded() -> list[dict[str, Any]]:
    """The recorded transactions, newest first, in the trimmed form."""
    with gzip.open(FIXTURES / f"live_recorded_{RECORDED_ADDRESS}.json.gz", "rt", encoding="utf-8") as handle:
        return json.load(handle)["transactions"]


def inflate(trimmed: dict[str, Any], address: str) -> dict[str, Any]:
    """A transaction as Esplora sends it, from its trimmed form, with the recorded address's side now `address`'s."""
    def side(items: list[dict[str, Any]], count: int, wrap: bool) -> list[dict[str, Any]]:
        kept = {item["n"]: item for item in items}
        out = []
        for n in range(count):
            if n in kept:
                fields = {key: value for key, value in (kept[n]["prevout"] if wrap else kept[n]).items() if key != "n"}
                fields["scriptpubkey_address"] = address
            else:
                fields = {"scriptpubkey_address": OTHER, "scriptpubkey_type": "v0_p2wpkh", "value": 12_345}
            out.append({"prevout": fields} if wrap else fields)
        return out

    return {"txid": trimmed["txid"], "status": dict(trimmed["status"]), "fee": trimmed["fee"], "weight": trimmed["weight"],
            "size": trimmed["size"], "vin": side(trimmed["vin"], trimmed["n_vin"], True),
            "vout": side(trimmed["vout"], trimmed["n_vout"], False)}


class FakeEsplora(EsploraEndpoints):
    """Serves `histories` (address -> full transactions, newest first) the way Esplora pages them, and records every request.

    Attributes:
        requests: Every path asked for, in order.
        fail_on: A path prefix; the first request that starts with it raises `error` instead of answering.
        error: What `fail_on` raises.
        gate: When set, a request for any history page after the first waits for `gate.set()` (so a test can act mid-fetch).
        waiting: Set as soon as a request is waiting at the gate.
    """

    def __init__(self, histories: dict[str, list[dict[str, Any]]] | None = None) -> None:
        self.histories = histories if histories is not None else {
            address: [inflate(tx, address) for tx in recorded()] for address in ADDRESSES}
        self.requests: list[str] = []
        self.fail_on: str | None = None
        self.error: EsploraError = EsploraError(500, "https://example.invalid", "boom")
        self.gate: threading.Event | None = None
        self.waiting = threading.Event()
        self.total_reported: dict[str, int] = {}

    def get_text(self, path: str) -> str:
        self.requests.append(path)
        if self.fail_on is not None and path.startswith(self.fail_on):
            raise self.error
        parts = path.strip("/").split("/")  # address/<a>[/txs/chain[/<last>]]
        address = parts[1]
        history = self.histories.get(address, [])
        if len(parts) == 2:
            return json.dumps({"address": address, "chain_stats": {"tx_count": self.total_reported.get(address, len(history))}})
        if self.gate is not None and len(parts) == 5:  # a page after the first
            self.waiting.set()
            assert self.gate.wait(10), "the test never released the gate"
        start = 0
        if len(parts) == 5:
            start = next(i for i, tx in enumerate(history) if tx["txid"] == parts[4]) + 1
        return json.dumps(history[start:start + PAGE_SIZE])

    def history_requests(self) -> list[str]:
        return [path for path in self.requests if "/txs/chain" in path]
