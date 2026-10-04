from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.deps import AuthContext, DbSession, PathId, require_permission
from app.money import to_paise
from app.serializers import purchase_out, supplier_detail_out, supplier_out, supplier_payment_out
from app.services import suppliers as suppliers_service

router = APIRouter(prefix="/api", tags=["suppliers"])

SuppliersAuth = Annotated[AuthContext, Depends(require_permission("suppliers"))]


def _supplier_response(db: Session, shop_id: int, supplier_id: int) -> schemas.Supplier:
    supplier = suppliers_service.get_supplier(db, shop_id, supplier_id)
    return supplier_out(supplier, suppliers_service.stats_for(db, supplier))


@router.get("/suppliers", response_model=list[schemas.Supplier])
def list_suppliers(
    auth: SuppliersAuth,
    db: DbSession,
    filter_: Annotated[schemas.SupplierFilter | None, Query(alias="filter")] = None,
) -> list[schemas.Supplier]:
    rows = suppliers_service.list_suppliers(db, auth.shop_id, due_only=filter_ == "due")
    return [supplier_out(supplier, stats) for supplier, stats in rows]


@router.post("/suppliers", response_model=schemas.Supplier, status_code=201)
def create_supplier(
    payload: schemas.SupplierInput, auth: SuppliersAuth, db: DbSession
) -> schemas.Supplier:
    supplier_id = suppliers_service.create_supplier(db, auth.shop_id, payload).id
    db.commit()
    return _supplier_response(db, auth.shop_id, supplier_id)


@router.get("/suppliers/{supplier_id}", response_model=schemas.SupplierDetail)
def get_supplier(supplier_id: PathId, auth: SuppliersAuth, db: DbSession) -> schemas.SupplierDetail:
    supplier = suppliers_service.get_supplier(db, auth.shop_id, supplier_id)
    return supplier_detail_out(
        supplier,
        suppliers_service.stats_for(db, supplier),
        suppliers_service.supplier_purchases(db, supplier),
        suppliers_service.supplier_payments(db, supplier),
    )


@router.patch("/suppliers/{supplier_id}", response_model=schemas.Supplier)
def update_supplier(
    supplier_id: PathId, payload: schemas.SupplierUpdate, auth: SuppliersAuth, db: DbSession
) -> schemas.Supplier:
    supplier = suppliers_service.get_supplier(db, auth.shop_id, supplier_id)
    suppliers_service.update_supplier(db, supplier, payload)
    db.commit()
    return _supplier_response(db, auth.shop_id, supplier_id)


@router.post(
    "/suppliers/{supplier_id}/purchases", response_model=schemas.Purchase, status_code=201
)
def create_purchase(
    supplier_id: PathId, payload: schemas.PurchaseCreate, auth: SuppliersAuth, db: DbSession
) -> schemas.Purchase:
    supplier = suppliers_service.get_supplier(db, auth.shop_id, supplier_id)
    purchase_id = suppliers_service.create_purchase(db, auth.shop_id, auth.user, supplier, payload).id
    db.commit()
    return purchase_out(suppliers_service.load_purchase(db, purchase_id))


@router.post(
    "/suppliers/{supplier_id}/payments", response_model=schemas.SupplierPayment, status_code=201
)
def pay_supplier(
    supplier_id: PathId, payload: schemas.SupplierPaymentRequest, auth: SuppliersAuth, db: DbSession
) -> schemas.SupplierPayment:
    supplier = suppliers_service.get_supplier(db, auth.shop_id, supplier_id)
    payment = suppliers_service.record_supplier_payment(
        db,
        auth.shop_id,
        auth.user,
        supplier,
        to_paise(payload.amount),
        payload.method,
        note=payload.note or "",
    )
    response = supplier_payment_out(payment)
    db.commit()
    return response


@router.get("/purchases", response_model=list[schemas.Purchase])
def list_purchases(auth: SuppliersAuth, db: DbSession) -> list[schemas.Purchase]:
    return [purchase_out(purchase) for purchase in suppliers_service.list_purchases(db, auth.shop_id)]
