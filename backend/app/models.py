"""SQLAlchemy ORM models.

Conventions: money columns end in ``_paise`` (integers); quantities are floats kept at
3 decimals; every row that belongs to a shop carries ``shop_id`` so all queries can be
scoped to the caller's shop.
"""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db import Base
from app.timeutil import UTC, now_utc


class UTCDateTime(TypeDecorator[datetime]):
    """Stores naive UTC (SQLite has no time zones) and returns aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None or value.tzinfo is None:
            return value
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC)


class Shop(Base):
    __tablename__ = "shops"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Public shop ID such as "SO-7K2Q9M": shown to the owner and in the admin view.
    code: Mapped[str | None] = mapped_column(String(16), unique=True, index=True, default=None)
    name: Mapped[str] = mapped_column(String(120))
    owner_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254), default=None)
    address: Mapped[str] = mapped_column(Text, default="")
    city: Mapped[str] = mapped_column(String(120), default="")
    segment: Mapped[str] = mapped_column(String(60), default="Grocery")
    plan: Mapped[str] = mapped_column(String(20), default="free")
    upi_id: Mapped[str | None] = mapped_column(String(120), default=None)
    # Shop setup: a photo of the shop front and its map pin. Required before the app opens.
    photo_file: Mapped[str | None] = mapped_column(String(80), default=None)
    latitude: Mapped[float | None] = mapped_column(Float, default=None)
    longitude: Mapped[float | None] = mapped_column(Float, default=None)
    # What customers see through their khata link.
    portal_catalog: Mapped[bool] = mapped_column(Boolean, default=True)
    portal_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    # Set by a ShopOS admin: nobody in the shop can sign in, and customer links stop working.
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    suspended_reason: Mapped[str] = mapped_column(Text, default="")
    suspended_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    next_order_number: Mapped[int] = mapped_column(Integer, default=1001)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    @property
    def setup_complete(self) -> bool:
        return bool(
            self.photo_file
            and self.latitude is not None
            and self.longitude is not None
            and self.address.strip()
        )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    # Sign-in identifiers are unique across every shop (login has no shop selector).
    email: Mapped[str | None] = mapped_column(String(254), unique=True, default=None)
    phone: Mapped[str | None] = mapped_column(String(32), default=None)
    phone_key: Mapped[str | None] = mapped_column(String(15), unique=True, default=None)
    role: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    shop: Mapped[Shop] = relationship()


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("shop_id", "role", name="uq_role_permissions_shop_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        Index(
            "uq_customers_active_phone",
            "shop_id",
            "phone_key",
            unique=True,
            sqlite_where=text("is_archived = 0"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(32))
    phone_key: Mapped[str] = mapped_column(String(15))
    address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    preferred_products: Mapped[list[str]] = mapped_column(JSON, default=list)
    promise_date: Mapped[date | None] = mapped_column(Date, default=None)
    promise_amount_paise: Mapped[int | None] = mapped_column(Integer, default=None)
    promise_note: Mapped[str] = mapped_column(Text, default="")
    # Bumped to revoke the customer's khata link; last_seen is when they last opened it.
    portal_version: Mapped[int] = mapped_column(Integer, default=0)
    portal_last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index(
            "uq_products_active_name",
            "shop_id",
            "name_key",
            unique=True,
            sqlite_where=text("is_archived = 0"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    name_key: Mapped[str] = mapped_column(String(160))  # casefolded name for uniqueness
    category: Mapped[str] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(10), default="pcs")
    sku: Mapped[str | None] = mapped_column(String(64), default=None)
    stock_quantity: Mapped[float] = mapped_column(Float, default=0.0)
    min_stock_level: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_price_paise: Mapped[int] = mapped_column(Integer, default=0)
    selling_price_paise: Mapped[int] = mapped_column(Integer, default=0)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("shop_id", "number", name="uq_orders_shop_number"),
        Index("ix_orders_shop_created", "shop_id", "created_at"),
        Index("ix_orders_shop_status", "shop_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    number: Mapped[int] = mapped_column(Integer)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="new")
    fulfillment: Mapped[str] = mapped_column(String(20), default="pickup")
    channel: Mapped[str] = mapped_column(String(20), default="walk_in")
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    delivery_address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    subtotal_paise: Mapped[int] = mapped_column(Integer, default=0)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0)
    total_paise: Mapped[int] = mapped_column(Integer, default=0)
    # Denormalised sum of non-voided payments; recomputed whenever payments change.
    paid_paise: Mapped[int] = mapped_column(Integer, default=0)
    stock_deducted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)

    customer: Mapped[Customer | None] = relationship()
    created_by: Mapped[User | None] = relationship()
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.position"
    )
    payments: Mapped[list[Payment]] = relationship(
        back_populates="order", order_by=lambda: (Payment.paid_at, Payment.id)
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    unit: Mapped[str] = mapped_column(String(10), default="pcs")
    quantity: Mapped[float] = mapped_column(Float)
    unit_price_paise: Mapped[int] = mapped_column(Integer)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0)
    line_total_paise: Mapped[int] = mapped_column(Integer)
    unit_cost_paise: Mapped[int] = mapped_column(Integer, default=0)  # purchase price snapshot
    line_cost_paise: Mapped[int] = mapped_column(Integer, default=0)

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product | None] = relationship()


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (Index("ix_payments_shop_paid", "shop_id", "paid_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    amount_paise: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text, default="")
    paid_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    received_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    batch_id: Mapped[str | None] = mapped_column(String(32), index=True, default=None)
    voided_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    voided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    order: Mapped[Order] = relationship(back_populates="payments")
    received_by: Mapped[User | None] = relationship(foreign_keys="Payment.received_by_id")
    voided_by: Mapped[User | None] = relationship(foreign_keys="Payment.voided_by_id")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"
    __table_args__ = (Index("ix_inventory_product_created", "product_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    type: Mapped[str] = mapped_column(String(20))
    quantity_change: Mapped[float] = mapped_column(Float)
    stock_after: Mapped[float] = mapped_column(Float)
    reason: Mapped[str | None] = mapped_column(String(20), default=None)
    note: Mapped[str] = mapped_column(Text, default="")
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), index=True)
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    product: Mapped[Product] = relationship()
    order: Mapped[Order | None] = relationship()
    created_by: Mapped[User | None] = relationship()


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(32))
    contact_person: Mapped[str | None] = mapped_column(String(120), default=None)
    address: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    supplies: Mapped[str] = mapped_column(Text, default="")
    opening_balance_paise: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)


class Purchase(Base):
    __tablename__ = "purchases"
    __table_args__ = (Index("ix_purchases_shop_date", "shop_id", "purchased_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    total_paise: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    purchased_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    supplier: Mapped[Supplier] = relationship()
    created_by: Mapped[User | None] = relationship()
    items: Mapped[list[PurchaseItem]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan", order_by="PurchaseItem.position"
    )


class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    purchase_id: Mapped[int] = mapped_column(ForeignKey("purchases.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    quantity: Mapped[float] = mapped_column(Float)
    unit_cost_paise: Mapped[int] = mapped_column(Integer)
    line_total_paise: Mapped[int] = mapped_column(Integer)

    purchase: Mapped[Purchase] = relationship(back_populates="items")


class SupplierPayment(Base):
    __tablename__ = "supplier_payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"), index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), index=True)
    purchase_id: Mapped[int | None] = mapped_column(ForeignKey("purchases.id"), default=None)
    amount_paise: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(20))
    note: Mapped[str] = mapped_column(Text, default="")
    paid_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (Index("ix_expenses_shop_spent", "shop_id", "spent_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    shop_id: Mapped[int] = mapped_column(ForeignKey("shops.id"))
    category: Mapped[str] = mapped_column(String(20))
    amount_paise: Mapped[int] = mapped_column(Integer)
    note: Mapped[str] = mapped_column(Text, default="")
    spent_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    created_by: Mapped[User | None] = relationship()


class Admin(Base):
    """A ShopOS developer/operator. Not part of any shop; signs in at /admin."""

    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)


class AdminAction(Base):
    """Audit trail of what admins changed: suspensions, reactivations, plan changes."""

    __tablename__ = "admin_actions"

    id: Mapped[int] = mapped_column(primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id"), index=True)
    shop_id: Mapped[int | None] = mapped_column(ForeignKey("shops.id"), index=True, default=None)
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now_utc)

    admin: Mapped[Admin] = relationship()
