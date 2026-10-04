from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.deps import AuthContext, DbSession, PathId, require_permission
from app.money import to_paise, to_rupees
from app.serializers import customer_out, order_out, payment_out
from app.services import customers as customers_service
from app.services import orders as orders_service
from app.services import payments as payments_service
from app.timeutil import now_utc, today_ist

router = APIRouter(prefix="/api/customers", tags=["customers"])

# Pickers in the order/payment screens need to read customers too.
ReadAuth = Annotated[
    AuthContext,
    Depends(require_permission("orders", "customers", "payments", module="customers")),
]
CreateAuth = Annotated[
    AuthContext, Depends(require_permission("orders", "customers", module="customers"))
]
ManageAuth = Annotated[AuthContext, Depends(require_permission("customers"))]


def _customer_response(db: Session, shop_id: int, customer_id: int) -> schemas.Customer:
    customer = customers_service.get_customer(db, shop_id, customer_id, include_archived=True)
    return customer_out(customer, customers_service.stats_for(db, customer), today_ist())


@router.get("", response_model=list[schemas.Customer])
def list_customers(
    auth: ReadAuth,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    filter_: Annotated[schemas.CustomerFilter, Query(alias="filter")] = "all",
    sort: schemas.CustomerSort = "name",
) -> list[schemas.Customer]:
    today = today_ist()
    rows = customers_service.list_customers(
        db, auth.shop_id, search=search, filter_=filter_, sort=sort
    )
    return [customer_out(customer, stats, today) for customer, stats in rows]


@router.post("", response_model=schemas.Customer, status_code=201)
def create_customer(
    payload: schemas.CustomerInput, auth: CreateAuth, db: DbSession
) -> schemas.Customer:
    customer_id = customers_service.create_customer(db, auth.shop_id, payload).id
    db.commit()
    return _customer_response(db, auth.shop_id, customer_id)


@router.get("/{customer_id}", response_model=schemas.Customer)
def get_customer(customer_id: PathId, auth: ReadAuth, db: DbSession) -> schemas.Customer:
    return _customer_response(db, auth.shop_id, customer_id)


@router.patch("/{customer_id}", response_model=schemas.Customer)
def update_customer(
    customer_id: PathId, payload: schemas.CustomerUpdate, auth: ManageAuth, db: DbSession
) -> schemas.Customer:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id)
    customers_service.update_customer(db, customer, payload)
    db.commit()
    return _customer_response(db, auth.shop_id, customer_id)


@router.delete("/{customer_id}", response_model=schemas.OkResponse)
def archive_customer(customer_id: PathId, auth: ManageAuth, db: DbSession) -> schemas.OkResponse:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id)
    customers_service.archive_customer(db, customer)
    db.commit()
    return schemas.OkResponse(ok=True)


@router.get("/{customer_id}/ledger", response_model=schemas.Ledger)
def get_ledger(customer_id: PathId, auth: ManageAuth, db: DbSession) -> schemas.Ledger:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id, include_archived=True)
    return customers_service.ledger(db, customer)


@router.get("/{customer_id}/orders", response_model=list[schemas.Order])
def get_customer_orders(customer_id: PathId, auth: ManageAuth, db: DbSession) -> list[schemas.Order]:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id, include_archived=True)
    now = now_utc()
    return [order_out(order, now) for order in orders_service.customer_orders(db, customer)]


@router.get("/{customer_id}/payments", response_model=list[schemas.Payment])
def get_customer_payments(
    customer_id: PathId, auth: ManageAuth, db: DbSession
) -> list[schemas.Payment]:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id, include_archived=True)
    return [payment_out(payment) for payment in payments_service.customer_payments(db, customer)]


@router.post(
    "/{customer_id}/payments", response_model=schemas.CustomerPaymentResult, status_code=201
)
def collect_customer_payment(
    customer_id: PathId, payload: schemas.CustomerPaymentRequest, auth: ManageAuth, db: DbSession
) -> schemas.CustomerPaymentResult:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id)
    outcome = payments_service.record_customer_payment(
        db, auth.user, customer, to_paise(payload.amount), payload.method, payload.note or ""
    )
    payment_ids = [payment.id for payment in outcome.payments]
    db.commit()
    payments = payments_service.load_payments(db, auth.shop_id, payment_ids)
    return schemas.CustomerPaymentResult(
        batch_id=outcome.batch_id,
        total=to_rupees(outcome.total_paise),
        allocations=[
            schemas.PaymentAllocation(
                order_id=payment.order_id,
                order_number=payment.order.number,
                amount=to_rupees(payment.amount_paise),
            )
            for payment in payments
        ],
        payments=[payment_out(payment) for payment in payments],
        outstanding=to_rupees(outcome.outstanding_after_paise),
    )


@router.put("/{customer_id}/promise", response_model=schemas.Customer)
def set_promise(
    customer_id: PathId, payload: schemas.PromiseInput, auth: ManageAuth, db: DbSession
) -> schemas.Customer:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id)
    customers_service.set_promise(db, customer, payload)
    db.commit()
    return _customer_response(db, auth.shop_id, customer_id)


@router.delete("/{customer_id}/promise", response_model=schemas.Customer)
def remove_promise(customer_id: PathId, auth: ManageAuth, db: DbSession) -> schemas.Customer:
    customer = customers_service.get_customer(db, auth.shop_id, customer_id)
    customers_service.remove_promise(db, customer)
    db.commit()
    return _customer_response(db, auth.shop_id, customer_id)
