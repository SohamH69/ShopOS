"""Customers, their khata (credit ledger) and payment promises.

A customer's balance is derived, never stored: purchases are the totals of their
non-cancelled orders and payments are the non-voided payments on those orders
(``Order.paid_paise`` keeps that sum per order).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime

from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, contains_eager

from app import schemas
from app.constants import METHOD_LABEL
from app.domain import EMPTY_CUSTOMER_STATS, CustomerStats
from app.errors import BadRequest, Conflict, NotFound
from app.models import Customer, Order, Payment
from app.money import format_inr, to_paise, to_rupees
from app.services.common import clean_line, clean_text, normalize_phone, phone_search_digits
from app.timeutil import now_utc, today_ist

CUSTOMER_NOT_FOUND = "Customer not found."
DUPLICATE_PHONE = "A customer with this phone number already exists."


# ---------------------------------------------------------------------------
# Balances
# ---------------------------------------------------------------------------


def customer_stats(
    db: Session, shop_id: int, customer_ids: Iterable[int] | None = None
) -> dict[int, CustomerStats]:
    """Purchases, payments, order count and last order for customers (two queries)."""
    conditions: list[ColumnElement[bool]] = [
        Order.shop_id == shop_id,
        Order.status != "cancelled",
        Order.customer_id.is_not(None),
    ]
    if customer_ids is not None:
        ids = sorted(set(customer_ids))
        if not ids:
            return {}
        conditions.append(Order.customer_id.in_(ids))

    totals = db.execute(
        select(
            Order.customer_id,
            func.sum(Order.total_paise),
            func.sum(Order.paid_paise),
            func.count(Order.id),
            func.max(Order.created_at),
        )
        .where(*conditions)
        .group_by(Order.customer_id)
    ).all()

    ranked = (
        select(
            Order.customer_id.label("customer_id"),
            Order.id.label("order_id"),
            Order.total_paise.label("total_paise"),
            func.row_number()
            .over(partition_by=Order.customer_id, order_by=(Order.created_at.desc(), Order.id.desc()))
            .label("position"),
        )
        .where(*conditions)
        .subquery()
    )
    last_orders: dict[int, tuple[int, int]] = {
        customer_id: (int(order_id), int(total))
        for customer_id, order_id, total in db.execute(
            select(ranked.c.customer_id, ranked.c.order_id, ranked.c.total_paise).where(
                ranked.c.position == 1
            )
        ).all()
    }

    return {
        int(customer_id): CustomerStats(
            purchases_paise=int(purchases or 0),
            paid_paise=int(paid or 0),
            orders_count=int(count or 0),
            last_order_at=last_at,
            last_order_total_paise=last_orders[customer_id][1] if customer_id in last_orders else None,
            last_order_id=last_orders[customer_id][0] if customer_id in last_orders else None,
        )
        for customer_id, purchases, paid, count, last_at in totals
    }


def dues_by_customer(db: Session, shop_id: int) -> dict[int, int]:
    """customer_id → outstanding paise, only for customers who owe something."""
    due = func.sum(Order.total_paise - Order.paid_paise)
    rows = db.execute(
        select(Order.customer_id, due)
        .where(
            Order.shop_id == shop_id,
            Order.status != "cancelled",
            Order.customer_id.is_not(None),
        )
        .group_by(Order.customer_id)
        .having(due > 0)
    ).all()
    return {int(customer_id): int(amount) for customer_id, amount in rows}


def stats_for(db: Session, customer: Customer) -> CustomerStats:
    return customer_stats(db, customer.shop_id, [customer.id]).get(customer.id, EMPTY_CUSTOMER_STATS)


def outstanding_paise(db: Session, customer_id: int) -> int:
    due = db.execute(
        select(func.coalesce(func.sum(Order.total_paise - Order.paid_paise), 0)).where(
            Order.customer_id == customer_id, Order.status != "cancelled"
        )
    ).scalar_one()
    return max(int(due), 0)


def clear_promise(customer: Customer) -> None:
    customer.promise_date = None
    customer.promise_amount_paise = None
    customer.promise_note = ""


def refresh_promise(db: Session, customer: Customer | None) -> None:
    """Payment promises clear themselves once the customer owes nothing."""
    if customer is None or customer.promise_date is None:
        return
    db.flush()
    if outstanding_paise(db, customer.id) == 0:
        clear_promise(customer)


# ---------------------------------------------------------------------------
# Lookup and listing
# ---------------------------------------------------------------------------


def get_customer(
    db: Session, shop_id: int, customer_id: int, *, include_archived: bool = False
) -> Customer:
    customer = db.get(Customer, customer_id)
    if (
        customer is None
        or customer.shop_id != shop_id
        or (customer.is_archived and not include_archived)
    ):
        raise NotFound(CUSTOMER_NOT_FOUND)
    return customer


def search_clause(term: str) -> ColumnElement[bool]:
    conditions: list[ColumnElement[bool]] = [Customer.name.icontains(term, autoescape=True)]
    digits = phone_search_digits(term)
    if len(digits) >= 3:
        conditions.append(Customer.phone_key.contains(digits, autoescape=True))
    return or_(*conditions)


def search_customers(db: Session, shop_id: int, term: str, *, limit: int) -> list[Customer]:
    return list(
        db.scalars(
            select(Customer)
            .where(
                Customer.shop_id == shop_id,
                Customer.is_archived.is_(False),
                search_clause(term),
            )
            .order_by(func.lower(Customer.name), Customer.id)
            .limit(limit)
        )
    )


def list_customers(
    db: Session,
    shop_id: int,
    *,
    search: str | None = None,
    filter_: str = "all",
    sort: str = "name",
) -> list[tuple[Customer, CustomerStats]]:
    query = select(Customer).where(Customer.shop_id == shop_id, Customer.is_archived.is_(False))
    term = clean_line(search)
    if term:
        query = query.where(search_clause(term))
    customers = list(db.scalars(query))
    stats = customer_stats(db, shop_id)
    rows = [(customer, stats.get(customer.id, EMPTY_CUSTOMER_STATS)) for customer in customers]

    if filter_ == "dues":
        rows = [row for row in rows if row[1].outstanding_paise > 0]
    elif filter_ == "promises":
        rows = [row for row in rows if row[0].promise_date is not None]

    rows.sort(key=lambda row: (row[0].name.casefold(), row[0].id))
    if sort == "outstanding":
        rows.sort(key=lambda row: row[1].outstanding_paise, reverse=True)
    elif sort == "recent":
        # Newest last order first (the later order wins a timestamp tie); no orders last.
        rows.sort(
            key=lambda row: (
                row[1].last_order_at is not None,
                row[1].last_order_at or row[0].created_at,
                row[1].last_order_id or 0,
            ),
            reverse=True,
        )
    return rows


# ---------------------------------------------------------------------------
# Create / update / archive
# ---------------------------------------------------------------------------


def _require_name(raw: str | None) -> str:
    name = clean_line(raw)
    if not name:
        raise BadRequest("Enter the customer's name.")
    return name


def _clean_products(values: list[str] | None) -> list[str]:
    seen: dict[str, str] = {}
    for value in values or []:
        text = clean_line(value)
        if text:
            seen.setdefault(text.casefold(), text)
    return list(seen.values())


def _ensure_phone_free(
    db: Session, shop_id: int, phone_key: str, *, exclude_id: int | None = None
) -> None:
    query = select(Customer.id).where(
        Customer.shop_id == shop_id,
        Customer.phone_key == phone_key,
        Customer.is_archived.is_(False),
    )
    if exclude_id is not None:
        query = query.where(Customer.id != exclude_id)
    if db.scalar(query.limit(1)) is not None:
        raise Conflict(DUPLICATE_PHONE)


def find_by_phone(db: Session, shop_id: int, phone_key: str) -> Customer | None:
    return db.scalar(
        select(Customer)
        .where(
            Customer.shop_id == shop_id,
            Customer.phone_key == phone_key,
            Customer.is_archived.is_(False),
        )
        .limit(1)
    )


def create_customer(
    db: Session, shop_id: int, data: schemas.CustomerInput, *, at: datetime | None = None
) -> Customer:
    at = at or now_utc()
    name = _require_name(data.name)
    phone, phone_key = normalize_phone(data.phone)
    _ensure_phone_free(db, shop_id, phone_key)
    customer = Customer(
        shop_id=shop_id,
        name=name,
        phone=phone,
        phone_key=phone_key,
        address=clean_text(data.address),
        notes=clean_text(data.notes),
        preferred_products=_clean_products(data.preferred_products),
        promise_note="",
        is_archived=False,
        created_at=at,
        updated_at=at,
    )
    db.add(customer)
    db.flush()
    return customer


def update_customer(
    db: Session, customer: Customer, data: schemas.CustomerUpdate, *, at: datetime | None = None
) -> Customer:
    fields = data.model_fields_set
    if "name" in fields and data.name is not None:
        customer.name = _require_name(data.name)
    if "phone" in fields and data.phone is not None:
        phone, phone_key = normalize_phone(data.phone)
        _ensure_phone_free(db, customer.shop_id, phone_key, exclude_id=customer.id)
        customer.phone, customer.phone_key = phone, phone_key
    if "address" in fields:
        customer.address = clean_text(data.address)
    if "notes" in fields:
        customer.notes = clean_text(data.notes)
    if "preferred_products" in fields:
        customer.preferred_products = _clean_products(data.preferred_products)
    customer.updated_at = at or now_utc()
    db.flush()
    return customer


def archive_customer(db: Session, customer: Customer, *, at: datetime | None = None) -> None:
    due = outstanding_paise(db, customer.id)
    if due > 0:
        raise Conflict(f"Collect the {format_inr(due)} this customer owes before archiving them.")
    customer.is_archived = True
    clear_promise(customer)
    customer.updated_at = at or now_utc()
    db.flush()


# ---------------------------------------------------------------------------
# Payment promises
# ---------------------------------------------------------------------------


def set_promise(
    db: Session,
    customer: Customer,
    data: schemas.PromiseInput,
    *,
    today: date | None = None,
    at: datetime | None = None,
) -> Customer:
    """Record "I'll pay by <date>". ``today``/``at`` can be overridden by the demo seed."""
    at = at or now_utc()
    today = today or today_ist(at)
    due = outstanding_paise(db, customer.id)
    if due <= 0:
        raise BadRequest("This customer has no dues to promise against.")
    if data.date < today:
        raise BadRequest("Pick today or a later date for the promise.")
    amount: int | None = None
    if data.amount is not None:
        amount = to_paise(data.amount)
        if amount < 0:
            raise BadRequest("The promised amount can't be negative.")
        if amount == 0:
            amount = None
        elif amount > due:
            raise BadRequest(f"The promised amount is more than the {format_inr(due)} due.")
    customer.promise_date = data.date
    customer.promise_amount_paise = amount
    customer.promise_note = clean_text(data.note)
    customer.updated_at = at
    db.flush()
    return customer


def remove_promise(db: Session, customer: Customer) -> Customer:
    clear_promise(customer)
    customer.updated_at = now_utc()
    db.flush()
    return customer


# ---------------------------------------------------------------------------
# Khata views
# ---------------------------------------------------------------------------


def ledger(db: Session, customer: Customer) -> schemas.Ledger:
    """Chronological purchases (+) and payments (−) with a running balance."""
    orders = list(
        db.scalars(
            select(Order)
            .where(Order.customer_id == customer.id, Order.status != "cancelled")
            .order_by(Order.created_at, Order.id)
        )
    )
    payments = list(
        db.scalars(
            select(Payment)
            .join(Payment.order)
            .options(contains_eager(Payment.order))
            .where(
                Order.customer_id == customer.id,
                Order.status != "cancelled",
                Payment.voided_at.is_(None),
            )
            .order_by(Payment.paid_at, Payment.id)
        )
    )

    events: list[tuple[datetime, int, int, Order | Payment]] = [
        (order.created_at, 0, order.id, order) for order in orders
    ] + [(payment.paid_at, 1, payment.id, payment) for payment in payments]
    events.sort(key=lambda event: (event[0], event[1], event[2]))

    balance = 0
    entries: list[schemas.LedgerEntry] = []
    for when, _kind, _id, row in events:
        if isinstance(row, Order):
            balance += row.total_paise
            entries.append(
                schemas.LedgerEntry(
                    id=f"order-{row.id}",
                    date=when,
                    type="purchase",
                    description=f"Order #{row.number}",
                    amount=to_rupees(row.total_paise),
                    balance=to_rupees(balance),
                    order_id=row.id,
                    order_number=row.number,
                    payment_id=None,
                    method=None,
                )
            )
        else:
            balance -= row.amount_paise
            entries.append(
                schemas.LedgerEntry(
                    id=f"payment-{row.id}",
                    date=when,
                    type="payment",
                    description=(
                        f"Payment · {METHOD_LABEL.get(row.method, row.method)}"
                        f" · Order #{row.order.number}"
                    ),
                    amount=to_rupees(-row.amount_paise),
                    balance=to_rupees(balance),
                    order_id=row.order_id,
                    order_number=row.order.number,
                    payment_id=row.id,
                    method=row.method,  # type: ignore[arg-type]
                )
            )
    return schemas.Ledger(
        customer_id=customer.id, entries=entries, outstanding=to_rupees(max(balance, 0))
    )
