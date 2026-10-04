from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.deps import AuthContext, DbSession, Offset, PathId, require_permission
from app.serializers import expense_out
from app.services import expenses as expenses_service

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

ExpensesAuth = Annotated[AuthContext, Depends(require_permission("expenses"))]

MAX_PAGE_SIZE = 200


def _expense_response(db: Session, shop_id: int, expense_id: int) -> schemas.Expense:
    return expense_out(expenses_service.get_expense(db, shop_id, expense_id))


@router.get("", response_model=schemas.Paginated[schemas.Expense])
def list_expenses(
    auth: ExpensesAuth,
    db: DbSession,
    category: schemas.ExpenseCategory | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1)] = 50,
    offset: Offset = 0,
) -> schemas.Paginated[schemas.Expense]:
    page_size = min(limit, MAX_PAGE_SIZE)
    rows, total = expenses_service.list_expenses(
        db,
        auth.shop_id,
        category=category,
        date_from=date_from,
        date_to=date_to,
        limit=page_size,
        offset=offset,
    )
    return schemas.Paginated[schemas.Expense](
        items=[expense_out(expense) for expense in rows],
        total=total,
        limit=page_size,
        offset=offset,
    )


@router.get("/summary", response_model=schemas.ExpenseSummary)
def expense_summary(
    auth: ExpensesAuth,
    db: DbSession,
    date_from: date | None = None,
    date_to: date | None = None,
) -> schemas.ExpenseSummary:
    return expenses_service.expense_summary(
        db, auth.shop_id, date_from=date_from, date_to=date_to
    )


@router.post("", response_model=schemas.Expense, status_code=201)
def create_expense(
    payload: schemas.ExpenseInput, auth: ExpensesAuth, db: DbSession
) -> schemas.Expense:
    expense_id = expenses_service.create_expense(db, auth.shop_id, auth.user, payload).id
    db.commit()
    return _expense_response(db, auth.shop_id, expense_id)


@router.patch("/{expense_id}", response_model=schemas.Expense)
def update_expense(
    expense_id: PathId, payload: schemas.ExpenseUpdate, auth: ExpensesAuth, db: DbSession
) -> schemas.Expense:
    expense = expenses_service.get_expense(db, auth.shop_id, expense_id)
    expenses_service.update_expense(db, expense, payload)
    db.commit()
    return _expense_response(db, auth.shop_id, expense_id)


@router.delete("/{expense_id}", response_model=schemas.OkResponse)
def delete_expense(expense_id: PathId, auth: ExpensesAuth, db: DbSession) -> schemas.OkResponse:
    expense = expenses_service.get_expense(db, auth.shop_id, expense_id)
    expenses_service.delete_expense(db, expense)
    db.commit()
    return schemas.OkResponse(ok=True)
