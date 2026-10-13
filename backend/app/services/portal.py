"""The customer side: what a customer sees and does through the khata link their shop shares.

A link is ``/c/<token>`` where the token is signed with the server's secret (see
``security.create_portal_token``). Nothing secret is stored, the shop can share the same link as
often as it likes, and "Reset link" (a new ``portal_version``) turns every earlier link off.
"""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app import db as database
from app import schemas
from app.config import settings
from app.errors import BadRequest, Forbidden, NotFound, TooManyRequests
from app.models import Customer, Order, Product, Shop
from app.money import round_qty, to_rupees
from app.security import create_portal_token, portal_order_limiter, read_portal_token
from app.serializers import order_out
from app.services import customers as customers_service
from app.services import inventory as inventory_service
from app.services import media
from app.services import orders as orders_service
from app.timeutil import now_utc

LINK_NOT_VALID = "This khata link doesn't work any more. Ask the shop to send you a new one."
SHOP_UNAVAILABLE = "This shop isn't available on ShopOS right now."
CATALOG_OFF = "This shop isn't showing its products here."
ORDERS_OFF = "This shop isn't taking orders here right now. Call the shop instead."
TOO_MANY_ORDERS = "You've sent a lot of orders in the last hour. Call the shop, or try again later."
PRODUCT_GONE = "One of these products isn't sold here any more. Refresh the list and try again."
MAX_LINE_QUANTITY = 1000
SEEN_EVERY = timedelta(minutes=5)

logger = logging.getLogger("shopos")
LEDGER_LIMIT = 100
ORDERS_LIMIT = 50


# ---------------------------------------------------------------------------
# Links (shopkeeper side)
# ---------------------------------------------------------------------------


def link_for(customer: Customer) -> schemas.PortalLink:
    token = create_portal_token(
        customer_id=customer.id, version=customer.portal_version, secret=settings.secret_key
    )
    return schemas.PortalLink(token=token, path=f"/c/{token}", last_seen_at=customer.portal_last_seen_at)


def reset_link(customer: Customer) -> schemas.PortalLink:
    customer.portal_version += 1
    return link_for(customer)


# ---------------------------------------------------------------------------
# What the customer sees
# ---------------------------------------------------------------------------


def resolve(db: Session, token: str) -> tuple[Customer, Shop]:
    parsed = read_portal_token(token, settings.secret_key)
    if parsed is None:
        raise NotFound(LINK_NOT_VALID)
    customer_id, version = parsed
    customer = db.get(Customer, customer_id)
    if customer is None or customer.is_archived or customer.portal_version != version:
        raise NotFound(LINK_NOT_VALID)
    shop = db.get(Shop, customer.shop_id)
    if shop is None or shop.is_suspended:
        raise NotFound(SHOP_UNAVAILABLE)
    return customer, shop


def _shop_out(shop: Shop) -> schemas.PortalShop:
    return schemas.PortalShop(
        code=shop.code or "",
        name=shop.name,
        phone=shop.phone,
        address=shop.address,
        city=shop.city,
        photo_url=media.photo_url(shop.photo_file),
        latitude=shop.latitude,
        longitude=shop.longitude,
        upi_id=shop.upi_id,
        catalog_enabled=shop.portal_catalog,
        orders_enabled=shop.portal_orders,
    )


def portal_order_out(order: Order, now: datetime | None = None) -> schemas.PortalOrder:
    full = order_out(order, now)
    return schemas.PortalOrder(
        id=full.id,
        number=full.number,
        status=full.status,
        payment_status=full.payment_status,
        fulfillment=full.fulfillment,
        channel=full.channel,
        total=full.total,
        paid=full.paid,
        outstanding=full.outstanding,
        due_at=full.due_at,
        created_at=full.created_at,
        completed_at=full.completed_at,
        items=[
            schemas.PortalOrderItem(
                name=item.name,
                unit=item.unit,
                quantity=item.quantity,
                unit_price=item.unit_price,
                line_total=item.line_total,
            )
            for item in full.items
        ],
    )


def _write_session() -> Session:
    return database.SessionLocal()


