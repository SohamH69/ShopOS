"""Upgrading a database made by an earlier ShopOS (before shop IDs, photos, links and admins)."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app import migrations
from app.db import Base, create_db_engine
from app.models import Shop

OLD_SHOP_COLUMNS = (
    "id INTEGER PRIMARY KEY, name VARCHAR(120) NOT NULL, owner_name VARCHAR(120) NOT NULL, "
    "phone VARCHAR(32) NOT NULL, email VARCHAR(254), address TEXT NOT NULL, city VARCHAR(120) NOT NULL, "
    "segment VARCHAR(60) NOT NULL, plan VARCHAR(20) NOT NULL, upi_id VARCHAR(120), "
    "is_demo BOOLEAN NOT NULL, next_order_number INTEGER NOT NULL, created_at DATETIME NOT NULL"
)


def old_database(path: Path) -> object:
    """Today's schema, then the shops and customers tables put back the way they used to be."""
    engine = create_db_engine(f"sqlite:///{path.as_posix()}")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
        connection.exec_driver_sql("DROP INDEX IF EXISTS ix_shops_code")
        connection.exec_driver_sql("DROP TABLE shops")
        connection.exec_driver_sql(f"CREATE TABLE shops ({OLD_SHOP_COLUMNS})")
        for column in ("portal_version", "portal_last_seen_at"):
            connection.exec_driver_sql(f"ALTER TABLE customers DROP COLUMN {column}")
        for shop_id, is_demo in ((1, 1), (2, 0)):
            connection.execute(
                text(
                    "INSERT INTO shops (id, name, owner_name, phone, email, address, city, segment, plan, "
                    "upi_id, is_demo, next_order_number, created_at) VALUES (:id, :name, 'Owner', '9000000000', "
                    "NULL, '', 'Pune', 'Grocery', 'free', NULL, :demo, 1001, '2026-01-01 00:00:00')"
                ),
                {"id": shop_id, "name": f"Shop {shop_id}", "demo": is_demo},
            )
    return engine


def test_upgrade_adds_columns_and_fills_them_in(tmp_path: Path) -> None:
    engine = old_database(tmp_path / "old.db")
    migrations.upgrade(engine)  # type: ignore[arg-type]

    columns = {column["name"] for column in inspect(engine).get_columns("shops")}  # type: ignore[arg-type]
    assert {"code", "photo_file", "latitude", "longitude", "is_suspended", "portal_orders"} <= columns
    customer_columns = {column["name"] for column in inspect(engine).get_columns("customers")}  # type: ignore[arg-type]
    assert {"portal_version", "portal_last_seen_at"} <= customer_columns

    with Session(engine) as db:  # type: ignore[call-overload]
        demo, real = db.scalars(select(Shop).order_by(Shop.id)).all()
        assert demo.code and real.code and demo.code != real.code
        assert demo.setup_complete is True  # the demo shop gets its photo and pin
        assert real.setup_complete is False  # real shops add theirs at the setup screen
        assert real.is_suspended is False and real.portal_orders is True and real.suspended_reason == ""

    # Running it again changes nothing.
    migrations.upgrade(engine)  # type: ignore[arg-type]
    with Session(engine) as db:  # type: ignore[call-overload]
        assert db.scalar(select(Shop.code).where(Shop.id == 2)) == real.code
    indexes = {index["name"]: index for index in inspect(engine).get_indexes("shops")}  # type: ignore[arg-type]
    assert indexes["ix_shops_code"]["unique"]
    engine.dispose()  # type: ignore[attr-defined]
