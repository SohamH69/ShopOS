from typing import Annotated

from fastapi import APIRouter, Depends

from app import schemas
from app.deps import AuthContext, CurrentAuth, DbSession, require_permission
from app.serializers import shop_out
from app.services import shop as shop_service

router = APIRouter(prefix="/api/shop", tags=["shop"])

SettingsAuth = Annotated[AuthContext, Depends(require_permission("settings"))]


@router.get("", response_model=schemas.Shop)
def get_shop(auth: CurrentAuth) -> schemas.Shop:
    return shop_out(auth.shop)


@router.patch("", response_model=schemas.Shop)
def update_shop(payload: schemas.ShopUpdate, auth: SettingsAuth, db: DbSession) -> schemas.Shop:
    shop_service.update_shop(auth.shop, payload)
    db.commit()
    return shop_out(auth.shop)  # expired by the commit, so this re-reads the saved row
