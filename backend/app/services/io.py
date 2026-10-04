"""CSV import (customers, products) and export (orders, customers, products, payments, expenses).

Imports are forgiving about headers ("Mobile", "Phone number" and "phone" all work), match
existing records (customers by phone, products by name) and report per-row problems
instead of failing the whole file. Exports open cleanly in Excel (UTF-8 BOM, CRLF) and
round-trip back through the importer.
"""

from __future__ import annotations

import csv
import io
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app import schemas
from app.constants import (
    CHANNEL_LABEL,
    EXPENSE_CATEGORY_LABEL,
    FULFILLMENT_LABEL,
    METHOD_LABEL,
    ORDER_STATUS_LABEL,
    PAYMENT_STATUS_LABEL,
    PRODUCT_UNITS,
)
from app.domain import EMPTY_CUSTOMER_STATS, is_low_stock, payment_status
from app.errors import AppError, BadRequest
from app.models import Customer, Expense, Order, Payment, User
from app.money import format_plain_amount, format_qty, multiply_paise
from app.services import customers as customers_service
from app.services import inventory as inventory_service
from app.services import orders as orders_service
from app.services import payments as payments_service
from app.services.common import clean_line, normalize_phone
from app.timeutil import format_ist, now_utc, today_ist

MAX_IMPORT_ROWS = 5000

CUSTOMER_COLUMNS: dict[str, frozenset[str]] = {
    "name": frozenset({"name", "customer", "customer name", "full name"}),
    "phone": frozenset(
        {"phone", "mobile", "phone number", "mobile number", "contact", "contact number", "whatsapp"}
    ),
    "address": frozenset({"address", "area", "locality"}),
    "notes": frozenset({"notes", "note", "remarks"}),
    "preferred_products": frozenset(
        {"preferred products", "usual items", "favourite products", "favorite products"}
    ),
}

PRODUCT_COLUMNS: dict[str, frozenset[str]] = {
    "name": frozenset({"name", "product", "product name", "item", "item name"}),
    "category": frozenset({"category", "group", "department"}),
    "unit": frozenset({"unit", "uom", "units"}),
    "sku": frozenset({"sku", "code", "item code", "barcode"}),
    "stock_quantity": frozenset(
        {"stock", "stock quantity", "stock qty", "quantity", "qty", "opening stock", "in stock"}
    ),
    "min_stock_level": frozenset(
        {"min stock", "min stock level", "minimum stock", "reorder level", "low stock level"}
    ),
    "purchase_price": frozenset({"purchase price", "cost", "cost price", "buying price"}),
    "selling_price": frozenset({"selling price", "price", "sale price", "mrp", "rate"}),
}

UNIT_ALIASES: dict[str, str] = {
    **{unit: unit for unit in PRODUCT_UNITS},
    "pc": "pcs", "piece": "pcs", "pieces": "pcs", "nos": "pcs", "no": "pcs", "unit": "pcs",
    "units": "pcs", "kgs": "kg", "kilo": "kg", "kilogram": "kg", "kilograms": "kg",
    "gm": "g", "gms": "g", "gram": "g", "grams": "g", "ltr": "l", "litre": "l", "liter": "l",
    "litres": "l", "liters": "l", "packs": "pack", "pkt": "pack", "packet": "pack",
    "packets": "pack", "dz": "dozen", "doz": "dozen", "boxes": "box",
}  # fmt: skip

_CURRENCY_NOISE = re.compile(r"(?i)(₹|rs\.?|inr|,|\s)")
_LIST_SPLIT = re.compile(r"[;|,]")
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
_NUMBER_LIKE = re.compile(r"^[+-]?[\d\s().,-]*$")


class RowProblem(Exception):
    """A single CSV row can't be imported; the message is shown to the user."""


@dataclass
class _ImportTally:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    errors: list[schemas.ImportRowError] = field(default_factory=list)

    def fail(self, row: int, message: str) -> None:
        self.skipped += 1
        self.errors.append(schemas.ImportRowError(row=row, message=message))

    def result(self) -> schemas.ImportResult:
        return schemas.ImportResult(
            created=self.created, updated=self.updated, skipped=self.skipped, errors=self.errors
        )


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------


def _normalize_header(value: str) -> str:
    cleaned = value.replace("﻿", "").replace("_", " ").replace("-", " ").strip().lower()
    return " ".join(cleaned.split())


