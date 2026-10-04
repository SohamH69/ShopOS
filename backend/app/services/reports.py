"""Business reports for the last 7 / 30 / 90 days or 12 months (IST calendar)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app import schemas
from app.constants import CUSTOM_ITEM_CATEGORY
from app.models import Customer, Order, OrderItem, Product
from app.money import divide_paise, round_qty, to_rupees
from app.serializers import product_out
from app.services import customers as customers_service
from app.services import expenses as expenses_service
from app.services import inventory as inventory_service
from app.services import payments as payments_service
from app.services.dashboard import daily_sales, sales_between
from app.timeutil import (
    add_months,
    ist_day_start,
    month_label,
    month_start,
    now_utc,
    short_day_label,
    today_ist,
    week_start,
)

RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}
RANGE_BUCKET = {"7d": "day", "30d": "day", "90d": "week", "12m": "month"}
TOP_PRODUCTS = 15
TOP_CUSTOMERS = 8
CUSTOMERS_WITH_DUES = 10
MOVEMENT_ROWS = 8


def report_window(range_: str, today: date) -> tuple[date, date, str]:
    if range_ == "12m":
        date_from = add_months(month_start(today), -11)
    else:
        date_from = today - timedelta(days=RANGE_DAYS[range_] - 1)
    return date_from, today, RANGE_BUCKET[range_]


def _bucket_key(day: date, bucket: str) -> date:
    if bucket == "week":
        return week_start(day)
    if bucket == "month":
        return month_start(day)
    return day


def _bucket_starts(date_from: date, date_to: date, bucket: str) -> list[date]:
    starts: list[date] = []
    current = _bucket_key(date_from, bucket)
    while current <= date_to:
        starts.append(current)
        if bucket == "day":
            current += timedelta(days=1)
        elif bucket == "week":
            current += timedelta(days=7)
        else:
            current = add_months(current, 1)
    return starts


def _bucket_label(start: date, bucket: str) -> str:
    if bucket == "week":
        return f"Week of {short_day_label(start)}"
    if bucket == "month":
        return month_label(start)
    return short_day_label(start)


@dataclass
class _ItemSales:
    product_id: int | None
    name: str
    category: str
    quantity: float
    sales_paise: int
    profit_paise: int


def _item_sales(
    db: Session, conditions: list[ColumnElement[bool]], products: dict[int, Product]
) -> list[_ItemSales]:
    """Sales per product (current name/category) plus custom lines grouped by name."""
    totals = (
        func.sum(OrderItem.quantity),
        func.sum(OrderItem.line_total_paise),
        func.sum(OrderItem.line_total_paise - OrderItem.line_cost_paise),
    )
    product_rows = db.execute(
        select(OrderItem.product_id, func.min(OrderItem.name), *totals)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*conditions, OrderItem.product_id.is_not(None))
        .group_by(OrderItem.product_id)
    ).all()
    custom_rows = db.execute(
        select(OrderItem.name, *totals)
        .join(Order, Order.id == OrderItem.order_id)
        .where(*conditions, OrderItem.product_id.is_(None))
        .group_by(OrderItem.name)
    ).all()

    rows: list[_ItemSales] = []
    for product_id, snapshot_name, quantity, sales, profit in product_rows:
        product = products.get(product_id)
        rows.append(
            _ItemSales(
                product_id=product_id,
                name=product.name if product else snapshot_name,
                category=product.category if product else CUSTOM_ITEM_CATEGORY,
                quantity=round_qty(quantity or 0),
                sales_paise=int(sales or 0),
                profit_paise=int(profit or 0),
            )
        )
    for name, quantity, sales, profit in custom_rows:
        rows.append(
            _ItemSales(
                product_id=None,
                name=name,
                category=CUSTOM_ITEM_CATEGORY,
                quantity=round_qty(quantity or 0),
                sales_paise=int(sales or 0),
                profit_paise=int(profit or 0),
            )
        )
    return rows


def _movement(product: Product, sold: dict[int, float]) -> schemas.ProductMovement:
    return schemas.ProductMovement(
        product_id=product.id,
        name=product.name,
        unit=product.unit,  # type: ignore[arg-type]
        quantity=round_qty(sold.get(product.id, 0.0)),
        stock_quantity=round_qty(product.stock_quantity),
    )


def build_report(db: Session, shop_id: int, range_: str, *, now: datetime | None = None) -> schemas.Report:
    now = now or now_utc()
    date_from, date_to, bucket = report_window(range_, today_ist(now))
    start = ist_day_start(date_from)
    end = ist_day_start(date_to + timedelta(days=1))
    in_range: list[ColumnElement[bool]] = [
        Order.shop_id == shop_id,
        Order.status != "cancelled",
        Order.created_at >= start,
        Order.created_at < end,
    ]

    # Totals. Gross profit = item margin minus order-level discounts (true sales − cost).
    sales, order_count, order_discounts = db.execute(
        select(
            func.coalesce(func.sum(Order.total_paise), 0),
            func.count(Order.id),
            func.coalesce(func.sum(Order.discount_paise), 0),
        ).where(*in_range)
    ).one()
    sales, order_count, order_discounts = int(sales), int(order_count), int(order_discounts)
    products = {
        product.id: product for product in db.scalars(select(Product).where(Product.shop_id == shop_id))
    }
    item_sales = _item_sales(db, in_range, products)
    gross_profit = sum(row.profit_paise for row in item_sales) - order_discounts
    received = payments_service.received_between(db, shop_id, start, end)
    expenses_paise = expenses_service.total_between(db, shop_id, start, end)
    span_days = (date_to - date_from).days + 1
    previous_sales, previous_orders = sales_between(
        db, shop_id, ist_day_start(date_from - timedelta(days=span_days)), start
    )

    # Series, zero-filled per bucket.
    buckets: dict[date, list[int]] = {key: [0, 0] for key in _bucket_starts(date_from, date_to, bucket)}
    for day, (day_sales, day_orders) in daily_sales(db, shop_id, date_from, date_to).items():
        slot = buckets.setdefault(_bucket_key(day, bucket), [0, 0])
        slot[0] += day_sales
        slot[1] += day_orders
    series = [
        schemas.SeriesPoint(
            label=_bucket_label(key, bucket), start=key, sales=to_rupees(value[0]), orders=value[1]
        )
        for key, value in sorted(buckets.items())
    ]

    # Products and categories.
    ranked_items = sorted(item_sales, key=lambda row: (-row.sales_paise, row.name.casefold()))
    by_product = [
        schemas.ProductSales(
            product_id=row.product_id,
            name=row.name,
            category=row.category,
            quantity=row.quantity,
            sales=to_rupees(row.sales_paise),
            profit=to_rupees(row.profit_paise),
        )
        for row in ranked_items[:TOP_PRODUCTS]
    ]
    category_quantity: dict[str, float] = defaultdict(float)
    category_sales: dict[str, int] = defaultdict(int)
    for row in item_sales:
        category_quantity[row.category] += row.quantity
        category_sales[row.category] += row.sales_paise
    by_category = [
        schemas.CategorySales(
            category=name,
            quantity=round_qty(category_quantity[name]),
            sales=to_rupees(category_sales[name]),
        )
        for name in sorted(category_sales, key=lambda name: (-category_sales[name], name))
    ]

    # Customers.
    customer_rows = db.execute(
        select(Order.customer_id, func.sum(Order.total_paise), func.count(Order.id))
        .where(*in_range, Order.customer_id.is_not(None))
        .group_by(Order.customer_id)
    ).all()
    top_rows = sorted(customer_rows, key=lambda row: (-int(row[1] or 0), row[0]))[:TOP_CUSTOMERS]
    dues = customers_service.dues_by_customer(db, shop_id)
    due_rows = sorted(dues.items(), key=lambda item: (-item[1], item[0]))[:CUSTOMERS_WITH_DUES]
    wanted_ids = {int(row[0]) for row in top_rows} | {customer_id for customer_id, _ in due_rows}
    people = (
        {c.id: c for c in db.scalars(select(Customer).where(Customer.id.in_(sorted(wanted_ids))))}
        if wanted_ids
        else {}
    )
    new_count = db.scalar(
        select(func.count(Customer.id)).where(
            Customer.shop_id == shop_id,
            Customer.is_archived.is_(False),
            Customer.created_at >= start,
            Customer.created_at < end,
        )
    )
    customers_section = schemas.ReportCustomers(
        top=[
            schemas.TopCustomer(
                id=people[int(customer_id)].id,
                name=people[int(customer_id)].name,
                phone=people[int(customer_id)].phone,
                total=to_rupees(int(total or 0)),
                orders=int(count),
            )
            for customer_id, total, count in top_rows
        ],
        new_count=int(new_count or 0),
        repeat_count=sum(1 for row in customer_rows if int(row[2]) >= 2),
        active_count=len(customer_rows),
        with_dues=[
            schemas.CustomerDue(
                id=customer_id,
                name=people[customer_id].name,
                phone=people[customer_id].phone,
                outstanding=to_rupees(amount),
            )
            for customer_id, amount in due_rows
        ],
    )

    partial_orders = db.scalar(
        select(func.count(Order.id)).where(
            Order.shop_id == shop_id,
            Order.status != "cancelled",
            Order.paid_paise > 0,
            Order.paid_paise < Order.total_paise,
        )
    )

    # Inventory movement (by quantity sold within the range).
    sold: dict[int, float] = {
        row.product_id: row.quantity for row in item_sales if row.product_id is not None
    }
    active_products = [product for product in products.values() if not product.is_archived]
    fast = sorted(
        (product for product in active_products if sold.get(product.id, 0) > 0),
        key=lambda product: (-sold[product.id], product.name_key),
    )[:MOVEMENT_ROWS]
    slow = sorted(
        active_products, key=lambda product: (sold.get(product.id, 0.0), product.name_key)
    )[:MOVEMENT_ROWS]
    low = inventory_service.low_stock_products(db, shop_id)
    reserved = inventory_service.reserved_quantities(db, shop_id, [product.id for product in low])

    return schemas.Report(
        range=range_,  # type: ignore[arg-type]
        date_from=date_from,
        date_to=date_to,
        bucket=bucket,  # type: ignore[arg-type]
        totals=schemas.ReportTotals(
            sales=to_rupees(sales),
            orders=order_count,
            avg_order_value=to_rupees(divide_paise(sales, order_count)),
            gross_profit=to_rupees(gross_profit),
            payments_received=to_rupees(received),
            expenses=to_rupees(expenses_paise),
            net_profit=to_rupees(gross_profit - expenses_paise),
        ),
        previous=schemas.ReportPrevious(sales=to_rupees(previous_sales), orders=previous_orders),
        series=series,
        by_product=by_product,
        by_category=by_category,
        customers=customers_section,
        payments=schemas.ReportPayments(
            received=to_rupees(received),
            outstanding=to_rupees(sum(dues.values())),
            partial_orders=int(partial_orders or 0),
            by_method=payments_service.method_totals(db, shop_id, start, end),
        ),
        inventory=schemas.ReportInventory(
            fast_moving=[_movement(product, sold) for product in fast],
            slow_moving=[_movement(product, sold) for product in slow],
            low_stock=[product_out(product, reserved.get(product.id, 0.0)) for product in low],
        ),
        expenses=expenses_service.summarize(db, shop_id, start, end),
    )
