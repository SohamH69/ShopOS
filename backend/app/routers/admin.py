"""ShopOS admin API (``/api/admin``): for developers and operators, never for shop staff."""

from typing import Annotated

from fastapi import APIRouter, Query

from app import schemas
from app.deps import CurrentAdmin, DbSession, Offset, PathId
from app.services import admin as admin_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.post("/auth/login", response_model=schemas.AdminAuthResponse)
def admin_login(payload: schemas.AdminLoginRequest, db: DbSession) -> schemas.AdminAuthResponse:
    admin = admin_service.login(db, payload.email, payload.password)
    db.commit()
    return schemas.AdminAuthResponse(
        token=admin_service.issue_token(admin), admin=admin_service.admin_out(admin)
    )


@router.get("/me", response_model=schemas.AdminUser)
def admin_me(admin: CurrentAdmin) -> schemas.AdminUser:
    return admin_service.admin_out(admin)


@router.get("/stats", response_model=schemas.AdminStats)
def admin_stats(_admin: CurrentAdmin, db: DbSession) -> schemas.AdminStats:
    return admin_service.stats(db)


@router.get("/shops", response_model=schemas.Paginated[schemas.AdminShopRow])
def admin_shops(
    _admin: CurrentAdmin,
    db: DbSession,
    search: Annotated[str | None, Query(max_length=100)] = None,
    status: schemas.AdminShopStatus = "all",
    plan: schemas.Plan | None = None,
    offset: Offset = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> schemas.Paginated[schemas.AdminShopRow]:
    return admin_service.list_shops(
        db, search=search, status=status, plan=plan, offset=offset, limit=limit
    )


@router.get("/shops/{shop_id}", response_model=schemas.AdminShopDetail)
def admin_shop(shop_id: PathId, _admin: CurrentAdmin, db: DbSession) -> schemas.AdminShopDetail:
    return admin_service.shop_detail(db, admin_service.get_shop(db, shop_id))


@router.post("/shops/{shop_id}/suspend", response_model=schemas.AdminShopDetail)
def admin_suspend(
    shop_id: PathId, payload: schemas.AdminSuspendRequest, admin: CurrentAdmin, db: DbSession
) -> schemas.AdminShopDetail:
    shop = admin_service.get_shop(db, shop_id)
    admin_service.suspend(db, admin, shop, payload.reason)
    db.commit()
    return admin_service.shop_detail(db, shop)


@router.post("/shops/{shop_id}/reactivate", response_model=schemas.AdminShopDetail)
def admin_reactivate(shop_id: PathId, admin: CurrentAdmin, db: DbSession) -> schemas.AdminShopDetail:
    shop = admin_service.get_shop(db, shop_id)
    admin_service.reactivate(db, admin, shop)
    db.commit()
    return admin_service.shop_detail(db, shop)


@router.patch("/shops/{shop_id}", response_model=schemas.AdminShopDetail)
def admin_update_shop(
    shop_id: PathId, payload: schemas.AdminShopUpdate, admin: CurrentAdmin, db: DbSession
) -> schemas.AdminShopDetail:
    shop = admin_service.get_shop(db, shop_id)
    admin_service.change_plan(db, admin, shop, payload.plan)
    db.commit()
    return admin_service.shop_detail(db, shop)
