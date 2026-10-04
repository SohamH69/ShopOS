"""Database engine, session factory and declarative base.

SQLite notes: the pysqlite driver's own implicit transaction handling is disabled and
SQLAlchemy emits BEGIN itself, so every session works inside one real transaction.
Write requests ask for ``BEGIN IMMEDIATE`` (see ``deps.get_db``) which takes SQLite's
write lock up front: concurrent writers queue on ``busy_timeout`` instead of failing,
and read-check-write sequences (for example "amount <= outstanding") stay correct.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Connection, Engine, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings

# Execution option read by the "begin" hook: "DEFERRED" (default) or "IMMEDIATE".
BEGIN_MODE_OPTION = "shopos_sqlite_begin"


class Base(DeclarativeBase):
    pass


def _install_sqlite_hooks(engine: Engine, *, in_memory: bool) -> None:
    @event.listens_for(engine, "connect")
    def _on_connect(dbapi_connection: Any, _record: Any) -> None:
        dbapi_connection.isolation_level = None  # SQLAlchemy emits BEGIN in _on_begin
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA busy_timeout=30000")
        if not in_memory:
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    @event.listens_for(engine, "begin")
    def _on_begin(connection: Connection) -> None:
        mode = connection.get_execution_options().get(BEGIN_MODE_OPTION, "DEFERRED")
        if mode not in {"DEFERRED", "IMMEDIATE"}:
            mode = "DEFERRED"
        connection.exec_driver_sql(f"BEGIN {mode}")


def create_db_engine(database_url: str) -> Engine:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite":
        return create_engine(url, pool_pre_ping=True)

    database = url.database or ""
    in_memory = database in {"", ":memory:"} or "mode=memory" in database
    if in_memory:
        engine = create_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
    else:
        if not database.startswith("file:"):
            Path(database).parent.mkdir(parents=True, exist_ok=True)
        engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})
    _install_sqlite_hooks(engine, in_memory=in_memory)
    return engine


engine = create_db_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, class_=Session, autoflush=True, expire_on_commit=True)


def init_database() -> None:
    """Create all tables (idempotent)."""
    from app import models  # noqa: F401  (registers the mapped classes)

    Base.metadata.create_all(engine)


def reset_database() -> None:
    """Drop and recreate every table. Used by ``python -m app.seed --reset``."""
    from app import models  # noqa: F401

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