def _read_csv(text: str) -> tuple[list[str], list[tuple[int, list[str]]]]:
    body = text.lstrip("﻿")
    if not body.strip():
        raise BadRequest("The CSV file is empty.")
    try:
        reader = csv.reader(io.StringIO(body))
        header = next(reader, None)
        rows: list[tuple[int, list[str]]] = []
        for number, row in enumerate(reader, start=1):
            if not any(cell.strip() for cell in row):
                continue  # blank lines are ignored, not counted
            rows.append((number, row))
            if len(rows) > MAX_IMPORT_ROWS:
                raise BadRequest(f"Import up to {MAX_IMPORT_ROWS:,} rows at a time.")
    except csv.Error as exc:
        raise BadRequest("This file isn't valid CSV. Save it as CSV (comma separated) and try again.") from exc
    if not header or not any(cell.strip() for cell in header):
        raise BadRequest("The CSV file needs a header row with column names.")
    return header, rows


def _map_columns(header: Sequence[str], spec: dict[str, frozenset[str]]) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for index, raw in enumerate(header):
        key = _normalize_header(raw)
        for field_name, aliases in spec.items():
            if field_name not in mapping and (key in aliases or key == field_name.replace("_", " ")):
                mapping[field_name] = index
                break
    return mapping


def _cell(row: Sequence[str], mapping: dict[str, int], field_name: str) -> str:
    index = mapping.get(field_name)
    if index is None or index >= len(row):
        return ""
    return row[index].strip()


def _money(raw: str, label: str) -> float | None:
    if not raw:
        return None
    try:
        return float(_CURRENCY_NOISE.sub("", raw))
    except ValueError as exc:
        raise RowProblem(f"{label} must be a number.") from exc


def _quantity(raw: str, label: str) -> float | None:
    if not raw:
        return None
    try:
        return float(raw.replace(",", "").strip())
    except ValueError as exc:
        raise RowProblem(f"{label} must be a number.") from exc


def _unit(raw: str) -> str | None:
    if not raw:
        return None
    unit = UNIT_ALIASES.get(raw.strip().lower().rstrip("."))
    if unit is None:
        raise RowProblem(f'Unit "{raw}" isn\'t recognised. Use pcs, kg, g, l, ml, pack, dozen or box.')
    return unit


def _row_message(exc: Exception) -> str:
    if isinstance(exc, AppError):
        return exc.detail
    if isinstance(exc, RowProblem):
        return str(exc)
    return "A value in this row is too long or not valid."


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


def import_customers(db: Session, shop_id: int, csv_text: str) -> schemas.ImportResult:
    header, rows = _read_csv(csv_text)
    columns = _map_columns(header, CUSTOMER_COLUMNS)
    if "name" not in columns or "phone" not in columns:
        raise BadRequest("Add a name column and a phone column to the CSV.")
    tally = _ImportTally()
    for number, row in rows:
        try:
            name = clean_line(_cell(row, columns, "name"))
            if not name:
                raise RowProblem("Name is missing.")
            phone_text = _cell(row, columns, "phone")
            try:
                _, phone_key = normalize_phone(phone_text)
            except BadRequest as exc:
                raise RowProblem("Phone number is missing or not valid.") from exc
            values: dict[str, Any] = {"name": name}
            for optional in ("address", "notes"):
                text = _cell(row, columns, optional)
                if text:
                    values[optional] = text
            preferred = _cell(row, columns, "preferred_products")
            if preferred:
                values["preferred_products"] = [part for part in _LIST_SPLIT.split(preferred) if part.strip()]

            existing = customers_service.find_by_phone(db, shop_id, phone_key)
            with db.begin_nested():
                if existing is not None:
                    customers_service.update_customer(db, existing, schemas.CustomerUpdate(**values))
                    tally.updated += 1
                else:
                    customers_service.create_customer(
                        db, shop_id, schemas.CustomerInput(phone=phone_text, **values)
                    )
                    tally.created += 1
        except (RowProblem, AppError, ValidationError) as exc:
            tally.fail(number, _row_message(exc))
    db.flush()
    return tally.result()


