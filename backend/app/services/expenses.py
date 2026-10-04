"""Shop expenses (rent, electricity, salaries, ...)."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, joinedload

from app import schemas
from app.errors import BadRequest
from app.models import Expense, User
from app.money import to_paise, to_rupees
from app.services.common import clean_text, get_owned
from app.timeutil import from_client, ist_range_bounds, now_utc

EXPENSE_NOT_FOUND = "Expense not found."


def get_expense(db: Session, shop_id: int, expense_id: int) -> Expense:
    return get_owned(db, Expense, shop_id, expense_id, EXPENSE_NOT_FOUND)


def _conditions(
    shop_id: int,
    *,
    category: str | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [Expense.shop_id == shop_id]
    if category:
        conditions.append(Expense.category == category)
    if start is not None:
        conditions.append(Expense.spent_at >= start)
    if end is not None:
        conditions.append(Expense.spent_at < end)
    return conditions


def list_expenses(
    db: Session,
    shop_id: int,
    *,
    category: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Expense], int]:
    start, end = ist_range_bounds(date_from, date_to)
    conditions = _conditions(shop_id, category=category, start=start, end=end)
    total = db.scalar(select(func.count(Expense.id)).where(*conditions)) or 0
    rows = db.scalars(
        select(Expense)
        .where(*conditions)
        .options(joinedload(Expense.created_by))
        .order_by(Expense.spent_at.desc(), Expense.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(rows), int(total)


def summarize(
    db: Session, shop_id: int, start: datetime | None, end: datetime | None
) -> schemas.ExpenseSummary:
    rows = db.execute(
        select(Expense.category, func.sum(Expense.amount_paise), func.count(Expense.id))
        .where(*_conditions(shop_id, start=start, end=end))
        .group_by(Expense.category)
    ).all()
    ordered = sorted(rows, key=lambda row: (-int(row[1] or 0), row[0]))
    return schemas.ExpenseSummary(
        total=to_rupees(sum(int(amount or 0) for _, amount, _ in rows)),
        by_category=[
            schemas.CategoryTotal(
                category=category, amount=to_rupees(int(amount or 0)), count=int(count)
            )
            for category, amount, count in ordered
        ],
    )


def expense_summary(
    db: Session, shop_id: int, *, date_from: date | None = None, date_to: date | None = None
) -> schemas.ExpenseSummary:
    start, end = ist_range_bounds(date_from, date_to)
    return summarize(db, shop_id, start, end)


def total_between(db: Session, shop_id: int, start: datetime, end: datetime) -> int:
    total = db.execute(
        select(func.coalesce(func.sum(Expense.amount_paise), 0)).where(
            *_conditions(shop_id, start=start, end=end)
        )
    ).scalar_one()
    return int(total)


def _amount_paise(value: float) -> int:
    amount = to_paise(value)
    if amount <= 0:
        raise BadRequest("Enter an amount more than ₹0.")
    return amount


def create_expense(
    db: Session,
    shop_id: int,
    user: User | None,
    data: schemas.ExpenseInput,
    *,
    at: datetime | None = None,
) -> Expense:
    at = at or now_utc()
    expense = Expense(
        shop_id=shop_id,
        category=data.category,
        amount_paise=_amount_paise(data.amount),
        note=clean_text(data.note),
        spent_at=from_client(data.spent_at) or at,
        created_by=user,
        created_at=at,
    )
    db.add(expense)
    db.flush()
    return expense


def update_expense(db: Session, expense: Expense, data: schemas.ExpenseUpdate) -> Expense:
    fields = data.model_fields_set
    if "category" in fields and data.category is not None:
        expense.category = data.category
    if "amount" in fields and data.amount is not None:
        expense.amount_paise = _amount_paise(data.amount)
    if "note" in fields:
        expense.note = clean_text(data.note)
    if "spent_at" in fields and data.spent_at is not None:
        expense.spent_at = from_client(data.spent_at) or expense.spent_at
    db.flush()
    return expense


def delete_expense(db: Session, expense: Expense) -> None:
    db.delete(expense)
    db.flush()
