"""The "Today" dashboard and the attention-required queue."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, Select, String, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from app import schemas
from app.domain import SEVERITY_RANK, is_overdue, pluralize, supplier_outstanding
from app.models import Customer, Order, Product, User
from app.money import to_rupees
from app.serializers import order_out, product_out
from app.services import customers as customers_service
from app.services import expenses as expenses_service
from app.services import inventory as inventory_service
from app.services import orders as orders_service
from app.services import payments as payments_service
from app.services import suppliers as suppliers_service
from app.timeutil import IST_SQLITE_MODIFIER, ist_day_bounds, ist_day_start, now_utc, today_ist

DASHBOARD_PICKUPS = 6
DASHBOARD_RECENT_ORDERS = 8
DASHBOARD_LOW_STOCK = 5


def ist_day(column: InstrumentedAttribute[datetime]) -> ColumnElement[str]:
    """SQLite expression for the IST calendar date (YYYY-MM-DD) of a stored UTC timestamp."""
    return func.date(column, IST_SQLITE_MODIFIER, type_=String)


def sales_between(db: Session, shop_id: int, start: datetime, end: datetime) -> tuple[int, int]:
    """(sales paise, order count) of non-cancelled orders created within [start, end)."""
    total, count = db.execute(
        select(func.coalesce(func.sum(Order.total_paise), 0), func.count(Order.id)).where(
            Order.shop_id == shop_id,
            Order.status != "cancelled",
            Order.created_at >= start,
            Order.created_at < end,
        )
    ).one()
    return int(total), int(count)


def daily_sales(
    db: Session, shop_id: int, first_day: date, last_day: date
) -> dict[date, tuple[int, int]]:
    day = ist_day(Order.created_at)
    rows = db.execute(
        select(day, func.sum(Order.total_paise), func.count(Order.id))
        .where(
            Order.shop_id == shop_id,
            Order.status != "cancelled",
            Order.created_at >= ist_day_start(first_day),
            Order.created_at < ist_day_start(last_day + timedelta(days=1)),
        )
        .group_by(day)
    ).all()
    return {date.fromisoformat(day_text): (int(total or 0), int(count)) for day_text, total, count in rows}


def _attention(
    key: str,
    label: str,
    count: int,
    severity: str,
    href: str,
    *,
    amount_paise: int | None = None,
    detail: str | None = None,
) -> schemas.AttentionItem:
    return schemas.AttentionItem(
        key=key,  # type: ignore[arg-type]
        label=label,
        count=count,
        amount=None if amount_paise is None else to_rupees(amount_paise),
        detail=detail,
        severity=severity,  # type: ignore[arg-type]
        href=href,
    )


def attention_items(
    db: Session,
    shop_id: int,
    *,
    now: datetime | None = None,
    pickups: list[Order] | None = None,
    deliveries: list[Order] | None = None,
    low_products: list[Product] | None = None,
    dues: dict[int, int] | None = None,
) -> list[schemas.AttentionItem]:
    """Things that need the shopkeeper today, most severe first (only non-empty items)."""
    now = now or now_utc()
    today = today_ist(now)
    pickups = pickups if pickups is not None else orders_service.open_orders(db, shop_id, "pickup")
    deliveries = (
        deliveries if deliveries is not None else orders_service.open_orders(db, shop_id, "delivery")
    )
    low_products = (
        low_products if low_products is not None else inventory_service.low_stock_products(db, shop_id)
    )
    dues = dues if dues is not None else customers_service.dues_by_customer(db, shop_id)
    items: list[schemas.AttentionItem] = []

    if pickups:
        overdue = sum(1 for order in pickups if is_overdue(order.due_at, order.status, now))
        any_ready = any(order.status == "ready" for order in pickups)
        items.append(
            _attention(
                "pickups",
                pluralize(len(pickups), "order waiting for pickup", "orders waiting for pickup"),
                len(pickups),
                "high" if overdue or any_ready else "medium",
                "/app/pickups",
                detail=f"{overdue} overdue" if overdue else None,
            )
        )

    ready_unpaid = [
        order
        for order in (*pickups, *deliveries)
        if order.status == "ready" and order.total_paise > order.paid_paise
    ]
    if ready_unpaid:
        items.append(
            _attention(
                "ready_unpaid",
                pluralize(len(ready_unpaid), "ready order not yet paid", "ready orders not yet paid"),
                len(ready_unpaid),
                "medium",
                "/app/pickups",
                amount_paise=sum(order.total_paise - order.paid_paise for order in ready_unpaid),
            )
        )

    if dues:
        items.append(
            _attention(
                "customer_dues",
                "customer dues",
                len(dues),
                "high",
                "/app/customers?filter=dues",
                amount_paise=sum(dues.values()),
                detail=f"across {len(dues)} {pluralize(len(dues), 'customer', 'customers')}",
            )
        )

    promised = db.scalars(
        select(Customer).where(
            Customer.shop_id == shop_id,
            Customer.is_archived.is_(False),
            Customer.promise_date.is_not(None),
            Customer.promise_date < today,
        )
    ).all()
    overdue_promises = [customer for customer in promised if dues.get(customer.id, 0) > 0]
    if overdue_promises:
        promised_paise = sum(
            min(customer.promise_amount_paise, dues[customer.id])
            if customer.promise_amount_paise
            else dues[customer.id]
            for customer in overdue_promises
        )
        items.append(
            _attention(
                "promises",
                pluralize(
                    len(overdue_promises), "payment promise overdue", "payment promises overdue"
                ),
                len(overdue_promises),
                "high",
                "/app/customers?filter=promises",
                amount_paise=promised_paise,
            )
        )

    if low_products:
        out_of_stock = sum(1 for product in low_products if product.stock_quantity <= 0)
        items.append(
            _attention(
                "low_stock",
                pluralize(len(low_products), "product running low", "products running low"),
                len(low_products),
                "medium",
                "/app/products?filter=low",
                detail=f"{out_of_stock} out of stock" if out_of_stock else None,
            )
        )

    if deliveries:
        overdue = sum(1 for order in deliveries if is_overdue(order.due_at, order.status, now))
        items.append(
            _attention(
                "deliveries",
                pluralize(len(deliveries), "delivery pending", "deliveries pending"),
                len(deliveries),
                "high" if overdue else "medium",
                "/app/pickups?tab=deliveries",
                detail=f"{overdue} overdue" if overdue else None,
            )
        )

    supplier_dues = [
        supplier_outstanding(supplier.opening_balance_paise, stats)
        for supplier, stats in suppliers_service.list_suppliers(db, shop_id)
    ]
    supplier_dues = [amount for amount in supplier_dues if amount > 0]
    if supplier_dues:
        items.append(
            _attention(
                "supplier_dues",
                pluralize(len(supplier_dues), "supplier payment due", "supplier payments due"),
                len(supplier_dues),
                "low",
                "/app/suppliers?filter=due",
                amount_paise=sum(supplier_dues),
            )
        )

    items.sort(key=lambda item: SEVERITY_RANK[item.severity])  # stable: keeps table order
    return items


def _has_rows(db: Session, query: Select[tuple[int]]) -> bool:
    return db.scalar(query.limit(1)) is not None


def setup_progress(db: Session, shop_id: int) -> schemas.SetupProgress:
    return schemas.SetupProgress(
        has_products=_has_rows(
            db, select(Product.id).where(Product.shop_id == shop_id, Product.is_archived.is_(False))
        ),
        has_customers=_has_rows(
            db,
            select(Customer.id).where(Customer.shop_id == shop_id, Customer.is_archived.is_(False)),
        ),
        has_orders=_has_rows(db, select(Order.id).where(Order.shop_id == shop_id)),
        has_staff=_has_rows(db, select(User.id).where(User.shop_id == shop_id, User.role != "owner")),
    )


def build_dashboard(db: Session, shop_id: int, *, now: datetime | None = None) -> schemas.Dashboard:
    now = now or now_utc()
    today = today_ist(now)
    today_start, today_end = ist_day_bounds(today)
    yesterday_start, yesterday_end = ist_day_bounds(today - timedelta(days=1))

    sales_today, orders_today = sales_between(db, shop_id, today_start, today_end)
    sales_yesterday, orders_yesterday = sales_between(db, shop_id, yesterday_start, yesterday_end)
    pickups = orders_service.open_orders(db, shop_id, "pickup")
    deliveries = orders_service.open_orders(db, shop_id, "delivery")
    low_products = inventory_service.low_stock_products(db, shop_id)
    dues = customers_service.dues_by_customer(db, shop_id)

    metrics = schemas.DashboardMetrics(
        sales=to_rupees(sales_today),
        orders=orders_today,
        payments_received=to_rupees(
            payments_service.received_between(db, shop_id, today_start, today_end)
        ),
        outstanding=to_rupees(sum(dues.values())),
        pending_pickups=len(pickups),
        pending_deliveries=len(deliveries),
        low_stock=len(low_products),
        expenses=to_rupees(expenses_service.total_between(db, shop_id, today_start, today_end)),
        yesterday_sales=to_rupees(sales_yesterday),
        yesterday_orders=orders_yesterday,
        yesterday_payments=to_rupees(
            payments_service.received_between(db, shop_id, yesterday_start, yesterday_end)
        ),
    )

    first_day = today - timedelta(days=6)
    daily = daily_sales(db, shop_id, first_day, today)
    sales_7d = []
    for offset in range(7):
        day = first_day + timedelta(days=offset)
        total, count = daily.get(day, (0, 0))
        sales_7d.append(schemas.DailyPoint(date=day, sales=to_rupees(total), orders=count))

    top_low = low_products[:DASHBOARD_LOW_STOCK]
    reserved = inventory_service.reserved_quantities(db, shop_id, [product.id for product in top_low])
    return schemas.Dashboard(
        date=today,
        metrics=metrics,
        attention=attention_items(
            db,
            shop_id,
            now=now,
            pickups=pickups,
            deliveries=deliveries,
            low_products=low_products,
            dues=dues,
        ),
        pickups=[order_out(order, now) for order in pickups[:DASHBOARD_PICKUPS]],
        recent_orders=[
            order_out(order, now)
            for order in orders_service.recent_orders(db, shop_id, limit=DASHBOARD_RECENT_ORDERS)
        ],
        low_stock=[product_out(product, reserved.get(product.id, 0.0)) for product in top_low],
        sales_7d=sales_7d,
        setup=setup_progress(db, shop_id),
    )
