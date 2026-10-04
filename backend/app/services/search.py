"""Global search for the command palette (customers, orders, products)."""

from __future__ import annotations

from collections.abc import Collection
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.domain import EMPTY_CUSTOMER_STATS
from app.models import Order
from app.serializers import customer_out, order_out, product_out
from app.services import customers as customers_service
from app.services import inventory as inventory_service
from app.services import orders as orders_service
from app.services.common import clean_line, order_number_text
from app.timeutil import now_utc, today_ist

RESULTS_PER_GROUP = 5

CUSTOMER_READERS = frozenset({"orders", "customers", "payments"})
PRODUCT_READERS = frozenset({"orders", "inventory", "suppliers"})


def search_everything(
    db: Session,
    shop_id: int,
    permissions: Collection[str],
    query: str,
    *,
    now: datetime | None = None,
) -> schemas.SearchResults:
    """Up to 5 results per group; groups the user can't read come back empty."""
    now = now or now_utc()
    term = clean_line(query)
    results = schemas.SearchResults(customers=[], orders=[], products=[])
    if not term:
        return results
    granted = set(permissions)

    if granted & CUSTOMER_READERS:
        customers = customers_service.search_customers(db, shop_id, term, limit=RESULTS_PER_GROUP)
        stats = customers_service.customer_stats(db, shop_id, [customer.id for customer in customers])
        today = today_ist(now)
        results.customers = [
            customer_out(customer, stats.get(customer.id, EMPTY_CUSTOMER_STATS), today)
            for customer in customers
        ]

    if "orders" in granted:
        orders, _ = orders_service.list_orders(
            db, shop_id, orders_service.OrderQuery(search=term, limit=RESULTS_PER_GROUP)
        )
        number_text = order_number_text(term)
        if number_text is not None:
            exact = db.scalar(
                select(Order)
                .where(Order.shop_id == shop_id, Order.number == int(number_text))
                .options(*orders_service.ORDER_LIST_OPTIONS)
            )
            if exact is not None:
                orders = [exact, *[order for order in orders if order.id != exact.id]]
        results.orders = [order_out(order, now) for order in orders[:RESULTS_PER_GROUP]]

    if granted & PRODUCT_READERS:
        products = inventory_service.list_products(db, shop_id, search=term, limit=RESULTS_PER_GROUP)
        reserved = inventory_service.reserved_quantities(db, shop_id, [product.id for product in products])
        results.products = [product_out(product, reserved.get(product.id, 0.0)) for product in products]

    return results
