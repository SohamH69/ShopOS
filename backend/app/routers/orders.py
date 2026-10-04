from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.deps import AuthContext, DbSession, Offset, PathId, QueryId, require_permission
from app.money import to_paise
from app.serializers import order_detail_out, order_out
from app.services import orders as orders_service
from app.services import payments as payments_service
from app.timeutil import now_utc

router = APIRouter(prefix="/api", tags=["orders"])

OrdersAuth = Annotated[AuthContext, Depends(require_permission("orders"))]

MAX_PAGE_SIZE = 200


def _detail(db: Session, shop_id: int, order_id: int) -> schemas.OrderDetail:
    return order_detail_out(orders_service.load_order(db, shop_id, order_id))


@router.get("/orders", response_model=schemas.Paginated[schemas.Order])
def list_orders(
    auth: OrdersAuth,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status: schemas.OrderStatusFilter | None = None,
    payment_status: schemas.PaymentStatus | None = None,
    fulfillment: schemas.Fulfillment | None = None,
    channel: schemas.Channel | None = None,
    customer_id: QueryId | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1)] = 50,
    offset: Offset = 0,
) -> schemas.Paginated[schemas.Order]:
    page_size = min(limit, MAX_PAGE_SIZE)
    rows, total = orders_service.list_orders(
        db,
        auth.shop_id,
        orders_service.OrderQuery(
            search=search,
            status=status,
            payment_status=payment_status,
            fulfillment=fulfillment,
            channel=channel,
            customer_id=customer_id,
            date_from=date_from,
            date_to=date_to,
            limit=page_size,
            offset=offset,
        ),
    )
    now = now_utc()
    return schemas.Paginated[schemas.Order](
        items=[order_out(order, now) for order in rows], total=total, limit=page_size, offset=offset
    )


@router.post("/orders", response_model=schemas.OrderDetail, status_code=201)
def create_order(payload: schemas.OrderCreate, auth: OrdersAuth, db: DbSession) -> schemas.OrderDetail:
    order_id = orders_service.create_order(db, auth.shop_id, auth.user, payload).id
    db.commit()
    return _detail(db, auth.shop_id, order_id)


@router.get("/orders/{order_id}", response_model=schemas.OrderDetail)
def get_order(order_id: PathId, auth: OrdersAuth, db: DbSession) -> schemas.OrderDetail:
    return _detail(db, auth.shop_id, order_id)


@router.patch("/orders/{order_id}", response_model=schemas.OrderDetail)
def update_order(
    order_id: PathId, payload: schemas.OrderUpdate, auth: OrdersAuth, db: DbSession
) -> schemas.OrderDetail:
    order = orders_service.load_order(db, auth.shop_id, order_id)
    orders_service.update_order(db, auth.shop_id, auth.user, order, payload)
    db.commit()
    return _detail(db, auth.shop_id, order_id)


@router.post("/orders/{order_id}/status", response_model=schemas.OrderDetail)
def change_status(
    order_id: PathId, payload: schemas.OrderStatusUpdate, auth: OrdersAuth, db: DbSession
) -> schemas.OrderDetail:
    order = orders_service.load_order(db, auth.shop_id, order_id)
    orders_service.change_status(db, auth.user, order, payload.status)
    db.commit()
    return _detail(db, auth.shop_id, order_id)


@router.post("/orders/{order_id}/payments", response_model=schemas.OrderDetail, status_code=201)
def record_payment(
    order_id: PathId, payload: schemas.OrderPaymentRequest, auth: OrdersAuth, db: DbSession
) -> schemas.OrderDetail:
    order = orders_service.load_order(db, auth.shop_id, order_id)
    payments_service.record_order_payment(
        db, auth.user, order, to_paise(payload.amount), payload.method, payload.note or ""
    )
    db.commit()
    return _detail(db, auth.shop_id, order_id)


@router.post("/orders/{order_id}/repeat", response_model=schemas.OrderDetail, status_code=201)
def repeat_order(order_id: PathId, auth: OrdersAuth, db: DbSession) -> schemas.OrderDetail:
    source = orders_service.load_order(db, auth.shop_id, order_id, detail=False)
    new_order_id = orders_service.repeat_order(db, auth.shop_id, auth.user, source).id
    db.commit()
    return _detail(db, auth.shop_id, new_order_id)


@router.get("/pickups", response_model=list[schemas.Order])
def list_pickups(auth: OrdersAuth, db: DbSession) -> list[schemas.Order]:
    now = now_utc()
    return [order_out(order, now) for order in orders_service.open_orders(db, auth.shop_id, "pickup")]


@router.get("/deliveries", response_model=list[schemas.Order])
def list_deliveries(auth: OrdersAuth, db: DbSession) -> list[schemas.Order]:
    now = now_utc()
    return [
        order_out(order, now) for order in orders_service.open_orders(db, auth.shop_id, "delivery")
    ]
