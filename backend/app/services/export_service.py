"""E10: the scored transactions of an address as a CSV or JSON file.

The rows are E6's: the same filters, the same order, the same deciding method, taken from the same cached view, so the
file lists exactly what the screen lists. A row is described once (`ExportRow`) and written either way. The numbers are
Assignment 2's: amounts are formatted from whole satoshis, never converted through a float.
"""
from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from explorer.amounts import format_btc
from explorer.explain import FEATURE_NAMES
from explorer.features import FEATURE_IDS

from ..schemas.addresses import TransactionRow
from ..schemas.exports import ExportDocument, ExportFeature, ExportQuery, ExportRow
from .explorer_service import ExplorerService

# A spreadsheet runs a cell as a formula when it starts with one of these (the plan names the first four; a tab or
# a carriage return is the same attack, so the guard covers them too).
FORMULA_STARTS = ("=", "+", "-", "@", "\t", "\r")
# What F1 to F4 are measured in (the units `Predictor.feature_details` uses).
FEATURE_UNITS = {"F1": "btc", "F2": "count", "F3": "hours", "F4": "ratio"}
CSV_MEDIA_TYPE = "text/csv; charset=utf-8"
JSON_MEDIA_TYPE = "application/json"
MEDIA_TYPES = {"csv": CSV_MEDIA_TYPE, "json": JSON_MEDIA_TYPE}
# Eight decimals are a satoshi; scores, z-scores and the other feature values need far fewer.
BTC_PLACES, STAT_PLACES = 8, 6


@dataclass(frozen=True)
class ExportFile:
    """A file to send: its bytes, its media type and the name a browser saves it under."""

    content: bytes
    media_type: str
    filename: str


def guard_formula(text: str) -> str:
    """The text, with a leading apostrophe when a spreadsheet would run it as a formula (plan section 6.2, E10)."""
    return "'" + text if text.startswith(FORMULA_STARTS) else text


def _number(value: float | None, places: int) -> str:
    """A number as plain decimal text with at most `places` decimals and no trailing zeros; empty for None.

    Never in scientific notation and never starts a formula: a negative number is written as a number, not as text.
    """
    return "" if value is None else format(Decimal(repr(round(value, places))).normalize(), "f")


def _btc(sats: int) -> str:
    """Whole satoshis as BTC with eight decimals, such as 0.05000000 (the sign is kept)."""
    return format_btc(sats).removesuffix(" BTC")


def csv_header() -> list[str]:
    """The CSV's columns, in the order of plan section 6.2 (E10)."""
    features = []
    for fid in FEATURE_IDS:
        slug = FEATURE_NAMES[fid].lower().replace(" ", "_")
        unit = FEATURE_UNITS[fid]
        features += [f"{slug}_{unit}", f"{slug}_usual_{unit}", f"{slug}_z"]
    return ["address", "txid", "time_utc", "direction", "received_btc", "sent_btc", "net_btc", "scored", "flagged",
            "deciding_method", "score", *features, "main_reason", "flagged_by", "source_url", "snapshot_date", "limitation"]


def csv_cells(row: ExportRow, limitation: str) -> list[str]:
    """One row's cells, in `csv_header`'s order. Text cells are guarded against formulas; numbers are not text.

    The limitation line goes in every row, not only flagged ones: the wording rule says every export carries
    it, and a filtered CSV may have no flagged row at all (the JSON file states it once at the top).
    """
    by_id = {f.id: f for f in row.features}
    features: list[str] = []
    for fid in FEATURE_IDS:
        feature = by_id.get(fid)
        places = BTC_PLACES if fid == "F1" else STAT_PLACES
        features += ["", "", ""] if feature is None else [_number(feature.value, places), _number(feature.usual, places),
                                                          _number(feature.z, STAT_PLACES)]
    text = [guard_formula(cell) for cell in (row.address, row.txid, row.time, row.direction)]
    return [*text, _btc(row.received_sats), _btc(row.sent_sats), _btc(row.net_sats), str(row.scored).lower(),
            str(row.flagged).lower(), guard_formula(row.method), _number(row.score, STAT_PLACES), *features,
            guard_formula(row.main_reason or ""), guard_formula(";".join(row.flagged_by)), guard_formula(row.source_url),
            guard_formula(row.snapshot_date), guard_formula(limitation)]


class ExportService:
    """Serves E10 from the explorer service's rows."""

    def __init__(self, explorer: ExplorerService, default_method: str, snapshot_date: str, limitation_line: str) -> None:
        """
        Args:
            explorer: Where E6's rows and their details come from.
            default_method: The deciding method when the request names none.
            snapshot_date: The snapshot's date, in every row and in the file's name.
            limitation_line: settings.json -> limitationLine: in every CSV row, at the top of the JSON file, and in
                its flagged rows.
        """
        self._explorer = explorer
        self._default = default_method
        self._snapshot_date = snapshot_date
        self._limitation = limitation_line

    def export(self, address: str, query: ExportQuery) -> ExportFile:
        """The rows that match E6's filters, as a file in the format asked for.

        Raises:
            InvalidRequest: A filter is not acceptable (the rules of E6).
            Unsupported: The address is not in the snapshot.
        """
        rows, details = self._explorer.matching(address, query)
        method = query.method or self._default
        date = self._explorer.data_date(address, self._snapshot_date)  # a fetched address's data is dated by its fetch
        records = [self._record(address, method, row, details[row.txid], date) for row in rows]
        if query.format == "json":
            document = ExportDocument.model_validate({
                "address": address, "snapshotDate": date, "method": method, "limitation": self._limitation,
                "count": len(records), "transactions": records})
            content = document.model_dump_json(by_alias=True, indent=2).encode("utf-8")
        else:
            buffer = io.StringIO(newline="")
            writer = csv.writer(buffer)  # RFC 4180: comma, CRLF, quotes only where needed
            writer.writerow(csv_header())
            writer.writerows(csv_cells(record, self._limitation) for record in records)
            content = buffer.getvalue().encode("utf-8")
        return ExportFile(content, MEDIA_TYPES[query.format], f"{address[:8]}-{date}.{query.format}")

    def _record(self, address: str, method: str, row: TransactionRow, detail: dict[str, Any], date: str) -> ExportRow:
        """One row of the file, from E6's row and the transaction's detail."""
        scored = row.status != "not-scored"
        flagged_by = [name for name, flag in detail.get("flags", {}).items() if flag] if scored else []
        features = [ExportFeature.model_validate({k: f[k] for k in ("id", "name", "value", "usual", "z")})
                    for f in detail.get("features", [])]
        return ExportRow.model_validate({
            "address": address, "txid": row.txid, "time": row.time, "direction": row.direction,
            "receivedSats": detail["receivedSats"], "sentSats": detail["sentSats"], "netSats": row.net_sats, "scored": scored,
            "flagged": row.status == "flagged", "method": method, "score": row.score, "features": features,
            "mainReason": row.main_reason, "flaggedBy": flagged_by, "sourceUrl": detail["sourceUrl"],
            "snapshotDate": date, "limitation": self._limitation if row.status == "flagged" else None})
