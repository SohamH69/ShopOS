"""Order payments, khata settlements (FIFO allocation), voids, listing and summaries."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, joinedload

from app import schemas
from app.constants import PAYMENT_METHODS
from app.errors import BadRequest, Conflict, NotFound
from app.models import Customer, Order, Payment, User
from app.money import format_inr, to_rupees
from app.services import customers as customers_service
from app.timeutil import (
    ist_day_bounds,
    ist_day_start,
    ist_range_bounds,
    month_start,
    now_utc,
    today_ist,
)

PAYMENT_NOT_FOUND = "Payment not found."

PAYMENT_LIST_OPTIONS = (
    joinedload(Payment.order).joinedload(Order.customer),
    joinedload(Payment.received_by),
)


def active_paid_paise(db: Session, order_id: int) -> int:
    total = db.execute(
        select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(
            Payment.order_id == order_id, Payment.voided_at.is_(None)
        )
    ).scalar_one()
    return int(total)


def record_order_payment(
    db: Session,
    user: User | None,
    order: Order,
    amount_paise: int,
    method: str,
    note: str = "",
    *,
    at: datetime | None = None,
    batch_id: str | None = None,
) -> Payment:
    at = at or now_utc()
    if order.status == "cancelled":
        raise Conflict("This order is cancelled. Reopen it before recording a payment.")
    if amount_paise <= 0:
        raise BadRequest("Enter an amount more than ₹0.")
    due = order.total_paise - order.paid_paise
    if due <= 0:
        raise BadRequest("This order is already paid in full.")
    if amount_paise > due:
        raise BadRequest(f"Amount is more than the {format_inr(due)} due on this order.")

    payment = Payment(
        shop_id=order.shop_id,
        order=order,
        amount_paise=amount_paise,
        method=method,
        note=note.strip(),
        paid_at=at,
        received_by=user,
        batch_id=batch_id,
        created_at=at,
    )
    db.add(payment)
    db.flush()
    order.paid_paise = active_paid_paise(db, order.id)
    order.updated_at = at
    customers_service.refresh_promise(db, order.customer)
    return payment


@dataclass
class CustomerPaymentOutcome:
    batch_id: str
    total_paise: int
    outstanding_after_paise: int
    payments: list[Payment] = field(default_factory=list)


def record_customer_payment(
    db: Session,
    user: User | None,
    customer: Customer,
    amount_paise: int,
    method: str,
    note: str = "",
    *,
    at: datetime | None = None,
) -> CustomerPaymentOutcome:
    """Settle khata dues: allocate to the oldest unpaid orders first (FIFO)."""
    at = at or now_utc()
    if amount_paise <= 0:
        raise BadRequest("Enter an amount more than ₹0.")
    open_orders = list(
        db.scalars(
            select(Order)
            .where(
                Order.customer_id == customer.id,
                Order.status != "cancelled",
                Order.paid_paise < Order.total_paise,
            )
            .order_by(Order.created_at, Order.id)
        )
    )
    due = sum(order.total_paise - order.paid_paise for order in open_orders)
    if due <= 0:
        raise BadRequest("This customer has no dues to collect.")
    if amount_paise > due:
        raise BadRequest(f"Amount is more than the {format_inr(due)} this customer owes.")

    outcome = CustomerPaymentOutcome(
        batch_id=uuid.uuid4().hex, total_paise=amount_paise, outstanding_after_paise=due - amount_paise
    )
    remaining = amount_paise
    for order in open_orders:
        if remaining <= 0:
            break
        part = min(order.total_paise - order.paid_paise, remaining)
        outcome.payments.append(
            record_order_payment(
                db, user, order, part, method, note, at=at, batch_id=outcome.batch_id
            )
        )
        remaining -= part
    return outcome


def load_payments(db: Session, shop_id: int, payment_ids: list[int]) -> list[Payment]:
    """Payments by id with order/customer/receiver loaded, in creation (allocation) order."""
    if not payment_ids:
        return []
    return list(
        db.scalars(
            select(Payment)
            .where(Payment.shop_id == shop_id, Payment.id.in_(payment_ids))
            .options(*PAYMENT_LIST_OPTIONS)
            .order_by(Payment.id)
        )
    )


def get_payment(db: Session, shop_id: int, payment_id: int) -> Payment:
    payment = db.get(Payment, payment_id)
    if payment is None or payment.shop_id != shop_id or payment.voided_at is not None:
        raise NotFound(PAYMENT_NOT_FOUND)
    return payment


def void_payment(
    db: Session, user: User | None, payment: Payment, *, at: datetime | None = None
) -> None:
    """Soft void: the row stays for the audit trail but leaves every sum and list."""
    at = at or now_utc()
    payment.voided_at = at
    payment.voided_by = user
    db.flush()
    order = payment.order
    order.paid_paise = active_paid_paise(db, order.id)
    order.updated_at = at
    db.flush()


def _payment_conditions(
    shop_id: int,
    *,
    method: str | None = None,
    customer_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [
        Payment.shop_id == shop_id,
        Payment.voided_at.is_(None),
    ]
    if method:
        conditions.append(Payment.method == method)
    if customer_id is not None:
        conditions.append(
            Payment.order_id.in_(
                select(Order.id).where(Order.shop_id == shop_id, Order.customer_id == customer_id)
            )
        )
    start, end = ist_range_bounds(date_from, date_to)
    if start is not None:
        conditions.append(Payment.paid_at >= start)
    if end is not None:
        conditions.append(Payment.paid_at < end)
    return conditions


def list_payments(
    db: Session,
    shop_id: int,
    *,
    method: str | None = None,
    customer_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Payment], int]:
    conditions = _payment_conditions(
        shop_id, method=method, customer_id=customer_id, date_from=date_from, date_to=date_to
    )
    total = db.scalar(select(func.count(Payment.id)).where(*conditions)) or 0
    rows = db.scalars(
        select(Payment)
        .where(*conditions)
        .options(*PAYMENT_LIST_OPTIONS)
        .order_by(Payment.paid_at.desc(), Payment.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(rows), int(total)


def customer_payments(db: Session, customer: Customer) -> list[Payment]:
    return list(
        db.scalars(
            select(Payment)
            .join(Payment.order)
            .where(Order.customer_id == customer.id, Payment.voided_at.is_(None))
            .options(*PAYMENT_LIST_OPTIONS)
            .order_by(Payment.paid_at.desc(), Payment.id.desc())
        )
    )


def received_between(db: Session, shop_id: int, start: datetime, end: datetime) -> int:
    total = db.execute(
        select(func.coalesce(func.sum(Payment.amount_paise), 0)).where(
            Payment.shop_id == shop_id,
            Payment.voided_at.is_(None),
            Payment.paid_at >= start,
            Payment.paid_at < end,
        )
    ).scalar_one()
    return int(total)


def method_totals(db: Session, shop_id: int, start: datetime, end: datetime) -> list[schemas.MethodTotal]:
    """Totals per method within [start, end), largest first; methods with no payments omitted."""
    rows = db.execute(
        select(Payment.method, func.sum(Payment.amount_paise), func.count(Payment.id))
        .where(
            Payment.shop_id == shop_id,
            Payment.voided_at.is_(None),
            Payment.paid_at >= start,
            Payment.paid_at < end,
        )
        .group_by(Payment.method)
    ).all()
    order = {method: index for index, method in enumerate(PAYMENT_METHODS)}
    rows = sorted(rows, key=lambda row: (-int(row[1] or 0), order.get(row[0], 99)))
    return [
        schemas.MethodTotal(method=method, amount=to_rupees(int(amount or 0)), count=int(count))
        for method, amount, count in rows
    ]


def payment_summary(db: Session, shop_id: int, *, now: datetime | None = None) -> schemas.PaymentSummary:
    now = now or now_utc()
    today = today_ist(now)
    today_start, today_end = ist_day_bounds(today)
    week_start = ist_day_start(today - timedelta(days=6))
    month_begin = ist_day_start(month_start(today))
    return schemas.PaymentSummary(
        today=to_rupees(received_between(db, shop_id, today_start, today_end)),
        week=to_rupees(received_between(db, shop_id, week_start, today_end)),
        month=to_rupees(received_between(db, shop_id, month_begin, today_end)),
        by_method=method_totals(db, shop_id, month_begin, today_end),
    )
