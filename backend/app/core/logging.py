"""Logging (T07, plan section 11.3): one stream, one format, one line per request.

Only the `app` loggers are configured here; Uvicorn keeps its own. Uvicorn's access line is switched
off because the request middleware writes a fuller one (request identifier, milliseconds).
"""
from __future__ import annotations

import logging
import sys

FORMAT = "%(asctime)s %(levelname)-7s %(name)s: %(message)s"


def configure_logging(level: str) -> None:
    """Send the `app` loggers to stderr at `level`, once however many times the app is created."""
    logger = logging.getLogger("app")
    logger.setLevel(level)
    logger.propagate = False
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stderr)
        handler.setFormatter(logging.Formatter(FORMAT))
        logger.addHandler(handler)
    logging.getLogger("uvicorn.access").disabled = True
