"""Small, idempotent schema upgrades for databases made by an earlier ShopOS.

``create_all()`` adds new tables but never new columns, so every column added after the first
release is listed in ``ADDED_COLUMNS``. ``upgrade()`` adds the missing ones and fills them in. It
runs on every start and does nothing once a database is up to date.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import inspect, literal, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.db import Base

logger = logging.getLogger("shopos")

# table -> [(column, default for existing rows, or None for a nullable column)]
ADDED_COLUMNS: dict[str, list[tuple[str, Any]]] = {
    "shops": [
        ("code", None),
        ("photo_file", None),
        ("latitude", None),
        ("longitude", None),
        ("portal_catalog", True),
        ("portal_orders", True),
        ("is_suspended", False),
        ("suspended_reason", ""),
        ("suspended_at", None),
    ],
    "customers": [
        ("portal_version", 0),
        ("portal_last_seen_at", None),
    ],
}


def _add_missing_columns(engine: Engine) -> list[str]:
    inspector = inspect(engine)
    added: list[str] = []
    with engine.begin() as connection:
        for table_name, columns in ADDED_COLUMNS.items():
            if not inspector.has_table(table_name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table_name)}
            table = Base.metadata.tables[table_name]
            for name, default in columns:
                if name in existing:
                    continue
                column = table.c[name]
                ddl = f"ALTER TABLE {table_name} ADD COLUMN {name} {column.type.compile(dialect=engine.dialect)}"
                if default is not None:
                    value = literal(default, column.type).compile(
                        dialect=engine.dialect, compile_kwargs={"literal_binds": True}
                    )
                    ddl += f" NOT NULL DEFAULT {value}"
                connection.exec_driver_sql(ddl)
                added.append(f"{table_name}.{name}")
        # New databases get this index from the model; older ones get it once their codes are in.
        connection.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS ix_shops_code ON shops (code)")
    return added


def _backfill(engine: Engine) -> None:
    from app.models import Shop
    from app.services import shop as shop_service

    with Session(engine) as db:
        for shop in db.scalars(select(Shop).where(Shop.code.is_(None))):
            shop.code = shop_service.new_shop_code(db)
            db.flush()
        for shop in db.scalars(select(Shop).where(Shop.is_demo.is_(True))):
            if not shop.setup_complete:
                shop_service.apply_demo_setup(shop)
        db.commit()


def upgrade(engine: Engine) -> None:
    added = _add_missing_columns(engine)
    if added:
        logger.info("Database upgraded: added %s.", ", ".join(added))
    _backfill(engine)
