"""The application factory (T07, M-01): `uvicorn app.main:app --port 8000` from backend/.

`create_app()` wires the layers in one place: settings and logging, the lifespan that loads the
Predictor once (Mod-1), the middleware (request identifiers and access log, CORS, compression), the
error handlers (T08) and the routers. It holds no logic of its own.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import threading
import time
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from explorer.esplora import EsploraClient, EsploraEndpoints, FailoverClient
from explorer.predict import Predictor
from explorer.settings import SETTINGS
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import __version__
from .api import addresses, explanations, exports, live, methods, system, transactions, watchlist, whatif
from .api.field_rules import FIELD_RULES
from .core.body_limit import BodyLimitMiddleware
from .core.config import BACKEND_ROOT, Settings, load_settings
from .core.errors import register_handlers
from .core.logging import configure_logging
from .core.middleware import REQUEST_ID_HEADER, ETagMiddleware, RequestContextMiddleware
from .core.openapi import install_openapi
from .core.runtime import Runtime
from .services.assistant_service import AssistantService
from .services.explorer_service import ExplorerService
from .services.export_service import ExportService
from .services.live_service import LiveService
from .services.live_store import LiveStore
from .services.methods_service import MethodsService
from .services.model_service import load_predictor, snapshot_facts
from .services.store import AddressStore, CompositeStore, SnapshotStore
from .services.watchlist_repo import WatchlistRepo
from .services.watchlist_service import WatchlistService
from .services.whatif_service import WhatIfService

log = logging.getLogger("app.main")

# Responses smaller than this are not worth compressing (plan section 6.1: over 1 kB).
GZIP_MIN_BYTES = 1000


# A lookup that cannot reach the public service should say so within about a minute: three tries, not A2's collection run's six.
LIVE_RETRIES = 2
# Room in the explorer's cache for the addresses fetched while the server runs, beyond one set for the snapshot.
LIVE_CACHE_SLOTS = 32


def esplora_clients() -> Callable[[], EsploraEndpoints]:
    """The client a live lookup reads the chain with: Blockstream, then mempool.space when Blockstream limits the rate, paced and
    backing off as Assignment 2's collection does (settings.json -> source, collection). One client serves every lookup, so the
    pause between requests and the hold on the second host carry across them."""
    source, collection = SETTINGS["source"], SETTINGS["collection"]
    client = FailoverClient(
        [EsploraClient(source[key], collection["requestPauseSeconds"], collection["timeoutSeconds"], LIVE_RETRIES)
         for key in ("apiBase", "fallbackApiBase")], collection["failoverHoldSeconds"])
    return lambda: client


async def load_models(runtime: Runtime, loader: Callable[[], Predictor], warm: bool = True,
                      repo: WatchlistRepo | None = None, live_directory: Path | None = None,
                      esplora: Callable[[], EsploraEndpoints] | None = None) -> None:
    """Load the Predictor off the event loop so the service can answer E1 with a 503 meanwhile, then warm the cache.

    A failure is recorded and logged, and E1 keeps answering 503 with its sentence: the service does
    not pretend to be ready. The cache warm-up (Mod-2) runs after the service is ready and never delays it.
    """
    log.info("Loading the explorer models")
    try:
        predictor = await asyncio.to_thread(loader)
        facts = snapshot_facts(predictor)
        store: AddressStore = SnapshotStore(predictor)
        live = None
        if runtime.settings.live_lookup and live_directory is not None:
            live_store = LiveStore(live_directory, predictor, runtime.settings.web.live.cache_days)
            live = LiveService(live_store, runtime.settings.web.live, esplora or esplora_clients())
            store = CompositeStore(store, live_store)
        explorer = ExplorerService(store, predictor, runtime.settings.web.lists, LIVE_CACHE_SLOTS if live else 0)
        whatif = WhatIfService(store, predictor, runtime.settings.web.what_if)
        exports = ExportService(explorer, predictor.selected, predictor.snapshot_date, runtime.settings.limitation_line)
        methods = MethodsService(predictor)
        watchlist = WatchlistService(repo, explorer, runtime.settings.web.watchlist) if repo is not None else None
    except Exception as error:  # the cause goes to the log; the response says only that the load failed
        runtime.load_error = f"{error.__class__.__name__}: {error}"
        log.error("The explorer models could not be loaded (%s). Check the installation as the README describes.",
                  runtime.load_error)
        return
    # `explorer` is set last: it is what `Runtime.ready` waits for, so every service exists by then.
    runtime.whatif, runtime.exports, runtime.methods, runtime.watchlist, runtime.live = whatif, exports, methods, watchlist, live
    runtime.predictor, runtime.facts, runtime.explorer = predictor, facts, explorer
    log.info("Explorer ready: %d addresses, %d methods (snapshot %s, %.1f s since start)", facts.address_count,
             facts.method_count, facts.date, runtime.uptime_seconds)
    if warm:
        await warm_cache(explorer)


async def warm_cache(explorer: ExplorerService) -> None:
    """Score every snapshot address once, in a worker thread, so the first view of each is answered from memory."""
    stop = threading.Event()  # a thread cannot be cancelled: the flag lets a shutdown end the loop at the next address
    started = time.perf_counter()
    try:
        filled = await asyncio.to_thread(explorer.warm, stop)
    except asyncio.CancelledError:
        stop.set()
        raise
    log.info("Cache warmed: %d addresses in %.1f s", filled, time.perf_counter() - started)


DEFAULT_DATABASE = BACKEND_ROOT / "var" / "explorer.db"


def create_app(settings: Settings | None = None, loader: Callable[[], Predictor] = load_predictor, warm: bool = True,
               database: Path | str | None = None, esplora: Callable[[], EsploraEndpoints] | None = None) -> FastAPI:
    """Build the application.

    Args:
        settings: Configuration; read from settings.json and the environment when omitted.
        loader: Returns the Predictor. Tests pass one that returns a shared, already loaded Predictor.
        warm: Fill the per-address cache in the background once ready. Tests that do not measure it turn it off.
        database: The watchlist's SQLite file, opened when the service starts; `EXPLORER_DB` or backend/var/explorer.db when omitted.
            The live lookup's cache (S-09) is the `live` folder beside it.
        esplora: Gives the client a live lookup reads the chain with; Blockstream with mempool.space as the second host when omitted.
            Tests pass a fake, so no test touches the network.
    """
    settings = settings or load_settings()
    configure_logging(settings.log_level)
    runtime = Runtime(settings=settings, assistant=AssistantService(settings))

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        database_path = Path(database or os.environ.get("EXPLORER_DB") or DEFAULT_DATABASE)
        repo = WatchlistRepo(database_path, settings.web.watchlist.max_entries)
        task = asyncio.create_task(load_models(runtime, loader, warm, repo, database_path.parent / "live", esplora))
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
            if runtime.live is not None:
                await asyncio.to_thread(runtime.live.close)
            repo.close()

    app = FastAPI(title="Bitcoin Address Activity Explorer API", version=__version__, lifespan=lifespan,
                  description="Unusual-activity scoring for Bitcoin addresses, from Assignment 2's models. "
                              "A flag means unusual for this address's own history, nothing more.")
    app.state.runtime = runtime

    # Added innermost first: the request context is outermost, so every request is numbered and logged. The ETag
    # is innermost, so it hashes the body as written and not its compressed form (gzip stamps the time into its
    # output); the body limit is inside CORS, so a refusal still carries the headers the browser needs to read it.
    app.add_middleware(ETagMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=GZIP_MIN_BYTES)
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.web.limits.max_body_bytes)
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.cors_origins), allow_methods=["GET", "POST", "PUT", "DELETE"],
                       allow_headers=["Content-Type", REQUEST_ID_HEADER],
                       # A cross-origin page can read only exposed headers: Content-Disposition carries E10's file name,
                       # Retry-After the wait the client counts down on a 429.
                       expose_headers=[REQUEST_ID_HEADER, "Content-Disposition", "Retry-After"])
    app.add_middleware(RequestContextMiddleware)
    register_handlers(app, FIELD_RULES)
    app.include_router(system.router)
    app.include_router(addresses.router)
    app.include_router(transactions.router)
    app.include_router(whatif.router)
    app.include_router(exports.router)
    app.include_router(methods.router)
    app.include_router(watchlist.router)
    app.include_router(explanations.router)
    app.include_router(live.router)
    install_openapi(app)
    return app


app = create_app()