def note_seen(customer_id: int, last_seen: datetime | None, now: datetime | None = None) -> None:
    """Notes when the customer last opened their link, for the shopkeeper. Best effort: its own short
    write, at most every few minutes, and a busy database just skips it. Opening the page is a read,
    so two tabs (or a quick reload) never turn it into a write conflict."""
    now = now or now_utc()
    if last_seen is not None and now - last_seen < SEEN_EVERY:
        return
    try:
        with _write_session() as db:
            db.connection(execution_options={database.BEGIN_MODE_OPTION: "IMMEDIATE"})
            db.execute(update(Customer).where(Customer.id == customer_id).values(portal_last_seen_at=now))
            db.commit()
    except OperationalError as exc:
        logger.warning("Couldn't note that customer %s opened their khata link: %s", customer_id, exc)


def view(db: Session, customer: Customer, shop: Shop) -> schemas.PortalView:
    """The customer's page (read only; see ``note_seen`` for "last opened")."""
    now = now_utc()
    ledger = customers_service.ledger(db, customer)
    orders = db.scalars(
        select(Order)
        .where(Order.shop_id == shop.id, Order.customer_id == customer.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .limit(ORDERS_LIMIT)
    )
    return schemas.PortalView(
        shop=_shop_out(shop),
        customer=schemas.PortalCustomer(
            name=customer.name,
            phone=customer.phone,
            outstanding=ledger.outstanding,
            promise_date=customer.promise_date,
            promise_amount=(
                to_rupees(customer.promise_amount_paise)
                if customer.promise_amount_paise is not None
                else None
            ),
        ),
        ledger=ledger.entries[-LEDGER_LIMIT:],
        orders=[portal_order_out(order, now) for order in orders],
    )


def products(db: Session, shop: Shop) -> list[schemas.PortalProduct]:
    if not shop.portal_catalog:
        raise Forbidden(CATALOG_OFF)
    rows = inventory_service.list_products(db, shop.id)
    reserved = inventory_service.reserved_quantities(db, shop.id, [product.id for product in rows])
    return [
        schemas.PortalProduct(
            id=product.id,
            name=product.name,
            category=product.category,
            unit=product.unit,
            price=to_rupees(product.selling_price_paise),
            in_stock=product.stock_quantity - reserved.get(product.id, 0.0) > 0,
        )
        for product in rows
    ]


def place_order(
    db: Session, customer: Customer, shop: Shop, data: schemas.PortalOrderCreate
) -> Order:
    """A new, unpaid order from the customer. It lands in the shop's Orders and Pickups as New."""
    if not shop.portal_orders:
        raise Forbidden(ORDERS_OFF)
    limit_key = f"customer:{customer.id}"
    if portal_order_limiter.is_blocked(limit_key):
        raise TooManyRequests(TOO_MANY_ORDERS)

    wanted: dict[int, float] = defaultdict(float)
    for line in data.items:
        wanted[line.product_id] += line.quantity
    rows = {
        product.id: product
        for product in db.scalars(
            select(Product).where(
                Product.shop_id == shop.id,
                Product.id.in_(list(wanted)),
                Product.is_archived.is_(False),
            )
        )
    }
    reserved = inventory_service.reserved_quantities(db, shop.id, list(wanted))
    items: list[schemas.OrderItemInput] = []
    for product_id, raw_quantity in wanted.items():
        product = rows.get(product_id)
        if product is None:
            raise BadRequest(PRODUCT_GONE)
        quantity = round_qty(raw_quantity)
        if quantity <= 0:
            raise BadRequest(f"Enter a quantity more than 0 for {product.name}.")
        if quantity > MAX_LINE_QUANTITY:
            raise BadRequest(f"That's a lot of {product.name}. Call the shop for large orders.")
        available = round_qty(product.stock_quantity - reserved.get(product_id, 0.0))
        if available <= 0:
            raise BadRequest(f"{product.name} is out of stock.")
        if quantity > available:
            raise BadRequest(f"Only {available:g} {product.unit} of {product.name} is left.")
        items.append(schemas.OrderItemInput(product_id=product_id, quantity=quantity))

    address = (data.delivery_address or "").strip() or customer.address.strip()
    if data.fulfillment == "delivery" and not address:
        raise BadRequest("Add the address to deliver to.")

    order = orders_service.create_order(
        db,
        shop.id,
        None,
        schemas.OrderCreate(
            customer_id=customer.id,
            items=items,
            fulfillment=data.fulfillment,
            channel="online",
            status="new",
            delivery_address=address if data.fulfillment == "delivery" else None,
            notes=data.notes,
        ),
    )
    portal_order_limiter.record_failure(limit_key)  # counts orders, despite the method's name
    return order