def import_products(db: Session, shop_id: int, user: User | None, csv_text: str) -> schemas.ImportResult:
    header, rows = _read_csv(csv_text)
    columns = _map_columns(header, PRODUCT_COLUMNS)
    if "name" not in columns:
        raise BadRequest("Add a name column to the CSV.")
    tally = _ImportTally()
    for number, row in rows:
        try:
            name = clean_line(_cell(row, columns, "name"))
            if not name:
                raise RowProblem("Name is missing.")
            selling = _money(_cell(row, columns, "selling_price"), "Selling price")
            purchase = _money(_cell(row, columns, "purchase_price"), "Purchase price")
            stock = _quantity(_cell(row, columns, "stock_quantity"), "Stock")
            minimum = _quantity(_cell(row, columns, "min_stock_level"), "Low-stock level")
            unit = _unit(_cell(row, columns, "unit"))
            category = _cell(row, columns, "category")
            sku = _cell(row, columns, "sku")

            existing = inventory_service.find_by_name(db, shop_id, name)
            with db.begin_nested():
                if existing is not None:
                    values: dict[str, Any] = {}
                    if category:
                        values["category"] = category
                    if unit:
                        values["unit"] = unit
                    if sku:
                        values["sku"] = sku
                    if minimum is not None:
                        values["min_stock_level"] = minimum
                    if purchase is not None:
                        values["purchase_price"] = purchase
                    if selling is not None:
                        values["selling_price"] = selling
                    inventory_service.update_product(db, existing, schemas.ProductUpdate(**values))
                    if stock is not None and stock != existing.stock_quantity:
                        inventory_service.adjust_stock(
                            db,
                            existing,
                            user,
                            schemas.StockAdjustmentRequest(
                                mode="set", quantity=stock, reason="correction", note="CSV import"
                            ),
                        )
                    tally.updated += 1
                else:
                    if selling is None:
                        raise RowProblem("Selling price is missing.")
                    inventory_service.create_product(
                        db,
                        shop_id,
                        user,
                        schemas.ProductInput(
                            name=name,
                            category=category,
                            unit=unit or "pcs",  # type: ignore[arg-type]
                            sku=sku or None,
                            stock_quantity=stock or 0,
                            min_stock_level=minimum or 0,
                            purchase_price=purchase or 0,
                            selling_price=selling,
                        ),
                    )
                    tally.created += 1
        except (RowProblem, AppError, ValidationError) as exc:
            tally.fail(number, _row_message(exc))
    db.flush()
    return tally.result()


def import_csv(db: Session, shop_id: int, user: User | None, kind: str, csv_text: str) -> schemas.ImportResult:
    if kind == "customers":
        return import_customers(db, shop_id, csv_text)
    return import_products(db, shop_id, user, csv_text)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def _safe_cell(value: object) -> str:
    """Neutralise spreadsheet formulas (CSV injection) without mangling phones/amounts."""
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_START) and not _NUMBER_LIKE.match(text):
        return "'" + text
    return text


def _export_orders(db: Session, shop_id: int) -> tuple[list[str], Iterable[list[object]]]:
    header = [
        "Order", "Date", "Customer", "Phone", "Status", "Payment", "Fulfillment", "Channel",
        "Items", "Subtotal", "Discount", "Total", "Paid", "Outstanding", "Due",
        "Delivery address", "Notes", "Created by",
    ]  # fmt: skip
    orders = db.scalars(
        select(Order)
        .where(Order.shop_id == shop_id)
        .options(*orders_service.ORDER_LIST_OPTIONS)
        .order_by(Order.created_at.desc(), Order.id.desc())
    )

    def rows() -> Iterable[list[object]]:
        for order in orders:
            items = "; ".join(f"{item.name} x {format_qty(item.quantity)}" for item in order.items)
            yield [
                f"#{order.number}",
                format_ist(order.created_at),
                order.customer.name if order.customer else "Walk-in",
                order.customer.phone if order.customer else "",
                ORDER_STATUS_LABEL.get(order.status, order.status),
                PAYMENT_STATUS_LABEL[payment_status(order.total_paise, order.paid_paise)],
                FULFILLMENT_LABEL.get(order.fulfillment, order.fulfillment),
                CHANNEL_LABEL.get(order.channel, order.channel),
                items,
                format_plain_amount(order.subtotal_paise),
                format_plain_amount(order.discount_paise),
                format_plain_amount(order.total_paise),
                format_plain_amount(order.paid_paise),
                format_plain_amount(max(order.total_paise - order.paid_paise, 0)),
                format_ist(order.due_at),
                order.delivery_address,
                order.notes,
                order.created_by.name if order.created_by else "",
            ]

    return header, rows()


