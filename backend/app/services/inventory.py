"""Products, stock levels and the inventory transaction log.

Every stock change goes through ``record_stock_change`` so each one leaves an
``InventoryTransaction`` with the resulting ``stock_after``.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload

from app import schemas
from app.constants import DEFAULT_PRODUCT_CATEGORY, OPEN_STATUSES
from app.domain import stock_ratio
from app.errors import BadRequest, Conflict
from app.models import InventoryTransaction, Order, OrderItem, Product, User
from app.money import round_qty, to_paise
from app.services.common import clean_line, clean_text, get_owned
from app.timeutil import now_utc

PRODUCT_NOT_FOUND = "Product not found."
DUPLICATE_PRODUCT = "A product with this name already exists."


def get_product(db: Session, shop_id: int, product_id: int) -> Product:
    return get_owned(db, Product, shop_id, product_id, PRODUCT_NOT_FOUND)


def reserved_quantities(
    db: Session, shop_id: int, product_ids: Iterable[int] | None = None
) -> dict[int, float]:
    """Quantity of each product sitting in open (new/preparing/ready) orders."""
    query = (
        select(OrderItem.product_id, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(
            Order.shop_id == shop_id,
            Order.status.in_(OPEN_STATUSES),
            OrderItem.product_id.is_not(None),
        )
        .group_by(OrderItem.product_id)
    )
    if product_ids is not None:
        ids = sorted(set(product_ids))
        if not ids:
            return {}
        query = query.where(OrderItem.product_id.in_(ids))
    return {
        int(product_id): round_qty(total or 0)
        for product_id, total in db.execute(query).all()
        if product_id is not None
    }


def list_products(
    db: Session,
    shop_id: int,
    *,
    search: str | None = None,
    category: str | None = None,
    low_stock: bool | None = None,
    include_archived: bool = False,
    limit: int | None = None,
) -> list[Product]:
    query = select(Product).where(Product.shop_id == shop_id)
    if not include_archived:
        query = query.where(Product.is_archived.is_(False))
    term = clean_line(search)
    if term:
        query = query.where(
            or_(
                Product.name.icontains(term, autoescape=True),
                Product.sku.icontains(term, autoescape=True),
                Product.category.icontains(term, autoescape=True),
            )
        )
    wanted_category = clean_line(category)
    if wanted_category:
        query = query.where(func.lower(Product.category) == wanted_category.lower())
    if low_stock is True:
        query = query.where(
            Product.is_archived.is_(False), Product.stock_quantity <= Product.min_stock_level
        )
    elif low_stock is False:
        query = query.where(
            or_(Product.is_archived.is_(True), Product.stock_quantity > Product.min_stock_level)
        )
    query = query.order_by(Product.name_key, Product.id)
    if limit is not None:
        query = query.limit(limit)
    return list(db.scalars(query))


def low_stock_products(db: Session, shop_id: int) -> list[Product]:
    """Low-stock products, most urgent (lowest stock ratio) first."""
    products = list_products(db, shop_id, low_stock=True)
    products.sort(
        key=lambda product: (
            stock_ratio(product.stock_quantity, product.min_stock_level),
            product.name_key,
        )
    )
    return products


def categories(db: Session, shop_id: int) -> list[str]:
    names = db.scalars(
        select(Product.category)
        .where(Product.shop_id == shop_id, Product.is_archived.is_(False))
        .distinct()
    ).all()
    unique: dict[str, str] = {}
    for name in names:
        if name:
            unique.setdefault(name.casefold(), name)
    return sorted(unique.values(), key=str.casefold)


def record_stock_change(
    db: Session,
    product: Product,
    change: float,
    *,
    tx_type: str,
    at: datetime,
    user: User | None = None,
    order_id: int | None = None,
    purchase_id: int | None = None,
    reason: str | None = None,
    note: str = "",
) -> InventoryTransaction:
    product.stock_quantity = round_qty(product.stock_quantity + change)
    product.updated_at = at
    transaction = InventoryTransaction(
        shop_id=product.shop_id,
        product=product,
        type=tx_type,
        quantity_change=round_qty(change),
        stock_after=product.stock_quantity,
        reason=reason,
        note=note,
        order_id=order_id,
        purchase_id=purchase_id,
        created_by_id=user.id if user else None,
        created_at=at,
    )
    db.add(transaction)
    return transaction


def _require_name(raw: str | None) -> str:
    name = clean_line(raw)
    if not name:
        raise BadRequest("Enter the product name.")
    return name


def _ensure_name_free(db: Session, shop_id: int, name: str, *, exclude_id: int | None = None) -> None:
    query = select(Product.id).where(
        Product.shop_id == shop_id,
        Product.name_key == name.casefold(),
        Product.is_archived.is_(False),
    )
    if exclude_id is not None:
        query = query.where(Product.id != exclude_id)
    if db.scalar(query.limit(1)) is not None:
        raise Conflict(DUPLICATE_PRODUCT)


def find_by_name(db: Session, shop_id: int, name: str) -> Product | None:
    return db.scalar(
        select(Product)
        .where(
            Product.shop_id == shop_id,
            Product.name_key == clean_line(name).casefold(),
            Product.is_archived.is_(False),
        )
        .limit(1)
    )


def _price_paise(value: float | None, label: str) -> int:
    paise = to_paise(value or 0)
    if paise < 0:
        raise BadRequest(f"{label} can't be negative.")
    return paise


def _level(value: float | None, label: str) -> float:
    quantity = round_qty(value or 0)
    if quantity < 0:
        raise BadRequest(f"{label} can't be negative.")
    return quantity


def create_product(
    db: Session,
    shop_id: int,
    user: User | None,
    data: schemas.ProductInput,
    *,
    at: datetime | None = None,
) -> Product:
    at = at or now_utc()
    name = _require_name(data.name)
    _ensure_name_free(db, shop_id, name)
    opening_stock = _level(data.stock_quantity, "Opening stock")
    product = Product(
        shop_id=shop_id,
        name=name,
        name_key=name.casefold(),
        category=clean_line(data.category) or DEFAULT_PRODUCT_CATEGORY,
        unit=data.unit,
        sku=clean_line(data.sku) or None,
        stock_quantity=0.0,
        min_stock_level=_level(data.min_stock_level, "Low-stock level"),
        purchase_price_paise=_price_paise(data.purchase_price, "Purchase price"),
        selling_price_paise=_price_paise(data.selling_price, "Selling price"),
        is_archived=False,
        created_at=at,
        updated_at=at,
    )
    db.add(product)
    db.flush()
    if opening_stock:
        record_stock_change(
            db, product, opening_stock, tx_type="opening", at=at, user=user, note="Opening stock"
        )
        db.flush()
    return product


def update_product(
    db: Session, product: Product, data: schemas.ProductUpdate, *, at: datetime | None = None
) -> Product:
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        name = _require_name(data.name)
        if not product.is_archived and name.casefold() != product.name_key:
            _ensure_name_free(db, product.shop_id, name, exclude_id=product.id)
        product.name = name
        product.name_key = name.casefold()
    if "category" in fields and data.category is not None:
        product.category = clean_line(data.category) or DEFAULT_PRODUCT_CATEGORY
    if "unit" in fields and data.unit is not None:
        product.unit = data.unit
    if "sku" in fields:
        product.sku = clean_line(data.sku) or None
    if "min_stock_level" in fields and data.min_stock_level is not None:
        product.min_stock_level = _level(data.min_stock_level, "Low-stock level")
    if "purchase_price" in fields and data.purchase_price is not None:
        product.purchase_price_paise = _price_paise(data.purchase_price, "Purchase price")
    if "selling_price" in fields and data.selling_price is not None:
        product.selling_price_paise = _price_paise(data.selling_price, "Selling price")
    product.updated_at = at or now_utc()
    db.flush()
    return product


def archive_product(db: Session, product: Product, *, at: datetime | None = None) -> None:
    product.is_archived = True
    product.updated_at = at or now_utc()
    db.flush()


def adjust_stock(
    db: Session,
    product: Product,
    user: User | None,
    data: schemas.StockAdjustmentRequest,
    *,
    at: datetime | None = None,
) -> Product:
    if product.is_archived:
        raise Conflict("This product is archived, so its stock can't be changed.")
    quantity = round_qty(data.quantity)
    if data.mode == "set":
        if quantity < 0:
            raise BadRequest("The stock count can't be negative.")
        change = round_qty(quantity - product.stock_quantity)
    else:
        if quantity <= 0:
            raise BadRequest("Enter a quantity more than 0.")
        change = quantity if data.mode == "add" else -quantity
    record_stock_change(
        db,
        product,
        change,
        tx_type="adjustment",
        at=at or now_utc(),
        user=user,
        reason=data.reason,
        note=clean_text(data.note),
    )
    db.flush()
    return product


def _products_by_id(db: Session, product_ids: Iterable[int]) -> dict[int, Product]:
    ids = sorted(set(product_ids))
    if not ids:
        return {}
    return {product.id: product for product in db.scalars(select(Product).where(Product.id.in_(ids)))}


def deduct_order_stock(db: Session, order: Order, user: User | None, at: datetime) -> None:
    """One ``sale`` transaction per product line (custom items carry no stock)."""
    if order.stock_deducted:
        return
    products = _products_by_id(db, (item.product_id for item in order.items if item.product_id))
    for item in order.items:
        product = products.get(item.product_id) if item.product_id else None
        if product is not None:
            record_stock_change(
                db, product, -item.quantity, tx_type="sale", at=at, user=user, order_id=order.id
            )
    order.stock_deducted = True


def restore_order_stock(db: Session, order: Order, user: User | None, at: datetime) -> None:
    if not order.stock_deducted:
        return
    products = _products_by_id(db, (item.product_id for item in order.items if item.product_id))
    for item in order.items:
        product = products.get(item.product_id) if item.product_id else None
        if product is not None:
            record_stock_change(
                db,
                product,
                item.quantity,
                tx_type="sale_reversal",
                at=at,
                user=user,
                order_id=order.id,
            )
    order.stock_deducted = False


def product_transactions(db: Session, product: Product, *, limit: int = 100) -> list[InventoryTransaction]:
    return list(
        db.scalars(
            select(InventoryTransaction)
            .where(InventoryTransaction.product_id == product.id)
            .options(
                joinedload(InventoryTransaction.order),
                joinedload(InventoryTransaction.created_by),
            )
            .order_by(InventoryTransaction.created_at.desc(), InventoryTransaction.id.desc())
            .limit(limit)
        )
    )
