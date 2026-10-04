from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app import schemas
from app.deps import AuthContext, DbSession, Offset, PathId, QueryId, require_permission
from app.serializers import payment_out
from app.services import payments as payments_service

router = APIRouter(prefix="/api/payments", tags=["payments"])

PaymentsAuth = Annotated[AuthContext, Depends(require_permission("payments"))]

MAX_PAGE_SIZE = 200


@router.get("", response_model=schemas.Paginated[schemas.Payment])
def list_payments(
    auth: PaymentsAuth,
    db: DbSession,
    method: schemas.PaymentMethod | None = None,
    customer_id: QueryId | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1)] = 50,
    offset: Offset = 0,
) -> schemas.Paginated[schemas.Payment]:
    page_size = min(limit, MAX_PAGE_SIZE)
    rows, total = payments_service.list_payments(
        db,
        auth.shop_id,
        method=method,
        customer_id=customer_id,
        date_from=date_from,
        date_to=date_to,
        limit=page_size,
        offset=offset,
    )
    return schemas.Paginated[schemas.Payment](
        items=[payment_out(payment) for payment in rows],
        total=total,
        limit=page_size,
        offset=offset,
    )


@router.get("/summary", response_model=schemas.PaymentSummary)
def payment_summary(auth: PaymentsAuth, db: DbSession) -> schemas.PaymentSummary:
    return payments_service.payment_summary(db, auth.shop_id)


@router.delete("/{payment_id}", response_model=schemas.OkResponse)
def void_payment(payment_id: PathId, auth: PaymentsAuth, db: DbSession) -> schemas.OkResponse:
    payment = payments_service.get_payment(db, auth.shop_id, payment_id)
    payments_service.void_payment(db, auth.user, payment)
    db.commit()
    return schemas.OkResponse(ok=True)