def _export_customers(db: Session, shop_id: int) -> tuple[list[str], Iterable[list[object]]]:
    header = [
        "Name", "Phone", "Address", "Notes", "Preferred products", "Total purchases",
        "Total paid", "Outstanding", "Orders", "Last order", "Promise date", "Promise amount",
        "Customer since",
    ]  # fmt: skip
    customers = db.scalars(
        select(Customer)
        .where(Customer.shop_id == shop_id, Customer.is_archived.is_(False))
        .order_by(Customer.name, Customer.id)
    ).all()
    stats = customers_service.customer_stats(db, shop_id)

    def rows() -> Iterable[list[object]]:
        for customer in customers:
            info = stats.get(customer.id, EMPTY_CUSTOMER_STATS)
            yield [
                customer.name,
                customer.phone,
                customer.address,
                customer.notes,
                "; ".join(customer.preferred_products or []),
                format_plain_amount(info.purchases_paise),
                format_plain_amount(info.paid_paise),
                format_plain_amount(info.outstanding_paise),
                info.orders_count,
                format_ist(info.last_order_at),
                customer.promise_date.isoformat() if customer.promise_date else "",
                format_plain_amount(customer.promise_amount_paise)
                if customer.promise_amount_paise is not None
                else "",
                format_ist(customer.created_at),
            ]

    return header, rows()


def _export_products(db: Session, shop_id: int) -> tuple[list[str], Iterable[list[object]]]:
    header = [
        "Name", "Category", "Unit", "SKU", "Stock", "Min stock", "Purchase price",
        "Selling price", "Stock value", "Low stock",
    ]  # fmt: skip
    products = inventory_service.list_products(db, shop_id)

    def rows() -> Iterable[list[object]]:
        for product in products:
            yield [
                product.name,
                product.category,
                product.unit,
                product.sku or "",
                format_qty(product.stock_quantity),
                format_qty(product.min_stock_level),
                format_plain_amount(product.purchase_price_paise),
                format_plain_amount(product.selling_price_paise),
                format_plain_amount(
                    multiply_paise(product.stock_quantity, product.purchase_price_paise)
                ),
                "Yes"
                if is_low_stock(product.stock_quantity, product.min_stock_level, product.is_archived)
                else "No",
            ]

    return header, rows()


def _export_payments(db: Session, shop_id: int) -> tuple[list[str], Iterable[list[object]]]:
    header = ["Date", "Order", "Customer", "Phone", "Method", "Amount", "Note", "Received by", "Batch"]
    payments = db.scalars(
        select(Payment)
        .where(Payment.shop_id == shop_id, Payment.voided_at.is_(None))
        .options(*payments_service.PAYMENT_LIST_OPTIONS)
        .order_by(Payment.paid_at.desc(), Payment.id.desc())
    )

    def rows() -> Iterable[list[object]]:
        for payment in payments:
            customer = payment.order.customer
            yield [
                format_ist(payment.paid_at),
                f"#{payment.order.number}",
                customer.name if customer else "Walk-in",
                customer.phone if customer else "",
                METHOD_LABEL.get(payment.method, payment.method),
                format_plain_amount(payment.amount_paise),
                payment.note,
                payment.received_by.name if payment.received_by else "",
                payment.batch_id or "",
            ]

    return header, rows()


def _export_expenses(db: Session, shop_id: int) -> tuple[list[str], Iterable[list[object]]]:
    header = ["Date", "Category", "Amount", "Note", "Added by"]
    expenses = db.scalars(
        select(Expense)
        .where(Expense.shop_id == shop_id)
        .options(joinedload(Expense.created_by))
        .order_by(Expense.spent_at.desc(), Expense.id.desc())
    )

    def rows() -> Iterable[list[object]]:
        for expense in expenses:
            yield [
                format_ist(expense.spent_at),
                EXPENSE_CATEGORY_LABEL.get(expense.category, expense.category),
                format_plain_amount(expense.amount_paise),
                expense.note,
                expense.created_by.name if expense.created_by else "",
            ]

    return header, rows()


EXPORTERS = {
    "orders": _export_orders,
    "customers": _export_customers,
    "products": _export_products,
    "payments": _export_payments,
    "expenses": _export_expenses,
}


def export_csv(db: Session, shop_id: int, kind: str, *, now: datetime | None = None) -> tuple[str, str]:
    """Return (filename, CSV text) for ``kind``."""
    header, rows = EXPORTERS[kind](db, shop_id)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([_safe_cell(value) for value in row])
    filename = f"shopos-{kind}-{today_ist(now or now_utc()).isoformat()}.csv"
    return filename, buffer.getvalue()

