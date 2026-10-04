"""Suppliers, purchases (stock in) and supplier payments.

Supplier outstanding = opening balance + purchase totals - supplier payments.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app import schemas
from app.domain import EMPTY_SUPPLIER_STATS, SupplierStats, supplier_outstanding
from app.errors import BadRequest, NotFound
from app.models import Product, Purchase, PurchaseItem, Supplier, SupplierPayment, User
from app.money import format_inr, multiply_paise, round_qty, to_paise
from app.services import inventory as inventory_service
from app.services.common import clean_line, clean_text, get_owned, normalize_phone
from app.timeutil import now_utc

SUPPLIER_NOT_FOUND = "Supplier not found."

PURCHASE_OPTIONS = (
    selectinload(Purchase.items),
    joinedload(Purchase.supplier),
    joinedload(Purchase.created_by),
)


def get_supplier(db: Session, shop_id: int, supplier_id: int) -> Supplier:
    return get_owned(db, Supplier, shop_id, supplier_id, SUPPLIER_NOT_FOUND)


def supplier_stats(
    db: Session, shop_id: int, supplier_ids: Iterable[int] | None = None
) -> dict[int, SupplierStats]:
    purchase_query = (
        select(Purchase.supplier_id, func.sum(Purchase.total_paise), func.max(Purchase.purchased_at))
        .where(Purchase.shop_id == shop_id)
        .group_by(Purchase.supplier_id)
    )
    payment_query = (
        select(SupplierPayment.supplier_id, func.sum(SupplierPayment.amount_paise))
        .where(SupplierPayment.shop_id == shop_id)
        .group_by(SupplierPayment.supplier_id)
    )
    if supplier_ids is not None:
        ids = sorted(set(supplier_ids))
        if not ids:
            return {}
        purchase_query = purchase_query.where(Purchase.supplier_id.in_(ids))
        payment_query = payment_query.where(SupplierPayment.supplier_id.in_(ids))

    purchases = {
        int(supplier_id): (int(total or 0), last_at)
        for supplier_id, total, last_at in db.execute(purchase_query).all()
    }
    payments = {
        int(supplier_id): int(total or 0) for supplier_id, total in db.execute(payment_query).all()
    }
    return {
        supplier_id: SupplierStats(
            purchased_paise=purchases.get(supplier_id, (0, None))[0],
            paid_paise=payments.get(supplier_id, 0),
            last_purchase_at=purchases.get(supplier_id, (0, None))[1],
        )
        for supplier_id in set(purchases) | set(payments)
    }


def stats_for(db: Session, supplier: Supplier) -> SupplierStats:
    return supplier_stats(db, supplier.shop_id, [supplier.id]).get(supplier.id, EMPTY_SUPPLIER_STATS)


def outstanding_for(db: Session, supplier: Supplier) -> int:
    return supplier_outstanding(supplier.opening_balance_paise, stats_for(db, supplier))


def list_suppliers(
    db: Session, shop_id: int, *, due_only: bool = False
) -> list[tuple[Supplier, SupplierStats]]:
    suppliers = db.scalars(
        select(Supplier).where(Supplier.shop_id == shop_id).order_by(func.lower(Supplier.name), Supplier.id)
    ).all()
    stats = supplier_stats(db, shop_id)
    rows = [(supplier, stats.get(supplier.id, EMPTY_SUPPLIER_STATS)) for supplier in suppliers]
    if due_only:
        rows = [
            row for row in rows if supplier_outstanding(row[0].opening_balance_paise, row[1]) > 0
        ]
    return rows


def _require_name(raw: str | None) -> str:
    name = clean_line(raw)
    if not name:
        raise BadRequest("Enter the supplier's name.")
    return name


def create_supplier(
    db: Session, shop_id: int, data: schemas.SupplierInput, *, at: datetime | None = None
) -> Supplier:
    at = at or now_utc()
    opening = to_paise(data.opening_balance or 0)
    if opening < 0:
        raise BadRequest("The opening balance can't be negative.")
    phone, _ = normalize_phone(data.phone, missing_message="Enter the supplier's phone number.")
    supplier = Supplier(
        shop_id=shop_id,
        name=_require_name(data.name),
        phone=phone,
        contact_person=clean_line(data.contact_person) or None,
        address=clean_text(data.address),
        notes=clean_text(data.notes),
        supplies=clean_text(data.supplies),
        opening_balance_paise=opening,
        created_at=at,
        updated_at=at,
    )
    db.add(supplier)
    db.flush()
    return supplier


def update_supplier(
    db: Session, supplier: Supplier, data: schemas.SupplierUpdate, *, at: datetime | None = None
) -> Supplier:
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        supplier.name = _require_name(data.name)
    if "phone" in fields and data.phone is not None:
        supplier.phone, _ = normalize_phone(
            data.phone, missing_message="Enter the supplier's phone number."
        )
    if "contact_person" in fields:
        supplier.contact_person = clean_line(data.contact_person) or None
    if "address" in fields:
        supplier.address = clean_text(data.address)
    if "notes" in fields:
        supplier.notes = clean_text(data.notes)
    if "supplies" in fields:
        supplier.supplies = clean_text(data.supplies)
    supplier.updated_at = at or now_utc()
    db.flush()
    return supplier


def supplier_purchases(db: Session, supplier: Supplier) -> list[Purchase]:
    return list(
        db.scalars(
            select(Purchase)
            .where(Purchase.supplier_id == supplier.id)
            .options(*PURCHASE_OPTIONS)
            .order_by(Purchase.purchased_at.desc(), Purchase.id.desc())
        )
    )


def supplier_payments(db: Session, supplier: Supplier) -> list[SupplierPayment]:
    return list(
        db.scalars(
            select(SupplierPayment)
            .where(SupplierPayment.supplier_id == supplier.id)
            .order_by(SupplierPayment.paid_at.desc(), SupplierPayment.id.desc())
        )
    )


def list_purchases(db: Session, shop_id: int, *, limit: int = 100) -> list[Purchase]:
    return list(
        db.scalars(
            select(Purchase)
            .where(Purchase.shop_id == shop_id)
            .options(*PURCHASE_OPTIONS)
            .order_by(Purchase.purchased_at.desc(), Purchase.id.desc())
            .limit(limit)
        )
    )


def load_purchase(db: Session, purchase_id: int) -> Purchase:
    purchase = db.scalar(
        select(Purchase)
        .where(Purchase.id == purchase_id)
        .options(*PURCHASE_OPTIONS)
        .execution_options(populate_existing=True)
    )
    if purchase is None:
        raise NotFound("Purchase not found.")
    return purchase


def record_supplier_payment(
    db: Session,
    shop_id: int,
    user: User | None,
    supplier: Supplier,
    amount_paise: int,
    method: str,
    *,
    note: str = "",
    at: datetime | None = None,
    purchase_id: int | None = None,
) -> SupplierPayment:
    at = at or now_utc()
    if amount_paise <= 0:
        raise BadRequest("Enter an amount more than ₹0.")
    due = outstanding_for(db, supplier)
    if due <= 0:
        raise BadRequest("You don't owe this supplier anything right now.")
    if amount_paise > due:
        raise BadRequest(f"Amount is more than the {format_inr(due)} you owe this supplier.")
    payment = SupplierPayment(
        shop_id=shop_id,
        supplier_id=supplier.id,
        purchase_id=purchase_id,
        amount_paise=amount_paise,
        method=method,
        note=note.strip(),
        paid_at=at,
        created_by_id=user.id if user else None,
        created_at=at,
    )
    db.add(payment)
    db.flush()
    return payment


def create_purchase(
    db: Session,
    shop_id: int,
    user: User | None,
    supplier: Supplier,
    data: schemas.PurchaseCreate,
    *,
    at: datetime | None = None,
) -> Purchase:
    """Stock in from a supplier; optionally pay now and refresh the products' cost price."""
    at = at or now_utc()
    if not data.items:
        raise BadRequest("Add at least one item to the purchase.")
    product_ids = {item.product_id for item in data.items}
    products = {
        product.id: product
        for product in db.scalars(
            select(Product).where(Product.shop_id == shop_id, Product.id.in_(product_ids))
        )
    }

    lines: list[tuple[Product, float, int, int]] = []
    for item in data.items:
        product = products.get(item.product_id)
        if product is None:
            raise NotFound(inventory_service.PRODUCT_NOT_FOUND)
        if product.is_archived:
            raise BadRequest(f"{product.name} is archived and can't be purchased.")
        quantity = round_qty(item.quantity)
        if quantity <= 0:
            raise BadRequest(f"Enter a quantity more than 0 for {product.name}.")
        unit_cost = to_paise(item.unit_cost)
        if unit_cost < 0:
            raise BadRequest(f"The cost of {product.name} can't be negative.")
        lines.append((product, quantity, unit_cost, multiply_paise(quantity, unit_cost)))

    total = sum(line_total for _, _, _, line_total in lines)
    paid = to_paise(data.paid_amount or 0)
    if paid < 0:
        raise BadRequest("The paid amount can't be negative.")
    if paid > total:
        raise BadRequest(f"The paid amount is more than the {format_inr(total)} purchase total.")
    if paid > 0 and data.method is None:
        raise BadRequest("Choose how you paid the supplier.")

    purchase = Purchase(
        shop_id=shop_id,
        supplier=supplier,
        total_paise=total,
        note=clean_text(data.note),
        purchased_at=at,
        created_by=user,
        created_at=at,
    )
    purchase.items = [
        PurchaseItem(
            position=position,
            product_id=product.id,
            name=product.name,
            quantity=quantity,
            unit_cost_paise=unit_cost,
            line_total_paise=line_total,
        )
        for position, (product, quantity, unit_cost, line_total) in enumerate(lines)
    ]
    db.add(purchase)
    db.flush()

    for product, quantity, unit_cost, _ in lines:
        inventory_service.record_stock_change(
            db,
            product,
            quantity,
            tx_type="purchase",
            at=at,
            user=user,
            purchase_id=purchase.id,
            note=f"From {supplier.name}",
        )
        if data.update_cost_price:
            product.purchase_price_paise = unit_cost
    db.flush()

    if paid > 0 and data.method is not None:
        record_supplier_payment(
            db,
            shop_id,
            user,
            supplier,
            paid,
            data.method,
            note="Paid with purchase",
            at=at,
            purchase_id=purchase.id,
        )
    return purchase
