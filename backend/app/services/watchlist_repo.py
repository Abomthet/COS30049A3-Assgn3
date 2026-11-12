"""The watchlist's repository: a SQLite file next to the service (S-04, D-A3-8: no accounts).

One connection serves every request. Uvicorn runs synchronous routes in a thread pool, so the connection is opened with
`check_same_thread=False` and every method holds one lock for its whole statement group: a check of the entry count and
the insert that follows it cannot be interleaved with another request's. Nothing here knows about HTTP or about
addresses: the service layer decides which addresses may be stored and which texts are acceptable.
"""
from __future__ import annotations

import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS watchlist (
    address    TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    note       TEXT NOT NULL,
    added_at   TEXT NOT NULL,
    updated_at TEXT NOT NULL
) WITHOUT ROWID
"""


@dataclass(frozen=True)
class WatchEntry:
    """One stored entry; the times are ISO 8601 in UTC."""

    address: str
    label: str
    note: str
    added_at: str
    updated_at: str


class WatchlistFull(Exception):
    """A new entry was offered while the list holds its maximum."""


def now_iso() -> str:
    """The present moment as `2026-11-12T08:30:00Z` (UTC, whole seconds)."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class WatchlistRepo:
    """Entries by address, behind one lock."""

    def __init__(self, path: Path | str, max_entries: int) -> None:
        """Open (and create, with its folder) the database file.

        Args:
            path: The SQLite file; `:memory:` keeps it in memory.
            max_entries: The most entries the list may hold (settings.json -> web.watchlist).
        """
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._max = max_entries
        self._lock = threading.Lock()
        self._db = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        with self._lock:
            self._db.execute(SCHEMA)

    def close(self) -> None:
        """Close the file."""
        with self._lock:
            self._db.close()

    @staticmethod
    def _entry(row: tuple[str, str, str, str, str]) -> WatchEntry:
        return WatchEntry(*row)

    def list(self) -> list[WatchEntry]:
        """Every entry, the most recently added first."""
        with self._lock:
            rows = self._db.execute("SELECT address, label, note, added_at, updated_at FROM watchlist "
                                    "ORDER BY added_at DESC, address").fetchall()
        return [self._entry(row) for row in rows]

    def get(self, address: str) -> WatchEntry | None:
        """One entry, or None."""
        with self._lock:
            row = self._db.execute("SELECT address, label, note, added_at, updated_at FROM watchlist WHERE address = ?",
                                   (address,)).fetchone()
        return None if row is None else self._entry(row)

    def put(self, address: str, label: str, note: str) -> tuple[WatchEntry, bool]:
        """Add the entry, or replace its label and note (keeping when it was added).

        Returns:
            The stored entry, and whether it is new.

        Raises:
            WatchlistFull: The entry is new and the list already holds its maximum.
        """
        now = now_iso()
        with self._lock:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                existing = self._db.execute("SELECT added_at FROM watchlist WHERE address = ?", (address,)).fetchone()
                if existing is None:
                    (count,) = self._db.execute("SELECT COUNT(*) FROM watchlist").fetchone()
                    if count >= self._max:
                        raise WatchlistFull
                    added = now
                else:
                    added = existing[0]
                self._db.execute("INSERT OR REPLACE INTO watchlist (address, label, note, added_at, updated_at) "
                                 "VALUES (?, ?, ?, ?, ?)", (address, label, note, added, now))
                self._db.execute("COMMIT")
            except BaseException:
                self._db.execute("ROLLBACK")
                raise
        return WatchEntry(address, label, note, added, now), existing is None

    def delete(self, address: str) -> bool:
        """Remove the entry; False when there was none."""
        with self._lock:
            return self._db.execute("DELETE FROM watchlist WHERE address = ?", (address,)).rowcount > 0
