"""The application factory (T07, M-01): `uvicorn app.main:app --port 8000` from backend/.

`create_app()` wires the layers in one place: settings and logging, the lifespan that loads the
Predictor once (Mod-1), the middleware (request identifiers and access log, CORS, compression), the
error handlers (T08) and the routers. It holds no logic of its own.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from explorer.predict import Predictor
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import __version__
from .api import system
from .core.config import Settings, load_settings
from .core.errors import register_handlers
from .core.logging import configure_logging
from .core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware
from .core.openapi import install_openapi
from .core.runtime import Runtime
from .services.model_service import load_predictor, snapshot_facts

log = logging.getLogger("app.main")

# Responses smaller than this are not worth compressing (plan section 6.1: over 1 kB).
GZIP_MIN_BYTES = 1000


async def load_models(runtime: Runtime, loader: Callable[[], Predictor]) -> None:
    """Load the Predictor off the event loop so the service can answer E1 with a 503 meanwhile.

    A failure is recorded and logged, and E1 keeps answering 503 with its sentence: the service does
    not pretend to be ready.
    """
    log.info("Loading the explorer models")
    try:
        predictor = await asyncio.to_thread(loader)
        facts = snapshot_facts(predictor)
    except Exception as error:  # the cause goes to the log; the response says only that the load failed
        runtime.load_error = f"{error.__class__.__name__}: {error}"
        log.error("The explorer models could not be loaded (%s). Check the installation as the README describes.",
                  runtime.load_error)
        return
    runtime.predictor, runtime.facts = predictor, facts
    log.info("Explorer ready: %d addresses, %d methods (snapshot %s, %.1f s since start)", facts.address_count,
             facts.method_count, facts.date, runtime.uptime_seconds)


def create_app(settings: Settings | None = None, loader: Callable[[], Predictor] = load_predictor) -> FastAPI:
    """Build the application.

    Args:
        settings: Configuration; read from settings.json and the environment when omitted.
        loader: Returns the Predictor. Tests pass one that returns a shared, already loaded Predictor.
    """
    settings = settings or load_settings()
    configure_logging(settings.log_level)
    runtime = Runtime(settings=settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        task = asyncio.create_task(load_models(runtime, loader))
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="Bitcoin Address Activity Explorer API", version=__version__, lifespan=lifespan,
                  description="Unusual-activity scoring for Bitcoin addresses, from Assignment 2's models. "
                              "A flag means unusual for this address's own history, nothing more.")
    app.state.runtime = runtime

    # Added innermost first: the request context is outermost, so every request is numbered and logged.
    app.add_middleware(GZipMiddleware, minimum_size=GZIP_MIN_BYTES)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST", "PUT", "DELETE"],
                       allow_headers=["Content-Type", REQUEST_ID_HEADER], expose_headers=[REQUEST_ID_HEADER])
    app.add_middleware(RequestContextMiddleware)
    register_handlers(app)
    app.include_router(system.router)
    install_openapi(app)
    return app


app = create_app()
