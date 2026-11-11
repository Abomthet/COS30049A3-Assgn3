"""The export (E10): the file's format and the filters it shares with E6."""
from __future__ import annotations

from typing import Literal

from .addresses import TransactionFilters

ExportFormat = Literal["csv", "json"]


class ExportQuery(TransactionFilters):
    """E10's query: E6's filters and the file format. The answer is a file, not a JSON body."""

    format: ExportFormat = "csv"
