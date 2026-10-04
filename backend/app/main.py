"""FastAPI application factory.

Run from the project root with ``uvicorn main:app --app-dir backend`` (see backend/main.py)
or from backend/ with ``uvicorn app.main:app``.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, OperationalError

from app import db as database
from app.config import settings
from app.errors import AppError
from app.models import Shop
from app.routers import ALL_ROUTERS
from app.spa import register_spa

logger = logging.getLogger("shopos")


def seed_demo_if_empty() -> None:
    """Create the demo shop on first start (when the database has no shops at all)."""
    from app.seed import seed_demo_shop  # local import keeps startup imports light

    with database.SessionLocal() as session:
        session.connection(execution_options={database.BEGIN_MODE_OPTION: "IMMEDIATE"})
        if session.scalar(select(Shop.id).limit(1)) is None:
            seed_demo_shop(session)
            session.commit()
            logger.info("Seeded the demo shop.")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    database.init_database()
    if settings.seed_demo:
        seed_demo_if_empty()
    yield


async def _app_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppError)
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=headers)


async def _integrity_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    logger.warning("Integrity error: %s", exc)
    return JSONResponse(
        {"detail": "This clashes with a record that already exists. Refresh and try again."},
        status_code=409,
    )


async def _operational_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    if "locked" in str(exc).lower():
        return JSONResponse(
            {"detail": "The shop's data is busy right now. Try again in a moment."},
            status_code=503,
        )
    logger.exception("Database error", exc_info=exc)
    return JSONResponse(
        {"detail": "Something went wrong while saving. Try again."}, status_code=500
    )


def create_app() -> FastAPI:
    app = FastAPI(
        title="ShopOS API",
        version="1.0.0",
        description="The operating system for local shops.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(IntegrityError, _integrity_error_handler)
    app.add_exception_handler(OperationalError, _operational_error_handler)
    for router in ALL_ROUTERS:
        app.include_router(router)
    register_spa(app)  # last: catch-all for the single-page app
    return app


app = create_app()
