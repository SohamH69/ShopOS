"""The customer side: no sign-in, the signed token in the khata link is the key."""

from typing import Annotated

from fastapi import APIRouter, Path

from app import schemas
from app.deps import DbSession
from app.services import portal as portal_service

router = APIRouter(prefix="/api/portal", tags=["customer link"])

Token = Annotated[str, Path(min_length=5, max_length=80)]


@router.get("/{token}", response_model=schemas.PortalView)
def portal_view(token: Token, db: DbSession) -> schemas.PortalView:
    customer, shop = portal_service.resolve(db, token)
    result = portal_service.view(db, customer, shop)
    customer_id, last_seen = customer.id, customer.portal_last_seen_at
    db.rollback()  # end the read before the separate "last opened" write
    portal_service.note_seen(customer_id, last_seen)
    return result


@router.get("/{token}/products", response_model=list[schemas.PortalProduct])
def portal_products(token: Token, db: DbSession) -> list[schemas.PortalProduct]:
    _customer, shop = portal_service.resolve(db, token)
    return portal_service.products(db, shop)


@router.post("/{token}/orders", response_model=schemas.PortalOrder, status_code=201)
def portal_place_order(
    token: Token, payload: schemas.PortalOrderCreate, db: DbSession
) -> schemas.PortalOrder:
    customer, shop = portal_service.resolve(db, token)
    order = portal_service.place_order(db, customer, shop, payload)
    db.commit()
    return portal_service.portal_order_out(order)
