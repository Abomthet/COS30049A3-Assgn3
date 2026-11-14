"""E13 to E15: the watchlist's rules over its repository (S-04).

An address may be watched only if the explorer can open it, so every entry has a summary to show. The limits on label,
note and count come from settings.json -> web.watchlist; the repository holds the entries and knows none of this.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from explorer.predict import Unsupported

from ..core.config import WatchlistLimits
from ..core.errors import Conflict, InvalidRequest, NotFound, needs_correcting
from ..schemas.errors import FieldError
from ..schemas.watchlist import WatchlistEntry, WatchlistPut, WatchlistResponse
from .explorer_service import ExplorerService
from .watchlist_repo import WatchEntry, WatchlistFull, WatchlistRepo

CORRECT_HINT = "Correct the values named below and send the request again."


class WatchlistService:
    """Serves E13 to E15."""

    def __init__(self, repo: WatchlistRepo, explorer: ExplorerService, limits: WatchlistLimits) -> None:
        """
        Args:
            repo: Where the entries are kept.
            explorer: Gives an address's summary, and refuses an address that cannot be opened.
            limits: Label, note and count limits (settings.json -> web.watchlist).
        """
        self._repo = repo
        self._explorer = explorer
        self._limits = limits

    def _entry(self, stored: WatchEntry) -> WatchlistEntry:
        return WatchlistEntry(address=stored.address, label=stored.label, note=stored.note, added_at=stored.added_at,
                              updated_at=stored.updated_at, summary=self._explorer.summary(stored.address))

    def _can_open(self, address: str) -> bool:
        """False for a fetched address that has since expired or been forgotten: its entry stays in the file, unlisted."""
        try:
            self._explorer.summary(address)
        except Unsupported:
            return False
        return True

    def entries(self) -> WatchlistResponse:
        """E13: every entry with its summary, most recently added first."""
        return WatchlistResponse(entries=[self._entry(stored) for stored in self._repo.list() if self._can_open(stored.address)])

    def put(self, address: str, body: WatchlistPut) -> tuple[WatchlistEntry, bool]:
        """E14: add or replace an entry.

        Returns:
            The entry, and whether it is new (201) or replaced (200).

        Raises:
            Unsupported: The explorer cannot open the address.
            InvalidRequest: The label or the note is over its limit.
            Conflict: The entry is new and the list is full.
        """
        self._explorer.summary(address)  # raises Unsupported
        self.reject(body.label, body.note)
        try:
            stored, created = self._repo.put(address, body.label, body.note)
        except WatchlistFull:
            raise Conflict(f"The watchlist is full: it holds {self._limits.max_entries} addresses.",
                           "Remove an address from the list, then add this one.") from None
        return self._entry(stored), created

    def delete(self, address: str) -> None:
        """E15: remove an entry.

        Raises:
            NotFound: The address is not on the list.
        """
        if not self._repo.delete(address):
            raise NotFound("This address is not on the watchlist.", "Reload the list to see what it holds now.")

    def discard(self, address: str) -> None:
        """Remove an entry if there is one: a forgotten address is no longer on the list, and that is not an error."""
        self._repo.delete(address)

    def problems(self, label: object, note: object) -> list[FieldError]:
        """The fields at fault by the length limits; a value that is not text is left to the type check."""
        found = []
        if isinstance(label, str) and len(label) > self._limits.max_label_chars:
            found.append(FieldError(name="label", message=f"Must be at most {self._limits.max_label_chars} characters."))
        if isinstance(note, str) and len(note) > self._limits.max_note_chars:
            found.append(FieldError(name="note", message=f"Must be at most {self._limits.max_note_chars} characters."))
        return found

    def reject(self, label: str, note: str) -> None:
        """Raise one 400 naming each field over its limit.

        Raises:
            InvalidRequest: With every field at fault named.
        """
        if errors := self.problems(label, note):
            raise InvalidRequest(needs_correcting(len(errors)), CORRECT_HINT, errors)

    def rejected_put(self, body: Mapping[str, Any]) -> list[FieldError]:
        """E14: the limits applied to a body whose type check failed on another field."""
        return self.problems(body.get("label"), body.get("note"))
