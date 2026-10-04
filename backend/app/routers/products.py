from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import schemas
from app.deps import AuthContext, DbSession, PathId, require_permission
from app.serializers import inventory_tx_out, product_out
from app.services import inventory as inventory_service

router = APIRouter(prefix="/api/products", tags=["products"])

# Order, purchase and stock screens all need to pick products.
ReadAuth = Annotated[
    AuthContext,
    Depends(require_permission("orders", "inventory", "suppliers", module="inventory")),
]
InventoryAuth = Annotated[AuthContext, Depends(require_permission("inventory"))]


def _product_response(db: Session, shop_id: int, product_id: int) -> schemas.Product:
    product = inventory_service.get_product(db, shop_id, product_id)
    reserved = inventory_service.reserved_quantities(db, shop_id, [product.id])
    return product_out(product, reserved.get(product.id, 0.0))


@router.get("", response_model=list[schemas.Product])
def list_products(
    auth: ReadAuth,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(max_length=80)] = None,
    low_stock: bool | None = None,
    include_archived: bool = False,
) -> list[schemas.Product]:
    products = inventory_service.list_products(
        db,
        auth.shop_id,
        search=search,
        category=category,
        low_stock=low_stock,
        include_archived=include_archived,
    )
    reserved = inventory_service.reserved_quantities(db, auth.shop_id)
    return [product_out(product, reserved.get(product.id, 0.0)) for product in products]


@router.get("/categories", response_model=list[str])
def list_categories(auth: ReadAuth, db: DbSession) -> list[str]:
    return inventory_service.categories(db, auth.shop_id)


@router.post("", response_model=schemas.Product, status_code=201)
def create_product(
    payload: schemas.ProductInput, auth: InventoryAuth, db: DbSession
) -> schemas.Product:
    product_id = inventory_service.create_product(db, auth.shop_id, auth.user, payload).id
    db.commit()
    return _product_response(db, auth.shop_id, product_id)


@router.get("/{product_id}", response_model=schemas.Product)
def get_product(product_id: PathId, auth: InventoryAuth, db: DbSession) -> schemas.Product:
    return _product_response(db, auth.shop_id, product_id)


@router.patch("/{product_id}", response_model=schemas.Product)
def update_product(
    product_id: PathId, payload: schemas.ProductUpdate, auth: InventoryAuth, db: DbSession
) -> schemas.Product:
    product = inventory_service.get_product(db, auth.shop_id, product_id)
    inventory_service.update_product(db, product, payload)
    db.commit()
    return _product_response(db, auth.shop_id, product_id)


@router.delete("/{product_id}", response_model=schemas.OkResponse)
def archive_product(product_id: PathId, auth: InventoryAuth, db: DbSession) -> schemas.OkResponse:
    product = inventory_service.get_product(db, auth.shop_id, product_id)
    inventory_service.archive_product(db, product)
    db.commit()
    return schemas.OkResponse(ok=True)


@router.post("/{product_id}/adjust", response_model=schemas.Product)
def adjust_stock(
    product_id: PathId, payload: schemas.StockAdjustmentRequest, auth: InventoryAuth, db: DbSession
) -> schemas.Product:
    product = inventory_service.get_product(db, auth.shop_id, product_id)
    inventory_service.adjust_stock(db, product, auth.user, payload)
    db.commit()
    return _product_response(db, auth.shop_id, product_id)


@router.get("/{product_id}/transactions", response_model=list[schemas.InventoryTransaction])
def list_transactions(
    product_id: PathId, auth: InventoryAuth, db: DbSession
) -> list[schemas.InventoryTransaction]:
    product = inventory_service.get_product(db, auth.shop_id, product_id)
    return [inventory_tx_out(tx) for tx in inventory_service.product_transactions(db, product)]
